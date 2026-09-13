# Promptomizer Chrome-Extension (Stufe 1)

Popup-Bibliothek: eigene Prompts und Bausteine suchen, per Klick kopieren, selbst einfügen – in jedem KI-Tool. Bewusst ohne Content-Script, ohne Zugriff auf fremde Seiten, ohne automatisches Einfügen.

Führender Plan: `/srv/wuw-storage/53_promptomizer/01_roadmaps/extension/`.

## Entpackt laden (Entwicklung)

1. `chrome://extensions` öffnen, Entwicklermodus einschalten.
2. „Entpackte Erweiterung laden“ → diesen Ordner `extension/` wählen.
3. Tastenkürzel: Standard `Alt+Shift+P`, umbelegbar unter `chrome://extensions/shortcuts`.
4. Anmeldung im Popup mit E-Mail und Passwort des Promptomizer-Kontos. Google-Nutzer setzen vorher in der App über „Passwort vergessen“ ein Passwort.

Die Extension-ID bleibt dank `key` im Manifest über Neuinstallationen stabil.

## Aufbau

| Datei | Zweck |
|---|---|
| `manifest.json` | Manifest V3; Rechte nur `storage`, `clipboardWrite` und die eigene Supabase-URL |
| `popup.html/.css/.js` | Oberfläche, Anmeldung, Cache, Suche, Kopieren |
| `contract.js` | Zeichengleiche Kopien von `prefixSearchQuery`, `structuredValues`, `promptToText` aus `library.js` plus Extension-Hilfsfunktionen |
| `vendor/supabase.js` | Byteidentische Kopie von `../vendor/supabase/supabase.js` |
| `icons/` | 16/48/128 px aus `../icon-512.png` |

Kein Service Worker: Das Token wird beim Öffnen des Popups über `getSession()` aufgefrischt.

## Pflichten bei Änderungen

- `library.js` (`prefixSearchQuery`, `structuredValues`, `promptToText`) geändert → `contract.js` nachziehen. `node tests/extension-contract-smoke.cjs` vergleicht den Quelltext.
- `vendor/supabase/supabase.js` aktualisiert → `extension/vendor/supabase.js` neu kopieren. `node tests/extension-source-smoke.cjs` prüft die Byte-Gleichheit.
- Kein `innerHTML`, keine Inline-Event-Handler, keine Remote-Skripte (MV3-CSP).
- Keine Telemetrie, keine Prompt-Inhalte in Konsolenausgaben.

## Prüfen

```
node --check extension/popup.js extension/contract.js
node tests/extension-source-smoke.cjs
node tests/extension-contract-smoke.cjs
```

## Schlüssel

`key` im Manifest ist der öffentliche Teil eines RSA-2048-Schlüssels. Der private Schlüssel (`promptomizer-extension.pem`) liegt **nicht** im Repo und wird nur für `--pack-extension` gebraucht. Erzeugung:

```
openssl genrsa -out promptomizer-extension.pem 2048
openssl rsa -in promptomizer-extension.pem -pubout -outform DER | openssl base64 -A
```

Nach dem ersten Upload in den Chrome Web Store vergibt der Store einen eigenen Schlüssel; soll die entpackte ID mit der Store-ID übereinstimmen, wird dessen öffentlicher Schlüssel in das Manifest übernommen.

## Auslieferung

`.vercelignore` im Repo-Root schließt `extension/` von der Vercel-Auslieferung aus. Der Ordner gehört weder in die Tailwind-Content-Liste noch in die Sitemap.
