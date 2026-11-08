# PLUGIN-CHANGES — fork dsh-mobile (task-3, branche plugin uniquement)

Date : 2026-11-08. Périmètre : `src/**`, `tests/**` (uniquement locale fr), `tsdown.config.ts`,
`package.json`/`package-lock.json`. **Aucun fichier de `apps/mobile/**` modifié**, `MASTER.md` intact,
plugin non réinstallé, DSH non redémarré.

## 1. Commandes de vérification (résultats)

```powershell
cd C:\Users\barat\dsh-mobile-fork
npx tsc --noEmit          # OK (exit 0)
npm run build             # OK — lib/index.mjs 1.09 MB, client.js, cli.js, bundles recalculés
node -e "import('./lib/index.mjs').then(m => console.log(Object.keys(m).length))"  # 150 exports, chargement OK
```

Statut final de `lib/` (vérifié statiquement dans `lib/client.js` et `lib/index.mjs`) :
carte « OpenTunnel / DSH Remote » + badge « Sans domaine ni compte », libellés APK FR
(« Télécharger la dernière application Android », « Télécharger l’APK complet (iroh) »),
« Code QR d’appairage », provider `opentunnel` dans l’union client, `OpenTunnelController`,
`import("@opentunnel/client")` dynamique, code d’erreur `opentunnel_sdk_missing`, entrée `opentunnel`
du payload provider, sauvegarde `origin-backup.json` pour le retour au mode origin manuel.
**Le build livré correspond donc à l’instance installée par le Lead (link).**

Validation OpenTunnel réelle (SDK in-process, identité temporaire puis nettoyée) :

```text
event: connecting → connected
public url: https://dsh.<id>.opentunnel.xyz
persisted identity reuse: true
second run url: identique (stable: true)
VALIDATION OK
```

Un tunnel de test a été créé puis **fermé** immédiatement ; son identité était dans un dossier temporaire
supprimé. Aucun tunnel ne tourne à cause de cette vérification.

Tests unitaires : `npm test` (vitest, suite complète) exécuté après mise à jour des fixtures
(`tests/remote.test.ts` 7e provider / `prepared.size` 6, `remote-persistence`, `remote-initialization`,
`auth-pages`, `browser-ui-locale`, `mobile-ui-locale`, `mobile-layout`, `sidebar-footer`,
`client-lifecycle` (tokens `--dsw-radius-*`, `--dsw-alias-border-l1`, ordre des cartes),
`mobile-guide`, `plugin.test` (6 désactivations préparées, description localisée), `gateway.test`
(pages d’appairage FR puis EN)).
Dernière exécution complète : **3322 tests réussis, 19 ignorés (5 fichiers live ignorés), 2 échecs** ;
les deux échecs ont été analysés : `gateway.test` (attente périmée : `fr-FR` doit maintenant donner la
page FR) **corrigé et revérifié vert**, et `extension-worker.test.ts > recovers from aggregate
saturation` qui échoue aussi **seul et hors de tout fichier modifié par cette tâche** (test de budget
d’isolation worker, dépendant de la machine/environnement — préexistant, sans lien avec l’i18n ou le
provider). Le rebuild final et `npx tsc --noEmit` repassent après les dernières corrections FR
(4 chaînes restent volontairement non traduites : URL d’exemple, `frps vhostHTTPPort`, « Attention »,
nom de marque `OpenTunnel / DSH Remote`).

## 2. i18n français

- `src/client-messages.ts` : `MobileControlLocale = 'it' | 'en' | 'zh' | 'fr'`.
  Dictionnaire FR **complet** (627 clés de base + clés ajoutées après déclaration = 650 au total) dans
  `src/client-messages-fr.ts` (généré depuis l’anglais puis revu ; placeholders `{…}` conservés).
  Les 4 dictionnaires `satisfies Record<MobileControlLocale, …>` ont reçu leur entrée `fr` :
  `MOBILE_CONTROL_MESSAGES`, `EXTENSION_RECOVERY_MESSAGES`, `DIAGNOSTIC_SCOPE_MESSAGES`,
  `DIAGNOSTIC_NETWORK_MESSAGES`, `DIAGNOSTIC_REASON_MESSAGES`, `LOCALIZED_DIAGNOSTIC_COPY`.
- `src/auth-pages.ts` : `AuthPageLocale = 'zh' | 'en' | 'fr' | 'it'`, `COPY.fr` complet (pages
  appairage/reconnexion), négociation `Accept-Language` avec `fr` avant `it`/`en`.
