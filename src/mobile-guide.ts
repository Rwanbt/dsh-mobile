/**
 * Instructions handed to the DSH agent when the user runs `/mobile <task>`.
 * The agent edits files under the DSH home; this text is what tells it the
 * layout of the mobile-access customization surface so it does not guess.
 *
 * A snapshot of the current customization state (whether mobile.css /
 * mobile.js exist and which extensions are installed) is injected at the
 * top of the guide so the agent does not overwrite earlier work blindly.
 *
 * The guide is written in the DSH display language so the injected context
 * matches the rest of the conversation: French DSH gets a French guide,
 * Chinese DSH keeps the original Chinese body, and every other language falls
 * back to English.
 */

/** Locales the customization guide can be produced in. */
export type MobileGuideLocale = 'en' | 'fr' | 'it' | 'zh'

/** One installed extension as seen by the agent. */
export interface MobileGuideExtensionState {
  readonly id: string
  readonly name: string
  readonly version: string
  /** Current local Host execution, omitted for ordinary Cordis-provided extensions. */
  readonly executionMode?: 'in-process' | 'worker'
  /** A stopped Worker needs explicit recovery; editing files is not a recovery action. */
  readonly executionState?: 'ready' | 'unavailable'
}

/** Customization facts collected before steering the agent. */
export interface MobileGuideState {
  /** Absolute path of the mobile-access directory the agent edits. */
  readonly directory: string
  /** True when the user's mobile.css exists (a custom style override). */
  readonly hasCustomCss: boolean
  /** True when the user's mobile.js exists (a custom script override). */
  readonly hasCustomJs: boolean
  /** Extensions currently installed under extensions/. */
  readonly extensions: readonly MobileGuideExtensionState[]
  /** Extensions whose host failed to activate. */
  readonly failedExtensionCount: number
}

/**
 * Resolve the DSH display language for host-generated copy.
 *
 * DSH is not required to export its UI locale to plugins, so this reads the
 * usual process locale variables first (an operator can pin `DSH_LOCALE`) and
 * falls back to the runtime's default Intl locale. Unknown languages use
 * English, never Chinese.
 *
 * @param environment - process environment used for the lookup.
 * @param runtimeLocale - optional Intl locale override (tests and hosts).
 * @returns Supported guide locale.
 */
export function resolveHostLocale(
  environment: NodeJS.ProcessEnv = process.env,
  runtimeLocale: string = Intl.DateTimeFormat().resolvedOptions().locale,
): MobileGuideLocale {
  const candidates = [environment.DSH_LOCALE, environment.LC_ALL, environment.LC_MESSAGES, environment.LANG, runtimeLocale]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim() === '') continue
    const base = candidate.trim().toLowerCase().split(/[-_.]/u)[0]
    if (base === 'fr' || base === 'it' || base === 'zh' || base === 'en') return base
  }
  return 'en'
}

