import { lstat, mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { OpenTunnelClientEvent, OpenTunnelConnection, OpenTunnelPromiseClient } from '@opentunnel/client'
import type { MobileAccessControlState, MobileAccessControlStore } from './control.js'
import type { MobileAccessGateway } from './gateway.js'
import { createVolatileRemoteControlStore } from './managed-origin.js'
import { writeManagedPrivateFile } from './managed-files.js'
import {
  DEFAULT_ORIGIN_LISTEN_PORT,
  parseOriginSettings,
  type OriginConfigStore,
  type OriginSettings,
} from './origin-proxy-config.js'
import { OriginController } from './origin-proxy.js'
import { restrictPrivateFile } from './private-file.js'
import {
  settleRemoteResources,
  type RemoteProviderController,
  type RemoteProviderStatus,
} from './remote.js'

/** Public route label requested from the OpenTunnel relay. */
export const OPENTUNNEL_ROUTE = 'dsh'
/** Loopback target the relay forwards to; the origin gateway owns this listener. */
export const OPENTUNNEL_TARGET = '127.0.0.1:' + String(DEFAULT_ORIGIN_LISTEN_PORT)
/** The relay issues its certificate on first use; allow slow provisioning. */
const CONNECT_TIMEOUT_MS = 120_000
/** Same profile name keeps the persisted identity stable across restarts. */
const OPENTUNNEL_PROFILE = 'dsh-mobile'

/** Additive subset of the promise SDK this controller depends on. */
export interface OpenTunnelSdk {
  create(options: { store: unknown }): OpenTunnelPromiseClient
  readonly OpenTunnelStorage: {
    xdg(options?: { readonly env?: NodeJS.ProcessEnv; readonly home?: string }): unknown
  }
}

/** Load the SDK lazily so a missing optional dependency never breaks DSH boot. */
export type OpenTunnelSdkLoader = () => Promise<OpenTunnelSdk>

const loadOpenTunnelSdk: OpenTunnelSdkLoader = async () => {
  const sdk = await import('@opentunnel/client')
  return sdk as unknown as OpenTunnelSdk
}

/** Persisted copy of the origin settings Opentunnel replaced, restored on disable. */
interface OriginBackup {
  readonly version: 1
  readonly publicOrigin: string
  readonly previous: OriginSettings | null
}

function parseOriginBackup(value: unknown): OriginBackup {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('opentunnel_origin_backup_invalid')
  const record = value as Record<string, unknown>
  if (record.version !== 1 || typeof record.publicOrigin !== 'string'
    || Reflect.ownKeys(record).some(key => !['version', 'publicOrigin', 'previous'].includes(String(key)))) {
    throw new Error('opentunnel_origin_backup_invalid')
  }
  return Object.freeze({
    version: 1,
    publicOrigin: record.publicOrigin,
    previous: record.previous === null ? null : parseOriginSettings(record.previous),
  })
}

/** Durable origin-backup file kept beside the provider control switch. */
class OpenTunnelOriginBackup {
  constructor(private readonly file: string, private readonly ownedRoot: string) {}

  async read(): Promise<OriginBackup | undefined> {
    let entry
    try { entry = await lstat(this.file) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
    if (!entry.isFile() || entry.isSymbolicLink() || entry.size > 16 * 1024) throw new Error('opentunnel_origin_backup_invalid')
    await restrictPrivateFile(this.file)
    let parsed: unknown
    try { parsed = JSON.parse(await readFile(this.file, 'utf8')) as unknown } catch (error) {
      throw new Error('opentunnel_origin_backup_invalid', { cause: error })
    }
    return parseOriginBackup(parsed)
  }

  async write(backup: OriginBackup): Promise<void> {
    const validated = parseOriginBackup(backup)
    await writeManagedPrivateFile(this.ownedRoot, this.file, JSON.stringify(validated) + '\n', 'opentunnel')
  }

  async clear(): Promise<void> {
    await rm(this.file, { force: true })
  }
}

/** Options owned by the desktop plugin; all filesystem and gateway work is injected. */
export interface OpenTunnelControllerOptions {
  readonly store: MobileAccessControlStore
  readonly originConfig: OriginConfigStore
  readonly createGateway: (settings: OriginSettings) => Promise<MobileAccessGateway>
  /** `$DSH_HOME/mobile-access`, the plugin's private state root. */
  readonly stateDirectory: string
  /** `$DSH_HOME/mobile-access/remote`, shared with the other remote providers. */
  readonly remoteDirectory: string
  /** Public route name; defaults to `dsh`. */
  readonly route?: string
  /** Relay target; defaults to the origin gateway listener. */
  readonly target?: string
  /** Loopback port the origin gateway binds (3444 by default). */
  readonly listenPort?: number
  readonly loadSdk?: OpenTunnelSdkLoader
  readonly onStatus?: (status: RemoteProviderStatus) => void
}

/**
 * Owns the in-process OpenTunnel bridge and the origin gateway behind it.
 *
 * Enabling creates (or resumes) a persistent tunnel identity under
 * `$DSH_HOME/mobile-access/opentunnel`, points the shared origin configuration at
 * the tunnel's public URL and starts the loopback origin gateway the pairing API
 * needs. Disabling stops both and restores the origin configuration that was in
 * place before OpenTunnel took it over, so the manual `origin` provider keeps
 * working after a switch.
 *
 * The origin settings are written through the shared {@link OriginConfigStore},
 * but OpenTunnel never drives the `origin` provider's own controller or its
 * durable switch: it owns a private throttled store and a private
 * {@link OriginController} instance. That keeps both providers independently
 * selectable while only one remote channel runs at a time.
 */
export class OpenTunnelController implements RemoteProviderController {
  private enabled = false
  private initialized = false
  private disposed = false
  private latest: RemoteProviderStatus = Object.freeze({ enabled: false, state: 'off' })
  private gatewayValue: MobileAccessGateway | undefined
  private clientValue: OpenTunnelPromiseClient | undefined
  private connectionValue: OpenTunnelConnection | undefined
  private abortController: AbortController | undefined
  private generation = 0
  private queue: Promise<void> = Promise.resolve()
  private closeTask: Promise<void> | undefined
  private readonly backup: OpenTunnelOriginBackup
  private readonly route: string
  private readonly target: string
  private readonly listenPort: number
  private readonly loadSdk: OpenTunnelSdkLoader

  constructor(private readonly options: OpenTunnelControllerOptions) {
    this.backup = new OpenTunnelOriginBackup(join(options.remoteDirectory, 'opentunnel', 'origin-backup.json'), options.stateDirectory)
    this.route = options.route ?? OPENTUNNEL_ROUTE
    this.target = options.target ?? OPENTUNNEL_TARGET
    this.listenPort = options.listenPort ?? DEFAULT_ORIGIN_LISTEN_PORT
    this.loadSdk = options.loadSdk ?? loadOpenTunnelSdk
  }

  async initialize(initialState?: MobileAccessControlState): Promise<void> {
    await this.enqueue(async () => {
      if (this.initialized) return
      if (this.disposed) throw new Error('opentunnel_controller_unavailable')
      this.enabled = (initialState ?? await this.options.store.load()).enabled
      this.initialized = true
      if (this.enabled) await this.start()
      else this.publish({ enabled: false, state: 'off' })
    })
  }

  gateway(): MobileAccessGateway | undefined { return this.gatewayValue }
  status(): RemoteProviderStatus { return this.latest }

  async setEnabled(enabled: boolean): Promise<RemoteProviderStatus> {
    this.assertAvailable()
    await this.enqueue(async () => {
      this.assertAvailable()
      if (this.enabled === enabled && (!enabled || this.gatewayValue !== undefined)) return
      if (!enabled) await this.stop()
      await this.options.store.save({ version: 1, enabled })
      this.enabled = enabled
      if (enabled) await this.start()
      else this.publish({ enabled: false, state: 'off' })
    })
    return this.status()
  }

  async reconnect(): Promise<RemoteProviderStatus> {
    this.assertAvailable()
    await this.enqueue(async () => {
      this.assertAvailable()
      await this.stop()
      if (!this.enabled) {
        await this.options.store.save({ version: 1, enabled: true })
        this.enabled = true
      }
      await this.start()
    })
    return this.status()
  }

  /** Reset the switch, keeping the persistent tunnel identity and the backup file. */
  async reset(): Promise<RemoteProviderStatus> { return this.setEnabled(false) }

  /** Stop the tunnel and gateway without changing the durable switch. */
  close(): Promise<void> {
    this.disposed = true
    this.closeTask ??= this.enqueue(async () => { await this.stop() })
    return this.closeTask
  }

  private assertAvailable(): void {
    if (!this.initialized || this.disposed) throw new Error('opentunnel_controller_unavailable')
  }

  private publish(status: RemoteProviderStatus): void {
    this.latest = Object.freeze({ ...status })
    try { this.options.onStatus?.(this.latest) } catch { /* Observers never own the tunnel. */ }
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const task = this.queue.then(operation, operation)
    this.queue = task.then(() => undefined, () => undefined)
    return task
  }

  private async start(): Promise<void> {
    const generation = ++this.generation
    this.publish({ enabled: true, state: 'starting' })
    let sdk: OpenTunnelSdk
    try { sdk = await this.loadSdk() } catch {
      this.publish({ enabled: true, state: 'error', errorCode: 'opentunnel_sdk_missing' })
      return
    }
    if (this.disposed || generation !== this.generation) return

    let client: OpenTunnelPromiseClient
    try {
      await mkdir(join(this.options.stateDirectory, 'opentunnel'), { recursive: true, mode: 0o700 })
      const store = sdk.OpenTunnelStorage.xdg({
        env: { ...process.env, XDG_DATA_HOME: this.options.stateDirectory },
        home: this.options.stateDirectory,
      })
      client = sdk.create({ store })
    } catch {
      this.publish({ enabled: true, state: 'error', errorCode: 'opentunnel_identity_failed' })
      return
    }
    this.clientValue = client
    if (this.disposed || generation !== this.generation) {
      await client.dispose().catch(() => undefined)
      return
    }

    const abort = new AbortController()
    this.abortController = abort
    const timer = setTimeout(() => { abort.abort(new Error('opentunnel_timeout')) }, CONNECT_TIMEOUT_MS)
    timer.unref()
    let connection: OpenTunnelConnection
    try {
      connection = await client.tunnel.connect({
        profile: OPENTUNNEL_PROFILE,
        routes: { [this.route]: this.target },
        signal: abort.signal,
        onRouteConflict: 'retry',
        onEvent: event => { this.handleEvent(event, generation) },
      })
    } catch (error) {
      clearTimeout(timer)
      this.abortController = undefined
      if (this.disposed || generation !== this.generation) { await this.disposeClient(client); return }
      const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
        ? error.code : ''
      const errorCode = abort.signal.aborted ? 'opentunnel_timeout'
        : code === 'route_conflict' ? 'opentunnel_route_conflict' : 'opentunnel_connect_failed'
      this.publish({ enabled: true, state: 'error', errorCode })
      await this.disposeClient(client)
      return
    } finally {
      clearTimeout(timer)
    }
    this.abortController = undefined
    this.connectionValue = connection
    if (this.disposed || generation !== this.generation) {
      await this.disposeTunnel()
      return
    }

    const publicUrl = connection.urls[this.route]
    let publicOrigin: string
    try {
      publicOrigin = parseOriginSettings({
        version: 1,
        publicOrigin: publicUrl,
        listenHost: '127.0.0.1',
        listenPort: this.listenPort,
        allowedCidrs: ['127.0.0.0/8'],
      }).publicOrigin
    } catch {
      this.publish({ enabled: true, state: 'error', errorCode: 'opentunnel_connect_failed' })
      await this.disposeTunnel()
      return
    }

    try {
      await this.takeOverOrigin(publicOrigin)
      await this.startOrigin()
    } catch {
      if (generation === this.generation && !this.disposed) {
        this.publish({ enabled: true, state: 'error', errorCode: 'opentunnel_gateway_failed' })
      }
      await this.disposeTunnel()
      return
    }
    if (this.disposed || generation !== this.generation) { await this.disposeTunnel(); return }
    this.publish({
      enabled: true,
      state: 'ready',
      origin: publicOrigin,
      ...(this.originBackend === undefined ? {} : { backendOrigin: this.originBackend }),
    })
  }

  /** Backend origin of the private gateway, cached for status reporting. */
  private originBackend: string | undefined

  private async takeOverOrigin(publicOrigin: string): Promise<void> {
    const settings = Object.freeze({
      version: 1 as const,
      publicOrigin,
      listenHost: '127.0.0.1',
      listenPort: this.listenPort,
      allowedCidrs: Object.freeze(['127.0.0.0/8']),
    })
    // Only record the pre-OpenTunnel settings once, so a reconnect after a
    // restart cannot overwrite the user's original configuration with ours.
    const existing = await this.backup.read()
    if (existing === undefined) {
      const previous = this.options.originConfig.settings() ?? null
      await this.backup.write({ version: 1, publicOrigin, previous })
    }
    await this.options.originConfig.configure(settings)
  }

  private async startOrigin(): Promise<void> {
    const controller = new OriginController({
      store: createVolatileRemoteControlStore(),
      config: this.options.originConfig,
      createGateway: this.options.createGateway,
      onStatus: status => {
        if (status.state === 'ready' && status.backendOrigin !== undefined) this.originBackend = status.backendOrigin
      },
    })
    this.originController = controller
    await controller.initialize()
    const status = await controller.setEnabled(true)
    if (status.state !== 'ready' || controller.gateway() === undefined) {
      this.originBackend = undefined
      await controller.close().catch(() => undefined)
      this.originController = undefined
      throw new Error(status.errorCode ?? 'opentunnel_gateway_failed')
    }
    this.gatewayValue = controller.gateway()
    this.originBackend = status.backendOrigin
  }

  private originController: OriginController | undefined

  private handleEvent(event: OpenTunnelClientEvent, generation: number): void {
    if (this.disposed || generation !== this.generation) return
    if (event.type === 'connected') {
      if (this.gatewayValue !== undefined) {
        this.publish({
          enabled: true, state: 'ready',
          ...(this.latest.origin === undefined ? {} : { origin: this.latest.origin }),
          ...(this.originBackend === undefined ? {} : { backendOrigin: this.originBackend }),
        })
      }
      return
    }
    if (event.type === 'reconnecting' || event.type === 'disconnected' || event.type === 'connecting') {
      this.publish({
        enabled: true, state: 'connecting',
        ...(this.latest.origin === undefined ? {} : { origin: this.latest.origin }),
      })
      return
    }
    if (event.type === 'route-conflict') {
      this.publish({
        enabled: true, state: 'connecting', errorCode: 'opentunnel_route_conflict',
        ...(this.latest.origin === undefined ? {} : { origin: this.latest.origin }),
      })
      return
    }
    if (event.type === 'stopped') {
      this.publish({
        enabled: true, state: 'error', errorCode: 'opentunnel_stopped',
        ...(this.latest.origin === undefined ? {} : { origin: this.latest.origin }),
      })
    }
  }

  private async stop(): Promise<void> {
    this.generation += 1
    this.abortController?.abort(new Error('opentunnel_stopped'))
    this.abortController = undefined
    await settleRemoteResources([
      () => this.stopOriginGateway(),
      () => this.disposeTunnel(),
    ])
    await this.restoreOrigin()
    this.publish({ enabled: this.enabled, state: 'off' })
  }

  private async stopOriginGateway(): Promise<void> {
    const controller = this.originController
    this.originController = undefined
    this.gatewayValue = undefined
    this.originBackend = undefined
    if (controller === undefined) return
    await controller.close()
  }

  private async disposeTunnel(): Promise<void> {
    const connection = this.connectionValue
    this.connectionValue = undefined
    const client = this.clientValue
    this.clientValue = undefined
    if (connection !== undefined) await connection.close().catch(() => undefined)
    if (client !== undefined) await this.disposeClient(client)
  }

  private async disposeClient(client: OpenTunnelPromiseClient): Promise<void> {
    await client.dispose().catch(() => undefined)
  }

  private async restoreOrigin(): Promise<void> {
    const backup = await this.backup.read()
    if (backup === undefined) return
    if (backup.previous === null) await this.options.originConfig.purge()
    else await this.options.originConfig.configure(backup.previous)
    await this.backup.clear()
  }
}
