# DSH Mobile — fork « DeepSeek Remote »

<p align="center">
  <a href="https://github.com/Rwanbt/dsh-mobile/releases"><img src="https://img.shields.io/github/v/release/Rwanbt/dsh-mobile?include_prereleases&label=release&color=2563EB" alt="Release du fork"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-0F172A" alt="Apache-2.0"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node-22.19%2B%20%7C%2024%2B-3C873A" alt="Node.js"></a>
  <a href="design-system/dsh-mobile/DSH-NATIVE-SPEC.md"><img src="https://img.shields.io/badge/design-DSH%20natif-111111" alt="Design DSH natif"></a>
</p>

> Fork communautaire de **[saya-ch/dsh-mobile](https://github.com/saya-ch/dsh-mobile)**, basé sur la version **0.8.5**.
> Objectif : une interface **française**, une méthode de connexion **OpenTunnel / DSH Remote** intégrée (sans domaine ni compte), le **design natif DeepSeek Harness** et une application Android aux couleurs **DeepSeek**.
>
> Ce fork n'est **pas publié sur npm** : installez-le depuis les sources (section [Installation](#installation)).

## Ce que ce fork ajoute

- **Interface française complète** : panneau « Accès mobile », pages d'appairage/reconnexion, messages de diagnostic et ressources Android (`values-fr`). Le plugin suit la langue de DSH.
- **OpenTunnel / DSH Remote intégré** : premier choix dans la liste et **vue ouverte par défaut** à l'ouverture du panneau. Tunnel TLS public géré par le relais OpenTunnel, **aucun domaine, port public ni compte** requis ; l'identité est persistée dans `$DSH_HOME/mobile-access/opentunnel` pour garder une URL stable. Le mode précédent (proxy inverse/origin) est sauvegardé et restauré à la désactivation.
- **Panneau compact sans scroll** : méthode de connexion en **combobox**, statut et action principale visibles, QR d'appairage, actions secondaires et téléchargements APK repliés dans des sections dépliables.
- **Design DSH natif** : tokens DSH réels (couleurs, rayons, boutons, typographie), scrim neutre, correction des débordements responsive (page Plugins, Paramètres, tiroir mobile).
- **Android DeepSeek** : icône baleine DeepSeek, fonds neutres, suppression des visuels gacha/mascotte, thème clair/sombre, textes français.

## Compatibilité

Cette section concerne **l'ordinateur qui exécute DSH**, pas le téléphone. L'application Android fonctionne à partir d'Android 10 ; iPhone/iPad passent par la Web App (PWA) de DSH.

| Méthode de connexion | Windows x64 | Linux x64 | Linux arm64 | macOS x64 / arm64 |
| --- | --- | --- | --- | --- |
| Réseau local (LAN) | Oui (pare-feu automatique) | Oui (pare-feu à gérer) | Oui | Oui |
| **OpenTunnel / DSH Remote** | **Oui** | **Oui** | **Oui** | **Oui** |
| Tailscale Funnel | Oui (fourni) | Oui (fourni) | Oui (fourni) | Non |
| cpolar | Oui (téléchargé à la demande) | Oui | Oui | Non |
| cloudflared (rapide / nommé) | Oui | Oui | Oui | Oui (x64/arm64) |
| FRP auto-hébergé | Oui | Oui | Oui | Oui |
| Proxy inverse personnel | Oui (configuration) | Oui | Oui | Oui |
| Caddy géré par le plugin | Oui | Oui | Non | Non |
| iroh (expérimental) | Oui | Oui | Non | Non |

Notes :

- **OpenTunnel** repose sur le SDK JavaScript `@opentunnel/client` (Node ≥ 22), sans binaire natif : il fonctionne là où DSH tourne, sur les trois systèmes.
- Sur macOS, le LAN, OpenTunnel, cloudflared, FRP et le proxy inverse sont disponibles ; Tailscale Funnel, cpolar, Caddy géré et iroh n'ont pas de composant macOS.
- Le diagnostic « pare-feu » ne couvre que Windows ; les autres systèmes l'indiquent comme non applicable.
- **DSH** : cible validée DSH Desktop **0.2.2-rc.1** (runtime Node 24 embarqué), CLI npm Node **22.19+ ou 24+**.

### Vérifications effectuées pour cette version

| Plateforme | Vérification |
| --- | --- |
| **Windows 10/11 x64** | Test d'exécution réel : DSH Desktop 0.2.2-rc.1, plugin installé en `link:`, appairage, OpenTunnel actif, panneau ouvert dans le navigateur ; `npm run build`, `tsc --noEmit` et suite de tests locale. |
| **Linux x64 / arm64** | Audit statique des chemins multiplateformes et des tables d'artefacts (`caddy`, `cloudflared`, `cpolar`, `frp`, `iroh`) ; OpenTunnel est du JavaScript pur. La CI amont exécute la suite sur `ubuntu-latest`. Pas de test d'exécution propre à ce fork sur Linux. |
| **macOS x64 / arm64** | Audit statique : OpenTunnel, LAN, cloudflared, FRP et proxy inverse sont multiplateformes. Les composants sans binaire macOS (Tailscale Funnel, cpolar, Caddy géré, iroh) sont explicitement marqués non pris en charge par le plugin. La CI amont n'exécute pas de job macOS : pas de test d'exécution propre à ce fork sur macOS. |

## Qualité, tests et sécurité

Audit réalisé sur cette version (Windows, suite complète) :

| Indicateur | Résultat |
| --- | --- |
| Couverture globale (Vitest/V8) | **75,7 % lignes**, 71,2 % statements, 71,6 % fonctions, 66,7 % branches |
| Modules sécurité critiques | `gateway.ts` **95,3 %** lignes, `control.ts` **92,5 %**, `private-file.ts` **88 %**, `origin-proxy.ts` **100 %**, `local-admin-host.ts` **100 %** |
| OpenTunnel | **76,6 % lignes** / 56,2 % branches (tests ajoutés : SDK absent, conflit de route, URL non-HTTPS, prise d'origin et restauration) |
| Dépendances | `npm audit` : **0 vulnérabilité** (runtime et dev) |
| Secrets | aucun secret, clé privée ou `.env` dans les fichiers suivis ; seuls des jetons factices de tests existent |
| Tests sécurité | 122 tests ciblés (auth, rate limits, contrôle, persistance) verts |

```powershell
npm test                 # suite complète
npm run test:coverage    # rapport de couverture (fournisseur inclus)
npm audit                # dépendances
```

Limites connues : la couverture du client DOM (`src/client.ts`, ~20 %) reste faible car les tests Node ne rendent qu'un faux DOM ; les modules hôte et sécurité sont, eux, couverts à plus de 88 %. Le pont de flux du worker acquitte désormais les lectures explicites (`read()`) et donne la priorité au premier chunk d'un flux affamé : le test de starvation passe et la suite complète est verte.

## Installation

### Prérequis

- **DSH Desktop** 0.2.x (testé sur `0.2.2-rc.1`) ou DSH CLI.
- **Node.js** `^22.19.0` ou `>=24.0.0` pour construire le plugin.
- Pour Android : JDK 21 et Android SDK 36 pour construire l'APK (facultatif si vous utilisez l'APK de la release).

### Plugin (profil desktop)

```powershell
git clone https://github.com/Rwanbt/dsh-mobile.git
cd dsh-mobile
npm ci
npm run build

# Windows — installer le dossier local dans le profil desktop
dsh plugin --profile desktop add link:C:\Users\<vous>\dsh-mobile

# Linux / macOS
dsh plugin --profile desktop add link:"$PWD"
```

Puis redémarrez DSH Desktop (ou rafraîchissez la page) et ouvrez **Accès mobile** dans la barre latérale.

> Mode source : remplacez `dsh` par `pnpm dsh` dans les commandes ci-dessus.
> Désinstallation : `dsh plugin --profile desktop remove dsh-mobile`.

### Application Android

Téléchargez l'APK attaché à la [release du fork](https://github.com/Rwanbt/dsh-mobile/releases), ou construisez-le :

```powershell
cd apps/mobile/android
# Windows
.\gradlew.bat -PirohNative=false :app:assembleDebug
# Linux / macOS
./gradlew -PirohNative=false :app:assembleDebug
```

L'APK debug utilise le package `io.github.sayach.dshmobile.debug` et peut coexister avec l'application officielle.

## Utiliser OpenTunnel / DSH Remote

1. Ouvrir **Accès mobile** dans DSH.
2. Dans **Méthode de connexion**, choisir **OpenTunnel / DSH Remote** (première entrée).
3. Activer l'accès à distance, puis afficher le **code QR d'appairage**.
4. Scanner le QR avec l'application Android (ou ouvrir le lien d'appairage).

