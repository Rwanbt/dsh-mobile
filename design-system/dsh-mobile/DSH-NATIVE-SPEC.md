# Spec design « DSH natif » — fork dsh-mobile (Lead, 2026-11-08)

Source de vérité : tokens **calculés** de DSH Desktop 0.2.2-rc.1 (instance web réelle, thèmes clair/sombre), captures :
`C:\Users\barat\Documents\deepseek-harness\default-workspace\design-tokens\` (`dsh-ui-light.png`, `dsh-ui-dark.png`, CSS extraits).
Objectif : que le panneau plugin et l'app Android **paraissent natifs DeepSeek Harness**, sans visuels gacha/mascotte.

## 1. Tokens (à utiliser tels quels, ne pas réinventer)

| Token | Clair | Sombre |
|---|---|---|
| `--dsw-alias-bg-base` | `#ffffff` | `#151517` |
| `--dsw-alias-bg-layer-1` | `#ffffff` | `#232324` |
| `--dsw-alias-bg-layer-2` | `#ffffff` | `#2c2c2e` |
| `--dsw-alias-bg-layer-3` | `#ffffff` | `#353638` |
| `--dsw-alias-label-primary` | `#0f1115` | `#f9fafb` |
| `--dsw-alias-label-secondary` | `#61666b` | `#cfd3d6` |
| `--dsw-alias-label-tertiary` | `#81858c` | `#adb2b8` |
| `--dsw-alias-border-l1` | `#0000000a` | `#ffffff0f` |
| `--dsw-alias-border-l2` | `#0000001a` | `#ffffff1f` |
| `--dsw-alias-border-l3` | `#0000001f` | `#ffffff29` |
| `--dsw-alias-interactive-bg-hover` | `#2631480f` | `#ffffff14` |
| `--dsw-alias-interactive-bg-active` | `#2631481a` | `#ffffff24` |
| `--dsw-alias-state-success-primary` | `#22c55e` | `#22c55e` |
| `--dsw-alias-state-error-primary` | `#ec1313` | `#f25a5a` |
| Accent/brand (bouton plein, focus) | `#4176e6` | `#7aaaff` |
| Texte sur accent | `#ffffff` | `#ffffff` |

Rayons : `--dsw-radius-xs:4px`, `--dsw-radius-sm:8px`, `--dsw-radius-md:12px`, `--dsw-radius-lg:16px`, `--dsw-radius-panel:28px`.
Typo : pile système (`-apple-system, "Segoe UI", "Microsoft YaHei", Helvetica, Arial, sans-serif`).
Tailles DSH : contenu `14px` (`--dsh-content-font-size`), secondaire `13px`, caption `12px`, titre de section `13px/650`.
Boutons DSH mesurés : primaire `36px` de haut, radius `12px`, padding `0 14px`, `14px/400` ; secondaire `28px`, radius `8px` ; pastilles/pills `34px`, radius `999px`.

## 2. Règles de composition

- Panneau/carte : radius **16px** (`--dsw-radius-lg`), bordure `1px solid var(--dsw-alias-border-l2)`, fond `var(--dsw-alias-bg-layer-2)`.
- Fenêtre modale/sheet : radius **28px** (`--dsw-radius-panel`).
- Lignes/choix (provider, réglages) : radius **12px**, hauteur min 44px web, hover `--dsw-alias-interactive-bg-hover`, sélection = fond teinté + bordure 1px accent, **pas d'ombre lourde**.
- Aucun `border-radius` en dur arbitraire (supprimer `13px`, `10px`, `12px` posés au hasard) : utiliser les variables.
- Pas de dégradés/glow/glass/particules (cf. `design-system/dsh-mobile/MASTER.md`). Fond simplement `bg-layer-1/2`.
- Mobile : cibles ≥ 44px CSS (web) / 48dp (natif), safe-area, pas de débordement horizontal à 375px, clavier géré.

## 3. Branding DeepSeek

- Icône officielle : **baleine DeepSeek** (fournie) — `assets/deepseek-brand/deepseek-icon-512.png`, `deepseek-icon-192.png`, `deepseek-touch-icon.png`, `deepseek-favicon.svg`, `deepseek-app-icon.png` (source haute résolution `design-tokens/dsh-app-icon.png` 1024px).
- Remplacer **tous** les visuels gacha/mascotte : `apps/mobile/android/app/src/main/res/drawable-nodpi/setup_background_image.png` (1,1 Mo), mipmaps `ic_launcher.png`, et toute référence à la mascotte/whale-girl dans l'app.
- Fond de setup natif : neutre type DSH (uni `bg-base`/`bg-layer-1`, éventuellement léger voile dégradé très doux + logo baleine discret). Pas d'illustration anime.
- Nom affiché : **DeepSeek Harness** (déjà), pas de mention mascotte.

## 4. Mapping natif Android (app)

| Rôle | Clair | Sombre |
|---|---|---|
| `app_background` | `#ffffff` (ou `#f7f8fa` pour les zones) | `#151517` |
| `app_surface` | `#ffffff` | `#232324` |
| `app_surface_tinted` | `#f5f6f7` | `#2c2c2e` |
| `app_foreground` | `#0f1115` | `#f9fafb` |
| `app_secondary` | `#61666b` | `#cfd3d6` |
| `app_border` | `#0000001a` | `#ffffff1f` |
| `app_accent` | `#4176e6` | `#7aaaff` |
| `app_on_accent` | `#ffffff` | `#ffffff` |
| `app_error` | `#ec1313` | `#f25a5a` |
| `app_success` | `#22c55e` | `#22c55e` |

- Cartes natives : radius 16dp ; boutons : primaire 48dp de haut radius 16dp, secondaire 48dp radius 12dp ; typo système (`sans`/`sans-serif`), titres 16–20sp, corps 14sp, caption 12sp ; cibles ≥ 48dp.
- Barres système : `statusBarColor`/`navigationBarColor` = `app_background`, icônes claires en sombre (`windowLightStatusBar` false), etc.

## 5. Livrables vérifiables

- Plugin : panneau « DSH Mobile » avec textes **français** (aucun chinois), cartes providers radius 16/12 cohérentes DSH, nouvelle méthode **OpenTunnel** produisant son QR dans le panneau.
- APK : icône baleine, couleurs/typo/boutons DSH, zéro visuel gacha, écrans FR (`values-fr`), bugs responsive corrigés (captures avant/après via adb).
- Validation : `npm run build` OK (plugin) ; `gradlew :app:assembleDebug` OK (APK) ; captures `adb exec-out screencap -p` des écrans clés.
