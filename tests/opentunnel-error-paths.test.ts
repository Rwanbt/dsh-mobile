import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JsonMobileAccessControlStore } from '../src/control.js'
import { OpenTunnelController } from '../src/opentunnel.js'
import type { OriginConfigStore, OriginSettings } from '../src/origin-proxy-config.js'

const roots: string[] = []
const controllers: OpenTunnelController[] = []

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(async () => {
  for (const controller of controllers.splice(0)) await controller.close().catch(() => undefined)
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture(options: {
  loadSdk: () => Promise<never | { create: () => unknown }>
  enabled?: boolean
  originConfig?: unknown
  createGateway?: () => Promise<unknown>
}): Promise<{ controller: OpenTunnelController; store: JsonMobileAccessControlStore; root: string; configure: ReturnType<typeof vi.fn> }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-opentunnel-test-'))
  roots.push(root)
  const store = new JsonMobileAccessControlStore(join(root, 'control.json'), false)
  await store.save({ version: 1, enabled: options.enabled ?? false })
  const configure = vi.fn(async () => undefined)
  const controller = new OpenTunnelController({
    store,
    originConfig: (options.originConfig ?? { settings: () => undefined, configure }) as unknown as OriginConfigStore,
    createGateway: (options.createGateway ?? (async () => { throw new Error('gateway must not start in an error-path test') })) as never,
    stateDirectory: root,
    remoteDirectory: join(root, 'remote'),
    loadSdk: options.loadSdk as never,
  })
  controllers.push(controller)
  return { controller, store, root, configure }
}

describe('OpenTunnel controller error paths', () => {
  it('stays off when disabled, without loading the SDK', async () => {
    const loadSdk = vi.fn(async () => { throw new Error('SDK must not load') })
    const { controller } = await fixture({ loadSdk })
    await controller.initialize()
    expect(controller.status()).toMatchObject({ enabled: false, state: 'off' })
    expect(controller.gateway()).toBeUndefined()
    expect(loadSdk).not.toHaveBeenCalled()
  })

  it('reports a missing SDK and persists the switch', async () => {
    const { controller, store } = await fixture({
      loadSdk: async () => { throw new Error('fixture missing sdk') },
    })
    await controller.initialize()
    const status = await controller.setEnabled(true)
    expect(status).toMatchObject({ enabled: true, state: 'error', errorCode: 'opentunnel_sdk_missing' })
    await expect(store.load()).resolves.toMatchObject({ version: 1, enabled: true })
    expect(controller.gateway()).toBeUndefined()
  })

  it('maps a route conflict and disposes the client', async () => {
    const dispose = vi.fn(async () => undefined)
    const connect = vi.fn(async () => { throw Object.assign(new Error('conflict'), { code: 'route_conflict' }) })
    const { controller } = await fixture({
      loadSdk: async () => ({
        OpenTunnelStorage: { xdg: () => ({}) },
        create: () => ({ tunnel: { connect }, dispose }),
      }) as never,
    })
    await controller.initialize()
    const status = await controller.setEnabled(true)
    expect(status).toMatchObject({ enabled: true, state: 'error', errorCode: 'opentunnel_route_conflict' })
    expect(connect).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('rejects a non-HTTPS relay URL without configuring the origin', async () => {
    const close = vi.fn(async () => undefined)
    const { controller, configure } = await fixture({
      loadSdk: async () => ({
        OpenTunnelStorage: { xdg: () => ({}) },
        create: () => ({
          tunnel: { connect: async () => ({ urls: { dsh: 'http://insecure.example' }, close }) },
          dispose: async () => undefined,
        }),
      }) as never,
    })
    await controller.initialize()
    const status = await controller.setEnabled(true)
    expect(status).toMatchObject({ enabled: true, state: 'error', errorCode: 'opentunnel_connect_failed' })
    expect(configure).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledTimes(1)
    expect(controller.gateway()).toBeUndefined()
  })

  it('takes over the origin, becomes ready and restores the previous origin on disable', async () => {
    const previous: OriginSettings = {
      version: 1,
      publicOrigin: 'https://previous.example',
      listenHost: '127.0.0.1',
      listenPort: 3444,
      allowedCidrs: ['127.0.0.0/8'],
    }
    let current: OriginSettings | undefined = previous
    const configure = vi.fn(async (settings: OriginSettings) => { current = settings })
    const purge = vi.fn(async () => { current = undefined })
    const closeGateway = vi.fn(async () => undefined)
    const closeConnection = vi.fn(async () => undefined)
    const gateway = { address: () => ({ port: 3456 }), close: closeGateway }
    const { controller, root } = await fixture({
      originConfig: { settings: () => current, configure, purge },
      createGateway: async () => gateway,
      loadSdk: async () => ({
        OpenTunnelStorage: { xdg: () => ({}) },
        create: () => ({
          tunnel: { connect: async () => ({ urls: { dsh: 'https://relay.example' }, close: closeConnection }) },
          dispose: async () => undefined,
        }),
      }) as never,
    })
    await controller.initialize()
    const ready = await controller.setEnabled(true)
    expect(ready).toMatchObject({ enabled: true, state: 'ready', origin: 'https://relay.example', backendOrigin: 'http://127.0.0.1:3456' })
    expect(current?.publicOrigin).toBe('https://relay.example')
    expect(controller.gateway()).toBe(gateway)
    const backupPath = join(root, 'remote', 'opentunnel', 'origin-backup.json')
    await expect(access(backupPath)).resolves.toBeUndefined()
    const backup = JSON.parse(await readFile(backupPath, 'utf8')) as { publicOrigin?: string; previous?: { publicOrigin?: string } }
    expect(backup.publicOrigin).toBe('https://relay.example')
    expect(backup.previous?.publicOrigin).toBe('https://previous.example')

    const off = await controller.setEnabled(false)
    expect(off).toMatchObject({ enabled: false, state: 'off' })
    expect(current).toEqual(previous)
    expect(purge).not.toHaveBeenCalled()
    expect(closeGateway).toHaveBeenCalledTimes(1)
    expect(closeConnection).toHaveBeenCalledTimes(1)
    await expect(access(backupPath)).rejects.toThrow()
  })

  it('does not accept operations after close', async () => {
    const { controller } = await fixture({ loadSdk: async () => { throw new Error('sdk') } })
    await controller.initialize()
    await controller.close()
    await expect(controller.setEnabled(true)).rejects.toThrow('opentunnel_controller_unavailable')
  })
})