Le tunnel public est de la forme `https://dsh.<identifiant>.opentunnel.xyz`. Aucun compte OpenTunnel n'est nécessaire ; l'identité locale est réutilisée pour conserver la même adresse. La désactivation restaure la configuration de proxy inverse précédente si elle existait.

> L'accès distant ne doit être activé que sur un réseau de confiance. Les appareils appairés peuvent piloter DSH sur l'ordinateur : révoquez-les depuis le panneau en cas de perte.

## Développement

```powershell
npm ci
npx tsc --noEmit
npm run build
npm test
```

- Plugin : `src/` (host + client), `design-system/dsh-mobile/` (spec et passes UI).
- Android : `apps/mobile/android/`.
- Tests : `tests/` (Vitest) ; les tests de composants couvrent les tables d'artefacts par plateforme.

### Documentation

- [Spec design DSH natif](design-system/dsh-mobile/DSH-NATIVE-SPEC.md)
- [Passe UI du panneau Accès mobile](design-system/dsh-mobile/PANEL-UI-PASS.md)
- [Détail des changements du fork](design-system/dsh-mobile/PLUGIN-CHANGES.md)
- [README amont (chinois)](README.upstream.zh-CN.md) · [English upstream](README.en.md)

## Remerciements et licence

- Projet amont : [saya-ch/dsh-mobile](https://github.com/saya-ch/dsh-mobile), sous licence **Apache-2.0**.
- Relais et SDK : [OpenTunnel](https://github.com/anomalyco/opentunnel) (MIT).
- Interface et design : [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Ce fork est distribué sous **Apache-2.0** ; voir [LICENSE](LICENSE).


