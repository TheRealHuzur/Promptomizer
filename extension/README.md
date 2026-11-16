# Promptomizer Chrome-Extension (Seitenleiste, Version 1.1)

Die Promptomizer-Bibliothek als Seitenleiste neben jedem KI-Tool: eigene Prompts und Bausteine suchen und per Klick kopieren, Prompts bearbeiten (neue Fassung), neue Prompts, Bausteine und Kategorien anlegen, Kollektionen durchstöbern und übernehmen. Anmeldung mit Google oder E-Mail und Passwort. Bewusst ohne Content-Script, ohne Zugriff auf fremde Seiten, ohne automatisches Einfügen, ohne Löschen.

Führender Plan: `/srv/wuw-storage/53_promptomizer/01_roadmaps/extension/Promptomizer-Extension-Seitenleiste-Masterplan.md`.

## Entpackt laden (Entwicklung)

1. `chrome://extensions` öffnen, Entwicklermodus einschalten. Die Store-Version vorher entfernen (gleiche ID, siehe „Schlüssel“).
2. „Entpackte Erweiterung laden“ → diesen Ordner `extension/` wählen.
3. Klick auf das Symbol öffnet die Seitenleiste. Tastenkürzel: Standard `Ctrl+Shift+K`, umbelegbar unter `chrome://extensions/shortcuts`. Chrome übernimmt den Vorschlag nur bei der Installation und nur, wenn die Kombination frei ist. Seit 1.1 heißt das Kommando `open-side-panel` statt `_execute_action`; bei einem Update von 1.0 kann das Kürzel deshalb fehlen und muss dort gesetzt werden.
4. Anmelden mit Google (Chrome-Anmeldefenster) oder mit E-Mail und Passwort des Promptomizer-Kontos. Ein Abmelden gibt es in der Leiste nicht (E10).

## Aufbau

| Datei | Zweck |
|---|---|
| `manifest.json` | Manifest V3; Rechte nur `storage`, `clipboardWrite`, `sidePanel`, `identity` und die eigene Supabase-URL (alle ohne Installationswarnung) |
| `background.js` | Service Worker nur zum Öffnen der Leiste (Klick, Tastenkürzel); kein Netz, keine Daten |
| `popup.html/.css/.js` | Seitenleiste: Anmeldung, Bibliothek, Bearbeiten, Neuer Prompt, Bausteine, Kollektionen, Rückfragen, Limits |
| `contract.js` | Zeichengleiche Kopien aus `library.js` (`prefixSearchQuery`, `structuredValues`, `promptToText`) und `collections.js` (`isFreeCollectionPrompt`, `toStorageFields`), dazu `libraryFieldsPayload` (wie `getCurrentLibraryFieldsPayload` in `app.html`) und `snippetModeFor` |
| `vendor/supabase.js` | Byteidentische Kopie von `../vendor/supabase/supabase.js` |
| `vendor/inter/` | Inter (latin, latin-ext) aus `../vendor/fonts/inter` |
| `icons/` | 16/48/128 px aus `../icon-512.png` |

## Schreibwege (wie die Web-App)

- Neue Fassung: `UPDATE library (name, fields)` mit Bedingung `current_version` = geladene Fassung. Trifft sie nicht, fragt die Leiste nach („Meine Fassung speichern“ / „Neu laden“). Eine reine Kategorieänderung legt keine Fassung an.
- Neuer Prompt und Übernahme aus Kollektionen: `INSERT library` mit Kategoriename.
- Kategorie anlegen: `INSERT prompt_categories`. Favorit: `UPDATE library (is_favorite)`.
- Baustein anlegen/bearbeiten: `snippets` mit `field_id` (Einsatzbereich) und daraus `mode`.
- Kopieren eines eigenen Prompts: `INSERT prompt_history` wie `handleCopyAndSave`, dazu `last_used_at`.
- Kein Löschen, kein Archivieren, keine RPCs. Free-Limit, Kategorielimit und Versionierung setzen die Datenbank-Trigger durch.

## Kollektionen

Die Leiste lädt `https://www.promptomizer.de/kollektionen.json` (reine Daten, CORS-Header in `vercel.json`), höchstens stündlich, und speichert den letzten Stand in `chrome.storage.local`. Ohne Netz gilt der letzte Stand, ohne jeden Stand erscheint ein Hinweis mit „Erneut versuchen“. Die Datei wird aus `kollektionen.js` erzeugt: nach jeder Kollektionsänderung `node tools/build-kollektionen-json.cjs` ausführen und beide Dateien committen.

## Google-Anmeldung

`chrome.identity.launchWebAuthFlow` öffnet den Supabase-Google-Login (`signInWithOAuth` mit `skipBrowserRedirect`, PKCE). Supabase leitet auf `https://omeecepdhgklmakffbbllbmfjejkjknl.chromiumapp.org/` zurück; diese Adresse steht seit dem 09.11.2026 in der Redirect-Allowlist von Supabase. Der Code wird per `exchangeCodeForSession` getauscht. Ohne Promptomizer-Konto legt Supabase eins an (wie in der Web-App); der Hinweis unter dem Knopf verlinkt AGB und Datenschutz.

## Pflichten bei Änderungen

- `library.js`, `collections.js`, `getCurrentLibraryFieldsPayload` in `app.html` oder die `mode`-Regel in `snippet-library.js` geändert → `contract.js` nachziehen. `node tests/extension-contract-smoke.cjs` vergleicht Quelltext bzw. Ergebnis.
- `vendor/supabase/supabase.js` aktualisiert → `extension/vendor/supabase.js` neu kopieren. `node tests/extension-source-smoke.cjs` prüft die Byte-Gleichheit.
- Kein `innerHTML`, keine Inline-Event-Handler, keine Remote-Skripte (MV3-CSP), keine neuen Rechte ohne Richtungsentscheidung.
- Keine Telemetrie, keine Prompt-Inhalte in Konsolenausgaben.

## Prüfen

```
node --check extension/popup.js extension/contract.js extension/background.js
node tests/extension-source-smoke.cjs
node tests/extension-contract-smoke.cjs
node tests/collections-json-smoke.cjs
```

Browser-Ladetest im Playwright-Container: Aufruf im Kopf von `tests/extension-sidepanel-browser.mjs`.

## Schlüssel

`key` im Manifest ist seit dem 17.10.2026 der öffentliche Schlüssel der Store-Version (Developer-Dashboard → Paket). Damit hat die entpackte Erweiterung dieselbe ID wie die Store-Version: `omeecepdhgklmakffbbllbmfjejkjknl`, und dieselbe Google-Rücksprungadresse. Den privaten Schlüssel verwaltet der Store.

Store-Zips werden ohne `key` und ohne `README.md` gebaut. Entpackte Version und Store-Version lassen sich wegen der gleichen ID nicht gleichzeitig installieren.

Der frühere eigene Schlüssel (`promptomizer-extension.pem`, ID `jnhnhiengejeoajkjefmfgnemcpmdopm`) wird nicht mehr verwendet.

## Auslieferung

`.vercelignore` im Repo-Root schließt `extension/` von der Vercel-Auslieferung aus. Der Ordner gehört weder in die Tailwind-Content-Liste noch in die Sitemap. `kollektionen.json` liegt dagegen im Repo-Root und wird ausgeliefert.