- `src/browser-ui-locale.ts` (cookie `dsh_ma_ui_locale=fr`), `src/mobile-ui-locale.ts` (mapping lang→fr),
  `src/client-module-recovery.ts` (lang html).
- `src/client.ts` : `selectMobileControlLocale` accepte `fr` (source = `document.documentElement.lang`,
  donc la locale DSH) ; titres/notifications/`localeTag` (`fr-FR`), `mobileBackBlockedMessage`,
  `mobileSwitchComputerCopy`, `mobileTaskNotificationCopy`, `mobilePushNavigationNotice`.
- Modules client : blocs `fr` complets ajoutés à `client-module-ui.ts`, `client-module-recovery.ts`
  (`CLIENT_MODULE_*`), `mobile-boot-feedback.ts` (`BootLocale` + résolution), `mobile-custom-assets.ts`,
  `mobile-customization-notice.ts` (`Record<… | 'fr'>`), `mobile-directory-picker.ts`,
  `mobile-display-scale.ts`, `mobile-font.ts`, `mobile-layout-messages.ts`
  (`MobileLayoutLanguage = 'it'|'en'|'fr'|'zh'` + `resolveMobileLayoutLanguage`), `mobile-push/settings.ts`.
- `src/mobile-guide.ts` (guide injecté par `/mobile`) : corps **français complet** et corps **anglais**
  (zh conservé, it→en), en-tête d’état localisé, `resolveHostLocale()` (DSH_LOCALE/LC_ALL/LANG puis Intl).
  `src/plugin.ts` : description/hint/erreur/succès de la commande `/mobile` localisés, guide passé avec
  la locale hôte.
- Élision/typographie FR : « d’appairage », « l’accès », apostrophe typographique ; libellés APK
  (« Télécharger la dernière application Android · v… · … MB », « Télécharger l’APK complet (iroh) »).
- Diagnostic : le panneau localise déjà les cartes par `reason` côté client (`LOCALIZED_DIAGNOSTIC_COPY`,
  `DIAGNOSTIC_REASON_MESSAGES`) et le rapport copié est composé côté client en FR. Les libellés/details
  générés côté hôte (`diagnostics.ts`) restent en chinois pour les raisons inconnues/le rapport serveur :
  risque résiduel limité aux codes de raison non catalogués (voir §5).

## 3. Provider `opentunnel` (OpenTunnel / DSH Remote)

Fichiers : **`src/opentunnel.ts`** (nouveau, classe `OpenTunnelController`), `src/remote.ts`,
`src/plugin.ts`, `src/client.ts`, `tsdown.config.ts`, `package.json` (+ lock).

Architecture retenue — **SDK en process**, pas de process enfant :

1. `@opentunnel/client@0.6.2` (API promise `create()`) + peer `effect@^4` ajoutés en `dependencies`
   et **externalisés** dans tsdown (`neverBundle`), chargés par `await import('@opentunnel/client')`
   uniquement à l’activation (un SDK manquant ⇒ statut `error/opentunnel_sdk_missing`, jamais un crash DSH).
2. Identité persistée : `OpenTunnelStorage.xdg({ env: { XDG_DATA_HOME: <$DSH_HOME/mobile-access> } })`
   ⇒ `$DSH_HOME/mobile-access/opentunnel/<profile>` (profil `dsh-mobile`), écriture via le helper SDK.
   L’URL publique est donc **stable entre redémarrages** (validé en réel).
3. Activation : `connect({ routes: { dsh: '127.0.0.1:3444' }, onRouteConflict: 'retry', onEvent })`
   → URL `https://dsh.<id>.opentunnel.xyz` → `OriginConfigStore.configure({ publicOrigin: URL,
   listenHost: '127.0.0.1', listenPort: 3444, allowedCidrs: ['127.0.0.0/8'] })` → passerelle loopback
   démarrée via un `OriginController` **privé** (`createOriginGateway` réutilisé) → `gateway()` exposé,
   donc `/api/mobile-access/remote/pairing/open` et le QR existant fonctionnent sans modification.
4. Désactivation/reconnect : ferme passerelle + connexion + `client.dispose()`, **restaure la configuration
   `origin` d’avant OpenTunnel** (sauvegarde `remote/opentunnel/origin-backup.json`, `previous: null` si
   aucune config préalable) : le provider `origin` manuel n’est ni modifié ni cassé (point 6 du Lead).
   OpenTunnel ne pilote jamais le store ni le contrôleur `origin` existants (store volatil + instance privée).
