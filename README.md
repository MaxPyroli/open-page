# Open Page

Lis et annote des **PDF**, lis des fichiers **HTML** locaux.
Application de bureau native (Tauri), légère, **hors ligne** : aucun fichier ne quitte ton ordinateur. **Sans pub, sans pistage.**

Cible principale : **Windows ARM64** (aussi Windows x64, macOS et Linux).

## État (V1 en cours)

- [x] Ouvrir un PDF (bouton, glisser-déposer, double-clic), affichage continu
- [x] Zoom (dont trackpad et tactile), navigation par page, recherche de texte, thème auto / clair / sombre
- [x] Écran « À propos » et page de confidentialité
- [x] Ouvrir un fichier `.html` local (iframe isolée, ressources relatives du dossier)
- [ ] Annotations : surlignage, notes, dessin, signature
- [ ] Pages : réorganiser, supprimer, fusionner, découper
- [ ] Formulaires PDF
- Plus tard : modification du texte existant (piste : MuPDF WASM)

Le suivi détaillé est dans le projet « Liseuse PDF HTML » de Tool Proj (nom de travail du projet, avant le choix d'Open Page).

## Développement

Prérequis : [Node 22+](https://nodejs.org), [Rust](https://rustup.rs) et les
[prérequis Tauri](https://tauri.app/start/prerequisites/) de ton OS
(Windows : Visual Studio Build Tools avec « Desktop development with C++ »
+ le composant **ARM64 build tools** si tu es sur ARM).

```bash
npm install
npm run tauri dev      # lance l'app en développement
npm run tauri build    # produit l'installeur
```

Le workflow GitHub Actions `Build Windows` produit l'installeur NSIS pour
Windows ARM64 et x64 (artefacts téléchargeables depuis l'onglet Actions).

## Stack

Tauri 2 (Rust + WebView du système) · TypeScript + Vite · pdf.js (affichage) ·
pdf-lib (édition de pages, à venir).

---

© 2026 Paname Dev · Codé par Claude · contact@panamedev.fr