const ZH_BODY = `你在为用户定制 DSH Mobile 的手机端。DSH Mobile 是一个把电脑上的 DeepSeek Harness 带到手机浏览器的插件，手机端界面和能力都来自本机文件。

所有改动只允许在 $DSH_HOME/mobile-access/ 目录内进行，绝不修改 DeepSeek Harness 的源码或其他目录。$DSH_HOME 是 DeepSeek Harness 的配置目录（通常为 ~/.dsh），先确认它的实际路径再操作。

手机端的能力分两层，按用户需求选择改动目标：

1. 界面与交互 —— 只改外观和交互，不需要碰电脑的文件或程序：
   - $DSH_HOME/mobile-access/mobile.css：手机端样式
   - $DSH_HOME/mobile-access/mobile.js：手机端脚本，用 window.dshMobile.register(({ root }) => { ... }) 把内容挂载到 root，返回清理函数
   - 保存后已配对的 DSH Mobile 页面会自动检查并应用，无需重启；文件存在不表示某个页面已成功加载

定制资源通过 DSH Mobile Gateway 的移动配对会话认证。普通 DSH 网页的登录凭据不等于移动配对凭据；直接打开普通 DSH 地址或仅用手机视口预览，不能据此验证 mobile.css / mobile.js。若扩展 manifest 返回 401，页面不会继续加载定制样式与脚本；先确认是通过“移动访问”配对入口进入，并检查实际请求与页面中的定制样式，不要盲改 CSS 或放松认证。核对 Cookie 时只确认是否存在，不读取或公开其值。

动手前先读已有的定制文件。若要调整 DSH 自带的输入框、侧栏或设置等现有界面，先确认当前 DSH 版本与手机页面模式（专用移动页面或 ?frontend=stock），只读核对运行页面的 DOM、属性和样式；本机有同版本前端源码时可参考相应组件，没有源码时可查看已安装的客户端产物，不必下载源码。优先使用扩展 API、插槽和稳定的 data-* 标记，不凭猜测依赖构建类名。只读查看不改变前述写入范围。

旧 CSS 可能覆盖新版内置修复。先备份并在同一会话、方向和字号下对比有无该样式，不要无症状叠加旧补丁。CSS Modules 的后缀／子串匹配必须限定到已核对的区域祖先，例如 [data-dsh-mobile-header] [class*="_titleRow"]；不要裸匹配整页。display: none 会让其中的操作不可用，不得把隐藏功能描述成折叠。

2. 电脑端能力 —— 手机需要读电脑文件、执行命令或访问硬件时，创建扩展：
   - 目录：$DSH_HOME/mobile-access/extensions/<id>/，id 用小写字母数字和连字符（如 media-remote）
   - extension.json：{"schemaVersion":1,"id":"<id>","name":"显示名","version":"0.1.0","description":"说明"}
   - host.mjs：电脑端 Node.js 代码（可信本地代码，可读写文件、执行命令）。导出默认函数 (api) => { ... }，用 api.action('名称', { input, run }) 注册动作、api.route({ method, path, handle }) 注册路由、api.effect(fn) 注册清理。input 可以直接使用 api.schema.object(...) 等 Schemastery schema，也可以传入带 parse(value) 的适配器；两种形式都会在动作执行前校验并规范化输入。
   - 执行方式见上方实际状态。默认 in-process；插件配置可按扩展选择 worker。Worker 中 api.context 只有 logger，不能调用 Cordis 服务；api.manifest、schema、action、route、effect 仍可用。不要把需要 Cordis 的扩展偷偷改成 Worker，也不要在 extension.json 中添加执行模式字段。
   - 动作与路由的执行有时间预算：默认 30 秒（输入校验也计入），可用 api.action('名称', { input, run, timeoutMs }) 或 api.route({ ..., timeoutMs }) 按操作覆盖（1–300000 的整数毫秒）。超时或调用方取消后，调用方收到 500 extension_action_timeout / extension_route_timeout（或取消原因）；这只表示调用方不再等待，底层代码可能仍在运行并已产生副作用，请在 run / handle 中响应 signal 实现协作式取消。路由的预算到 handle() 返回响应为止，不影响已返回流的存活。若某扩展存在调用方已离开（超时或取消）但仍未结束的操作，后续对该扩展的新调用会收到 503 extension_busy，直到该操作真正结束。
   - mobile.js：手机端脚本，用 window.dshMobile.define({ apiVersion:1, id:'<id>', activate(api) { ... } })，activate 返回清理函数
   - mobile.css：手机端样式（可选）
   - assets/：手机端静态资源（可选）
   - mobile.js 里用 api.host.invoke('动作名', 输入) 调 host.mjs 的 action（请求会按 application/json 发送），api.host.fetch('/路由路径') 调 route，api.host.assetUrl('相对路径') 生成与当前版本绑定的资源地址
   - DSH Web 可先用命令生成模板：dsh plugin --profile web exec dsh-mobile extension create <id> --name "<名称>"，再在模板上改；Desktop 请在上方实际定制目录创建文件，不要误改 Web profile

附件功能优先复用 DSH 自带的文件上传。扩展若需向输入框模拟文件拖放，dataTransfer 除了 files，还须有可迭代的 items（DataTransferItemList），文件项应提供 kind、type 和 getAsFile()；不能只拼一个 files 数组。原生 DataTransfer / DragEvent 可用时优先使用，并通过 items.add(file) 填充文件；还要验证 effectAllowed / dropEffect 能否按投递逻辑读写，不能只检查构造函数是否存在。不完整的 WebView 需要保留这些能力的兼容实现。dragover 接受或事件派发成功不代表附件已加入，须检查 DSH 输入框草稿中的附件与解码后的图片预览；不要用电脑端附件目录的文件数量或修改时间代替这项验证。

安全约束：
- host.mjs 拥有电脑用户的完整权限，绝不能放入不可信代码，也不要让手机端无条件执行任意命令
- in-process 的同步阻塞会卡住网关事件循环，超时不能打断；Worker 可约束 JavaScript 阻塞，但不是安全沙箱，不约束全部原生内存，也不回滚副作用。两种模式都应响应 signal，避免编写不可取消的同步循环
- Worker 终止后其他未完成调用会失败，已开始的操作不会自动重试。相同内容的停止实例需要操作者在电脑端“移动访问 → 扩展需要重启”中确认恢复；不要通过无意义改文件或自动重放原动作实现恢复
- 所有改动只限 $DSH_HOME/mobile-access/，不要动 DeepSeek Harness 源码

完成前请自检：
- 改动涉及 mobile.js 或扩展的 mobile.js / host.mjs 时，先做语法检查再保存（如 node --check <file>），确保没有语法错误
- 改动 DSH 现有界面后尽可能在实际手机页面核对效果；无法观察运行页面时，明确告诉用户尚未实测
- 创建或修改扩展后，确认 extension.json 的 schemaVersion 为 1、id 与目录名一致、且 id 只含小写字母数字和连字符
- 扩展的 host.mjs 若在完成前无法激活，先修正而不是留下损坏的扩展
- 完成后检查自己实际写入了哪些文件，向用户简要说明改了什么、手机端会有什么变化`