5. Statuts : `starting` (création tunnel), `connecting` (passerelle / reconnexion), `ready`
   (URL + backend), `error` avec codes `opentunnel_sdk_missing | connect_failed | route_conflict |
   stopped | timeout | identity_failed | gateway_failed` (localisés FR/EN/IT/ZH, mappés côté client).
6. Intégration host : union `RemoteProvider`, `REMOTE_PROVIDERS`, `parseRemoteProviderState`,
   `configuredRemoteProvider` (`DSH_MOBILE_REMOTE_PROVIDER=opentunnel`), `remoteControllers`,
   `providers` map du payload `/remote/control`, whitelists admin `POST /remote/provider` et
   `POST /remote/control`, `stores` de `prepareDisabledRemoteProviders`.
7. Côté client : `MobileRemoteProvider` + parser, carte « OpenTunnel / DSH Remote » (radio, badge,
   description, ordre lan → tailscale → opentunnel → cpolar → cloudflared → frp → origin → iroh),
   sélection `POST /remote/provider`, toggle `/remote/control`, statuts/labels FR, reconnexion/reset,
   QR générique réutilisé (aucune logique QR dupliquée).

## 4. Design natif DSH (panneau)

- Ajout en fin de stylesheet de `DSH_NATIVE_STYLES` (dans `src/client.ts`, appliqué au panneau desktop
  uniquement) : fenêtre radius 28 (`--dsw-radius-panel`), cartes/panneaux 16 (`--dsw-radius-lg`),
  lignes providers radius 12 (`--dsw-radius-md`, min 44px), boutons primaires 36px/12, secondaires
  28px/8, pills 999, bordures `--dsw-alias-border-l2`, hover/selected via `interactive-bg-*` + accent,
  ombre douce (plus de shadow/glow lourds), focus visible accent, responsive 375–480 px.
- Remplacement des rayons en dur arbitraires dans la feuille existante : plus aucun
  `border-radius:13/11/10/9/12px` (mappés vers les tokens DSH `--dsw-radius-*`), une occurrence de
  `12px` restante hors feuille du panneau (styles inline d’un composant mobile).

## 5. Points à vérifier par le Lead / limites

**Recette réelle déjà validée par le Lead** : installation du fork dans le profil Desktop via `link`
(npm `dsh-mobile@0.8.5` retiré), sélection `POST /remote/provider {opentunnel}` puis
`POST /remote/control {running:true}` → `state=ready` en <4 s, URL publique
`https://dsh.<id>.opentunnel.xyz`, backend 3444, root public 401, page pairing 200, app Android fork
appairée et DSH affiché ; pont externe arrêté et VBS de démarrage supprimé ; panneau en français.

- **Installation/rollback** : le profil Desktop utilise un `link` vers ce dossier (pas de copie npm).
  Pour revenir à l’officiel : retirer le link/plugin puis réinstaller `dsh-mobile@0.8.5` (npm) et
  redémarrer DSH — non fait ici (le fork est en production sur le poste, ne pas désinstaller).
- Port 3444 : la passerelle loopback doit rester libre ; l’ancien pont externe a été arrêté.
- Identité : première activation = création tunnel/certificat (réseau requis) ; l’identité vit dans
  `$DSH_HOME/mobile-access/opentunnel/` et fixe l’URL publique.
- `diagnostics.ts` : textes hôte encore en chinois pour les raisons inconnues et le `report` serveur ;
  le panneau et le rapport copié sont FR côté client. Non bloquant.
- `src/cli.ts` : modèles d’extension générés par `dsh-mobile extension create` encore en chinois
  (outil CLI développeur, hors panneau). Non bloquant.
- `mobile-guide.ts` : locale hôte déduite de `DSH_LOCALE`/variables de locale/Intl (DSH n’expose pas sa
  locale au plugin) ; le guide `/mobile` peut donc être en anglais si aucune variable de locale FR
  n’est posée. Le panneau, lui, suit `document.documentElement.lang` (fr).
- Chaînes secondaires restantes : les chaînes purement techniques (URL d’exemple, `frps vhostHTTPPort`,
  « Attention ») restent inchangées ; quelques libellés VPS/FRP attach secondaires peuvent rester
  anglais (héritage), sans impact sur le flux principal.
- Design : refonte par couche d’override (`DSH_NATIVE_STYLES`) plutôt que réécriture intégrale ;
  vérifier visuellement clair/sombre, 375 px et zoom.
