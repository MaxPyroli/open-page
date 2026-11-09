# Open Page

Appli de bureau (Tauri 2 + TypeScript/Vite) pour lire et annoter des PDF (pdf.js) et lire des fichiers HTML locaux. Hors ligne. Cible principale : Windows ARM64.

## Commandes
- `npm install` puis `npm run tauri dev` : lancer l'appli (Rust + prérequis Tauri de l'OS requis).
- `npm run build` : vérifie les types (`tsc`) et construit le front. `cargo check` dans `src-tauri/` pour le Rust.
- Build Windows ARM64 / x64 : workflow GitHub Actions `Build Windows` (installeur NSIS dans les artefacts).

## Repères
- Front : `src/main.ts` (lecteur, zoom, recherche, thème, à propos), `src/styles.css`, `index.html`. `public/` : cmaps et polices pdf.js (hors ligne), `confidentialite.html`.
- Rust : `src-tauri/src/lib.rs` (commandes `read_file`, `initial_file`, `allow_dir` pour le lecteur HTML via le protocole `asset:`).
- Le suivi des tâches est dans Tool Proj, projet « Liseuse PDF HTML » (nom de travail).
- Icône : `branding/` (brouillons et PNG source) ; icônes générées avec `npx tauri icon`.

## Charte Paname Dev
- La charte commune est dans `MaxPyroli/showroom`, fichier `CHARTE.md` (lien brut, branche de travail actuelle : https://raw.githubusercontent.com/MaxPyroli/showroom/claude/modest-babbage-vp5jts/CHARTE.md ; remplacer par `main` quand la branche sera fusionnée). La lire au début d'une tâche qui touche à l'interface, aux textes, aux pages légales, au README ou au store.
- Identité à utiliser telle quelle : éditeur « Paname Dev », contact `contact@panamedev.fr`, copyright `© 2026 Paname Dev`, mention « Pensé par Paname Dev et codé par Claude » (longue) ou « Codé par Claude » (courte, à côté du ©). Promesse vraie pour toutes les apps : **sans pub, sans pistage** (ne pas écrire « données chez toi » ni « hors-ligne » sauf si c'est exact pour l'app). Aucune requête vers un tiers pour afficher l'app : polices, bibliothèques et scripts hébergés avec l'app ; les services nécessaires (cartes, API, base de données) sont nommés dans la page de confidentialité. Toute app a une page de confidentialité, un seul nom partout et une mention de conception exacte.
- Si l'app s'écarte de la charte, le signaler à l'utilisateur au lieu de corriger en silence ; si une décision de design est prise dans l'app, la rappeler à l'utilisateur à la fin pour qu'il la fasse noter dans la charte (section 8) depuis la conversation du showroom : une conversation d'app ne modifie pas ce dépôt.

## Spécifique à Open Page
- Nom : « Open Page » (identifiant `fr.panamedev.openpage`). Accent : cyan de la réserve de la charte (`#0a8ca9`, encre `#046378`, sombre `#3dbfdc`) ; icône : deux feuilles (PDF + HTML) et un surligneur.
- « Hors ligne » est exact (aucune requête réseau de l'appli). Réserve : une page HTML ouverte peut demander des ressources en ligne ; voir `public/confidentialite.html` (à mettre à jour avec la date si on change quoi que ce soit).