interface GuideCopy {
  readonly cssPresent: string
  readonly cssAbsent: string
  readonly jsPresent: string
  readonly jsAbsent: string
  readonly extensionsEmpty: string
  readonly extensionUnavailable: string
  readonly failure: (count: number) => string
  readonly body: string
}

const COPY: Record<MobileGuideLocale, GuideCopy> = {
  en: {
    cssPresent: 'present (file detected; verify it loads on a paired page)',
    cssAbsent: 'absent (built-in default styles are used)',
    jsPresent: 'present (file detected; verify it loads on a paired page)',
    jsAbsent: 'absent (no custom script)',
    extensionsEmpty: '(none)',
    extensionUnavailable: ' · currently unavailable, needs an explicit extension restart',
    failure: count => `Note: the desktop host of ${count} extension(s) failed to activate. Before editing a related extension, check its host.mjs and extension.json.`,
    body: `You are customizing the mobile side of DSH Mobile for the user. DSH Mobile is a plugin that brings DeepSeek Harness from this computer to a phone browser; the mobile UI and capabilities come from files on this computer.

All edits are allowed only inside $DSH_HOME/mobile-access/. Never modify DeepSeek Harness sources or any other directory. $DSH_HOME is the DeepSeek Harness configuration directory (usually ~/.dsh); confirm its real path before editing.

The mobile side has two layers; pick the right target from the user request:

1. UI and interaction — appearance and behaviour only, no computer files or programs involved:
   - $DSH_HOME/mobile-access/mobile.css: mobile styles
   - $DSH_HOME/mobile-access/mobile.js: mobile script; mount content on root with window.dshMobile.register(({ root }) => { ... }) and return a cleanup function
   - Paired DSH Mobile pages check and apply saved files automatically without a restart; a file existing does not prove that a page loaded it

Customization resources are authenticated through the DSH Mobile Gateway's mobile pairing session. Ordinary DSH web login credentials are not mobile pairing credentials; opening the plain DSH address or previewing with a phone viewport does not verify mobile.css / mobile.js. If an extension manifest answers 401, the page stops loading custom styles and scripts; first confirm you entered through the Mobile access pairing entry and inspect the actual requests and the custom styles in the page instead of guessing at CSS or loosening authentication. When checking cookies, only confirm presence; never read or reveal their values.

Read existing customization files before acting. To adjust DSH's own composer, sidebar, settings and other built-in UI, first confirm the current DSH version and mobile page mode (dedicated mobile page or ?frontend=stock), and inspect the running page DOM, attributes and styles in read-only mode; if same-version frontend sources are available locally, consult the matching components, otherwise inspect the installed client artifact — do not download sources. Prefer extension APIs, slots and stable data-* markers; do not guess build class names. Read-only inspection does not change the write scope above.

Old CSS may override newer built-in fixes. Back up first, and compare with and without the style in the same session, orientation and font size; do not pile old patches on without symptoms. CSS Modules suffix/substring selectors must be scoped to a verified area ancestor, for example [data-dsh-mobile-header] [class*="_titleRow"]; never match the whole page. display: none disables the controls inside, so never describe hidden functionality as collapsed.

2. Computer capabilities — when the phone must read files, run commands or use hardware on the computer, create an extension:
   - Directory: $DSH_HOME/mobile-access/extensions/<id>/, id in lowercase letters, digits and dashes (e.g. media-remote)
   - extension.json: {"schemaVersion":1,"id":"<id>","name":"display name","version":"0.1.0","description":"description"}
   - host.mjs: desktop Node.js code (trusted local code; may read/write files and run commands). Export a default function (api) => { ... } and use api.action('name', { input, run }) for actions, api.route({ method, path, handle }) for routes and api.effect(fn) for cleanup. input accepts api.schema.object(...) and similar Schemastery schemas, or an adapter with parse(value); both are validated and normalized before the action runs.
   - Execution mode is shown in the actual state above. Default is in-process; the plugin config can select a worker per extension. In a Worker api.context only has logger and cannot call Cordis services; api.manifest, schema, action, route and effect remain available. Do not secretly change a Cordis-dependent extension to a Worker, and do not add an execution-mode field to extension.json.
   - Actions and routes have a time budget: 30 seconds by default (input validation included); override per operation with api.action('name', { input, run, timeoutMs }) or api.route({ ..., timeoutMs }) (integer 1–300000 ms). After a timeout or caller cancellation the caller receives 500 extension_action_timeout / extension_route_timeout (or the cancellation reason); this only means the caller stopped waiting — the underlying code may still be running and may already have produced side effects, so respond to signal in run / handle for cooperative cancellation. A route's budget runs until handle() returns a response and does not affect already-returned streams. If a caller left (timeout or cancellation) while an operation for an extension is still running, later calls to that extension receive 503 extension_busy until the operation really ends.
   - mobile.js: mobile script; use window.dshMobile.define({ apiVersion:1, id:'<id>', activate(api) { ... } }), activate returns a cleanup function
   - mobile.css: mobile styles (optional)
   - assets/: static mobile assets (optional)
   - In mobile.js call host actions with api.host.invoke('action', input) (requests are sent as application/json), routes with api.host.fetch('/route'), and version-bound asset URLs with api.host.assetUrl('relative/path')
   - The DSH Web profile can generate the template with: dsh plugin --profile web exec dsh-mobile extension create <id> --name "<name>", then edit the template; on Desktop create the files in the actual customization directory above, and do not edit the Web profile by mistake.

Prefer DSH's built-in file upload for attachments. If an extension simulates file drops into the composer, dataTransfer must carry iterable items (DataTransferItemList) with files, and each file item must expose kind, type and getAsFile(); a bare files array is not enough. Use native DataTransfer / DragEvent when available, fill them through items.add(file), and verify effectAllowed / dropEffect can be read and written through the drop logic instead of only checking that the constructor exists. Incomplete WebViews need these compatibility implementations. A successful dragover acceptance or event dispatch does not mean the attachment was added: check the attachments in the DSH composer draft and the decoded image preview, and never substitute the file count or modification time in the desktop attachments directory for that verification.

Security constraints:
- host.mjs holds the full permissions of the computer user; never put untrusted code in it and never let the phone run arbitrary commands unconditionally
- in-process synchronous blocking stalls the gateway event loop and timeouts cannot interrupt it; a Worker constrains JavaScript blocking but is not a security sandbox, does not bound all native memory and does not roll back side effects. Both modes must respond to signal; do not write uninterruptible synchronous loops
- When a Worker terminates, other unfinished calls fail and started operations are not retried automatically. A stopped instance with identical content needs a human to confirm recovery in “Mobile access → extension needs a restart” on the computer; do not recover by pointlessly editing files or replaying the original action
- All edits are limited to $DSH_HOME/mobile-access/; never touch DeepSeek Harness sources

Self-check before finishing:
- When the change involves mobile.js or an extension's mobile.js / host.mjs, syntax-check before saving (for example node --check <file>) so no syntax errors remain
- After changing DSH's built-in UI, verify the result on an actual phone page when possible; when you cannot observe the running page, tell the user clearly that it was not tested live
- After creating or changing an extension, confirm extension.json has schemaVersion 1, the id matches the directory name, and the id contains only lowercase letters, digits and dashes
- If an extension's host.mjs cannot activate before you finish, fix it instead of leaving a broken extension behind
- When done, check which files you actually wrote and briefly tell the user what changed and what will change on the mobile page`,
  },
  fr: {
    cssPresent: 'présent (fichier détecté ; vérifier son chargement sur une page appairée)',
    cssAbsent: 'absent (les styles par défaut intégrés sont utilisés)',
    jsPresent: 'présent (fichier détecté ; vérifier son chargement sur une page appairée)',
    jsAbsent: 'absent (aucun script personnalisé)',
    extensionsEmpty: '(aucune)',
    extensionUnavailable: ' · actuellement indisponible, nécessite un redémarrage explicite de l’extension',
    failure: count => `Remarque : l’hôte de bureau de ${count} extension(s) n’a pas pu s’activer. Avant de modifier une extension concernée, vérifiez son host.mjs et son extension.json.`,
    body: `Vous personnalisez la partie mobile de DSH Mobile pour l’utilisateur. DSH Mobile est un plugin qui amène DeepSeek Harness de cet ordinateur vers un navigateur de téléphone ; l’interface mobile et ses capacités proviennent de fichiers situés sur cet ordinateur.

Toute modification est autorisée uniquement dans $DSH_HOME/mobile-access/. Ne modifiez jamais les sources de DeepSeek Harness ni un autre répertoire. $DSH_HOME est le répertoire de configuration de DeepSeek Harness (généralement ~/.dsh) ; confirmez son chemin réel avant toute action.

La partie mobile comporte deux couches ; choisissez la cible d’après la demande de l’utilisateur :

1. Interface et interaction — uniquement l’apparence et le comportement, sans toucher aux fichiers ni aux programmes de l’ordinateur :
   - $DSH_HOME/mobile-access/mobile.css : styles mobiles
   - $DSH_HOME/mobile-access/mobile.js : script mobile ; montez le contenu sur root avec window.dshMobile.register(({ root }) => { ... }) et renvoyez une fonction de nettoyage
   - Les pages DSH Mobile appairées vérifient et appliquent automatiquement les fichiers enregistrés, sans redémarrage ; l’existence d’un fichier ne prouve pas qu’une page l’a chargé

Les ressources de personnalisation sont authentifiées par la session d’appairage mobile de la passerelle DSH Mobile. Les identifiants de connexion web DSH ordinaires ne sont pas des identifiants d’appairage mobile ; ouvrir l’adresse DSH simple ou prévisualiser avec une fenêtre de téléphone ne vérifie pas mobile.css / mobile.js. Si le manifeste d’une extension répond 401, la page cesse de charger les styles et scripts personnalisés ; commencez par confirmer que vous êtes entré par l’entrée d’appairage Accès mobile et inspectez les requêtes réelles et les styles personnalisés de la page au lieu de deviner le CSS ou d’assouplir l’authentification. Pour les cookies, vérifiez seulement leur présence ; ne lisez et ne révélez jamais leur valeur.

Lisez les fichiers de personnalisation existants avant d’agir. Pour ajuster l’interface intégrée de DSH (composeur, barre latérale, réglages, etc.), confirmez d’abord la version DSH actuelle et le mode de page mobile (page mobile dédiée ou ?frontend=stock), puis inspectez en lecture seule le DOM, les attributs et les styles de la page en cours ; si des sources frontend de même version sont disponibles localement, consultez les composants correspondants, sinon examinez l’artefact client installé — ne téléchargez pas de sources. Privilégiez les API d’extension, les slots et les marqueurs data-* stables ; ne devinez pas les noms de classes de build. L’inspection en lecture seule ne modifie pas le périmètre d’écriture ci-dessus.

Un ancien CSS peut masquer les correctifs récents. Sauvegardez d’abord, puis comparez avec et sans le style dans la même session, la même orientation et la même taille de police ; n’empilez pas d’anciens correctifs sans symptôme. Les sélecteurs suffixe/sous-chaîne de CSS Modules doivent être limités à un ancêtre de zone vérifié, par exemple [data-dsh-mobile-header] [class*="_titleRow"] ; ne ciblez jamais la page entière. display: none rend les actions qu’il contient inutilisables : ne présentez jamais une fonctionnalité masquée comme repliée.

2. Capacités de l’ordinateur — lorsque le téléphone doit lire des fichiers, exécuter des commandes ou utiliser le matériel de l’ordinateur, créez une extension :
   - Répertoire : $DSH_HOME/mobile-access/extensions/<id>/, id en minuscules, chiffres et tirets (ex. media-remote)
   - extension.json : {"schemaVersion":1,"id":"<id>","name":"nom affiché","version":"0.1.0","description":"description"}
   - host.mjs : code Node.js côté ordinateur (code local de confiance ; peut lire/écrire des fichiers et exécuter des commandes). Exportez une fonction par défaut (api) => { ... } et utilisez api.action('nom', { input, run }) pour les actions, api.route({ method, path, handle }) pour les routes et api.effect(fn) pour le nettoyage. input accepte api.schema.object(...) et les schémas Schemastery similaires, ou un adaptateur avec parse(value) ; les deux sont validés et normalisés avant l’exécution de l’action.
   - Le mode d’exécution figure dans l’état réel ci-dessus. Par défaut in-process ; la configuration du plugin peut choisir un worker par extension. Dans un Worker, api.context n’a que logger et ne peut pas appeler les services Cordis ; api.manifest, schema, action, route et effect restent disponibles. Ne transformez pas discrètement une extension dépendante de Cordis en Worker et n’ajoutez pas de champ de mode d’exécution dans extension.json.
   - Les actions et routes ont un budget de temps : 30 secondes par défaut (validation des entrées comprise) ; remplacez-le par opération avec api.action('nom', { input, run, timeoutMs }) ou api.route({ ..., timeoutMs }) (entier 1–300000 ms). Après un dépassement ou une annulation de l’appelant, celui-ci reçoit 500 extension_action_timeout / extension_route_timeout (ou la raison d’annulation) ; cela signifie seulement que l’appelant n’attend plus — le code sous-jacent peut encore tourner et avoir déjà produit des effets de bord, donc répondez à signal dans run / handle pour une annulation coopérative. Le budget d’une route court jusqu’au retour d’une réponse par handle() et n’affecte pas les flux déjà renvoyés. Si un appelant est parti (dépassement ou annulation) alors qu’une opération de l’extension tourne encore, les appels suivants à cette extension reçoivent 503 extension_busy jusqu’à la fin réelle de l’opération.
   - mobile.js : script mobile ; utilisez window.dshMobile.define({ apiVersion:1, id:'<id>', activate(api) { ... } }), activate renvoie une fonction de nettoyage
   - mobile.css : styles mobiles (facultatif)
   - assets/ : ressources statiques mobiles (facultatif)
   - Dans mobile.js, appelez les actions de l’hôte avec api.host.invoke('action', entrée) (requêtes envoyées en application/json), les routes avec api.host.fetch('/route'), et les URL de ressources liées à la version avec api.host.assetUrl('chemin/relatif')
   - Le profil DSH Web peut générer le modèle avec : dsh plugin --profile web exec dsh-mobile extension create <id> --name "<nom>", puis modifiez le modèle ; sur Desktop créez les fichiers dans le répertoire de personnalisation réel ci-dessus et ne modifiez pas le profil Web par erreur.

Pour les pièces jointes, réutilisez d’abord le téléversement de fichiers intégré à DSH. Si une extension simule le dépôt de fichiers dans le composeur, dataTransfer doit contenir des items itérables (DataTransferItemList) avec les files, et chaque élément fichier doit exposer kind, type et getAsFile() ; un simple tableau files ne suffit pas. Utilisez DataTransfer / DragEvent natifs lorsqu’ils existent, remplissez-les via items.add(file), et vérifiez que effectAllowed / dropEffect peuvent être lus et écrits par la logique de dépôt au lieu de seulement tester l’existence du constructeur. Les WebView incomplètes ont besoin de ces implémentations de compatibilité. Une acceptation dragover ou une émission d’événement réussie ne prouve pas que la pièce jointe a été ajoutée : vérifiez les pièces jointes du brouillon du composeur DSH et l’aperçu d’image décodé, et ne remplacez jamais cette vérification par le nombre de fichiers ou la date de modification du répertoire des pièces jointes de l’ordinateur.

Contraintes de sécurité :
- host.mjs dispose de toutes les permissions de l’utilisateur de l’ordinateur ; n’y mettez jamais de code non fiable et ne laissez pas le téléphone exécuter des commandes arbitraires sans condition
- un blocage synchrone in-process fige la boucle d’événements de la passerelle et les délais ne peuvent pas l’interrompre ; un Worker limite le blocage JavaScript mais n’est pas un bac à sable de sécurité, ne borne pas toute la mémoire native et n’annule pas les effets de bord. Les deux modes doivent répondre à signal ; n’écrivez pas de boucles synchrones non interruptibles
- à l’arrêt d’un Worker, les autres appels inachevés échouent et les opérations commencées ne sont pas relancées automatiquement. Une instance arrêtée avec un contenu identique exige une confirmation humaine dans « Accès mobile → l’extension doit redémarrer » sur l’ordinateur ; ne récupérez pas en modifiant des fichiers sans raison ni en rejouant l’action d’origine
- toutes les modifications sont limitées à $DSH_HOME/mobile-access/ ; ne touchez jamais aux sources de DeepSeek Harness

Auto-vérification avant de terminer :
- si la modification implique mobile.js ou le mobile.js / host.mjs d’une extension, vérifiez la syntaxe avant d’enregistrer (par exemple node --check <fichier>) afin de ne laisser aucune erreur
- après avoir modifié l’interface intégrée de DSH, vérifiez le résultat sur une vraie page de téléphone si possible ; si vous ne pouvez pas observer la page en cours, dites clairement à l’utilisateur que ce n’est pas testé en conditions réelles
- après avoir créé ou modifié une extension, vérifiez que extension.json a schemaVersion 1, que l’id correspond au nom du répertoire et qu’il ne contient que minuscules, chiffres et tirets
- si le host.mjs d’une extension ne peut pas s’activer avant la fin, corrigez-le au lieu de laisser une extension cassée
- à la fin, vérifiez les fichiers réellement écrits et expliquez brièvement à l’utilisateur ce qui a changé et ce qui changera sur la page mobile`,
  },
  it: {
    cssPresent: 'presente (file rilevato; verificarne il caricamento su una pagina abbinata)',
    cssAbsent: 'assente (vengono usati gli stili predefiniti integrati)',
    jsPresent: 'presente (file rilevato; verificarne il caricamento su una pagina abbinata)',
    jsAbsent: 'assente (nessuno script personalizzato)',
    extensionsEmpty: '(nessuna)',
    extensionUnavailable: ' · attualmente non disponibile, richiede un riavvio esplicito dell’estensione',
    failure: count => `Nota: l’host desktop di ${count} estensione/i non è riuscito ad attivarsi. Prima di modificare un’estensione correlata, controlla il suo host.mjs e extension.json.`,
    body: '',
  },
  zh: {
    cssPresent: '存在（已检测到文件，需在已配对页面验证加载）',
    cssAbsent: '不存在（使用内置默认样式）',
    jsPresent: '存在（已检测到文件，需在已配对页面验证加载）',
    jsAbsent: '不存在（无自定义脚本）',
    extensionsEmpty: '（无）',
    extensionUnavailable: ' · 当前不可用，需要显式重启扩展',
    failure: count => `注意：${count} 个扩展的电脑端 host 激活失败，如改动相关扩展请先检查其 host.mjs 与 extension.json。`,
    body: '',
  },
}

