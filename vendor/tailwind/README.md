# Tailwind CSS — lokal kompiliert

Ersetzt den früheren Play-CDN (`cdn.tailwindcss.com`), der für Produktion ungeeignet ist.
Kein Live-Build im Projekt — `tailwind.css` ist eine fertige, statische Datei, die wie jede
andere CSS-Datei ausgeliefert wird.

## Neu kompilieren (nur nötig bei neuen Tailwind-Klassen in index.html oder Theme-Änderungen)

1. Tailwind-CLI (Standalone-Binary, kein npm/Node nötig) besorgen, falls nicht vorhanden:
   ```
   curl -sL -o tailwindcss https://github.com/tailwindlabs/tailwindcss/releases/download/v3.4.17/tailwindcss-linux-x64
   chmod +x tailwindcss
   ```
2. Aus dem Projekt-Root ausführen:
   ```
   ./tailwindcss -i vendor/tailwind/input.css -o vendor/tailwind/tailwind.css --config vendor/tailwind/tailwind.config.js --minify
   ```
3. `vendor/tailwind/tailwind.css` committen.

`tailwind.config.js` enthält exakt das Theme, das vorher im `<script>tailwind.config = {...}</script>`
in `index.html` stand (Farben `navy`/`brand`/`slate`, `fontFamily.sans`, `boxShadow.glow`, `darkMode: 'class'`).
`content` scannt `index.html` nach verwendeten Klassen (JIT-Purge wie beim Play-CDN).

**Wichtig:** Tailwind v3 verwendet (nicht v4), weil die alte `tailwind.config`-Syntax nur mit v3
kompatibel ist. Ein Umstieg auf v4 wäre ein eigenes, größeres Vorhaben (CSS-basierte Config, ggf.
Breaking Changes bei Utility-Klassen).
