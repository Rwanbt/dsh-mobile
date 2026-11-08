# Passe UI du panneau « Accès mobile » (DSH remote) — 2026-11-08

Périmètre : panneau du plugin `dsh-mobile` rendu par DSH Desktop/Web (surface admin locale), pas l'app Android.
Vérifié en direct via une instance web DSH (1280×900, 430×900, thème sombre et clair) avec Playwright/Brave :
tokens calculés, géométrie DOM et captures.

## Défauts corrigés

1. **Boutons primaires invisibles** — texte blanc sur fond blanc (`bg #f9fafb`, `color #fff`).
   Remplacés par les tokens DSH réels : `--dsw-alias-button-primary-fill`, `--dsw-alias-label-primary-foreground`,
   hover `--dsw-alias-button-primary-hover` ; état désactivé neutre (layer-3 + label-tertiary + bordure).
2. **Accent/selection faux** — le plugin utilisait `--dsw-alias-label-primary-bluish` qui vaut **blanc** en thème sombre.
   Accent = `--dsw-alias-state-business-primary` (#7aaaff sombre). Sélection fournisseur = bordure accent + fond teinté,
   badge accent, suppression de la barre latérale redondante.
3. **Cartes de téléchargement APK** — hauteurs inégales, bordure blanche sur la carte iroh, texte en vrac.
   Grille 2 colonnes en cartes égales, contenu structuré `titre` + `meta` (spans), bordure neutre, flèche discrète ;
   une colonne sous 560 px. Le texte est régénéré structuré aussi lors des mises à jour de version.
4. **En-tête du panneau** — actions « Diagnostic / Appareil / Retour / × » stylées en boutons ghost DSH 32 px
   (hover, état pressé), titre tronquable proprement, fond du panneau sur `bg-layer-1` pour détacher les cartes.
5. **Vue Accès à distance** — les actions étaient dans une grille 3 colonnes (boutons de 113 px, libellés sur 2–3 lignes).
   Layout flex 2-up, boutons 48 px, le dernier bouton seul prend toute la ligne ; QR vide dans un encart pointillé
   plus compact ; statuts en cartes discrètes avec teinte erreur/succès.
6. **Vue Appareils** — le bouton retour affichait **« Dos »** (traduction FR erronée) → **« Retour »**.
   Segmenteur lisible (actif plus clair + bordure), état vide avec padding, bouton « Effacer tous les appareils »
   grisé quand désactivé.
7. **Responsive étroit** — la liste des fournisseurs débordait de sa hauteur fixe (360 px) et chevauchait la carte
   « Terminer la configuration du réseau local ». Corrigé : hauteur auto + `overflow:visible`, `channel-pane` sans
   max-height, cartes APK en une colonne, en-tête compact.

## Vérifications
- `npx tsc --noEmit` : OK
- `npm run build` : OK
- Tests ciblés : `client-lifecycle`, `mobile-layout`, `mobile-ui-locale`, `auth-pages` → **245 tests réussis**
- Captures : `fork-artifacts/android/after/panel_lan_dark.png`, `panel_remote_dark.png`,
  `panel_devices_dark.png`, `panel_devices_light.png`, `panel_devices_narrow.png`

## Notes
- Le changement de fournisseur utilise encore un `confirm()` natif du navigateur ; à remplacer par une confirmation
  DSH stylée dans une passe ultérieure.
- L'instance web de vérification partage `$DSH_HOME/mobile-access` avec DSH Desktop : le fournisseur OpenTunnel peut y
  apparaître en timeout (conflit d'identité), sans lien avec le rendu du panneau.
- Après mise à jour du plugin, rafraîchir la page DSH (Ctrl+R) pour charger le nouveau bundle client.

## Passe complémentaire (19:35)
- **OpenTunnel / DSH Remote est désormais la première carte** de la liste des méthodes de connexion, suivi de « Réseau local » puis Tailscale, cpolar, cloudflared, FRP, proxy inverse, iroh. Les cartes partagent maintenant le même groupe radio (navigation clavier cohérente) et le clic LAN est exclu du raccourci « passer en vue distante ».
- **Carte « Réseau local » aérée** : padding 16 px, titre 14/650 avec marge basse, description et note avec interligne, champ/select espacés, boutons et statut séparés par 12–14 px.

## Panneau compact (implémenté, 20:15)
- La liste des 8 cartes fournisseurs est remplacée par un **combobox** « Méthode de connexion » : bouton 44 px + popover de 8 lignes compactes (nom + badge), description de la méthode active sous le champ.
- Disposition **une seule colonne** : méthode en haut, puis la carte de contenu (statut, actions, QR replié).
- Les **téléchargements APK** passent dans un <details> replié en pied de panneau ; l'intro distante est supprimée.
- Les **QR d'appairage / actions secondaires** sont repliés dans « Code QR d'appairage » (reste accessible au clic).
- Mesures vérifiées à 1280×900 : vue LAN **718 px**, vue OpenTunnel **524 px**, scrollHeight <= clientHeight → **aucun scroll**. Sur une fenêtre très basse (< 800 px de haut), le panneau peut encore scroller quand les détails sont ouverts.
- Captures : panel_compact_lan.png, panel_compact_methods.png, panel_compact_remote.png (dossier ork-artifacts/android/after/).

## Correctif QR (20:50)
- Cause réelle : le panneau avait overflow: hidden et la vue était un flex 1 1 0 contraint à ~612 px ; le contenu ouvert (787 px) débordait hors flux et passait sous la ligne « APK », sans possibilité de scroll. Le QR était donc coupé.
- Correctif : overflow-y: auto sur le panneau, vues/colonnes/pane en lex: 0 0 auto (la hauteur suit le contenu), auto-ouverture du bloc « Code QR d'appairage » quand un QR est généré et scrollIntoView sur le QR ; ouverture manuelle des détails scrolle aussi dessus.
- Vérifié avec un QR 192 px : entièrement visible (y 573→765 dans un panneau 28→788), panneau scrollable (934 px de contenu pour 758 px visibles), plus de chevauchement avec la section APK.
- Capture : ork-artifacts/android/after/panel_qr_visible.png.