/** Compose the guide with the current customization state injected. */
export function buildMobileGuide(state: MobileGuideState, locale: MobileGuideLocale = 'zh'): string {
  const copy = COPY[locale]
  const extensionLines = state.extensions.length === 0
    ? copy.extensionsEmpty
    : state.extensions.map(entry => `- ${entry.id}（${entry.name} v${entry.version}）${entry.executionMode === undefined ? '' : ` · ${entry.executionMode}${entry.executionState === 'unavailable' ? copy.extensionUnavailable : ''}`}`).join('\n')
  const failureLine = state.failedExtensionCount > 0 ? copy.failure(state.failedExtensionCount) : ''
  const header = locale === 'zh'
    ? `## 本机定制文件与扩展状态（改动前必读，避免覆盖已有定制）

- 定制目录：${state.directory}（所有改动只允许在这里进行）
- mobile.css：${state.hasCustomCss ? copy.cssPresent : copy.cssAbsent}
- mobile.js：${state.hasCustomJs ? copy.jsPresent : copy.jsAbsent}
- 已安装扩展：
${extensionLines}
${failureLine}

“恢复默认”操作说明：当用户要求恢复默认 / 还原初始外观时，删除 mobile.css 与 mobile.js 两个文件（删除后手机端自动回到内置默认外观，无需创建占位文件），并按需删除 extensions/ 下的扩展目录。\n\n`
    : locale === 'it'
      ? `## File di personalizzazione e stato delle estensioni (leggere prima di modificare, per non sovrascrivere lavoro esistente)

- Directory di personalizzazione: ${state.directory} (ogni modifica deve restare qui)
- mobile.css: ${state.hasCustomCss ? copy.cssPresent : copy.cssAbsent}
- mobile.js: ${state.hasCustomJs ? copy.jsPresent : copy.jsAbsent}
- Estensioni installate:
${extensionLines}
${failureLine}

“Ripristina impostazioni predefinite”: quando l’utente chiede di ripristinare l’aspetto predefinito/originale, elimina mobile.css e mobile.js (la pagina mobile torna automaticamente all’aspetto integrato; non creare file segnaposto) ed elimina se necessario le cartelle delle estensioni sotto extensions/.\n\n`
      : locale === 'fr'
        ? `## Fichiers de personnalisation et état des extensions (à lire avant toute modification pour ne pas écraser un travail existant)

- Répertoire de personnalisation : ${state.directory} (toute modification doit rester dedans)
- mobile.css : ${state.hasCustomCss ? copy.cssPresent : copy.cssAbsent}
- mobile.js : ${state.hasCustomJs ? copy.jsPresent : copy.jsAbsent}
- Extensions installées :
${extensionLines}
${failureLine}

« Rétablir les valeurs par défaut » : lorsque l’utilisateur demande de rétablir l’apparence par défaut / d’origine, supprimez les fichiers mobile.css et mobile.js (la page mobile revient alors automatiquement à l’apparence intégrée ; ne créez pas de fichiers factices), et supprimez au besoin les dossiers d’extensions sous extensions/.\n\n`
        : `## Desktop customization files and extension state (read before editing, or you may overwrite earlier work)

- Customization directory: ${state.directory} (all edits must stay inside it)
- mobile.css: ${state.hasCustomCss ? copy.cssPresent : copy.cssAbsent}
- mobile.js: ${state.hasCustomJs ? copy.jsPresent : copy.jsAbsent}
- Installed extensions:
${extensionLines}
${failureLine}

“Restore defaults”: when the user asks to restore defaults / the original look, delete mobile.css and mobile.js (the mobile page then returns to the built-in look automatically; do not create placeholder files), and delete extension folders under extensions/ as needed.\n\n`
  const body = locale === 'zh' ? ZH_BODY : locale === 'it' ? COPY.en.body : copy.body
  return `${header}${body}`
}
