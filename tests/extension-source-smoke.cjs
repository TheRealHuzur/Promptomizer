const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Manifest: MV3-Seitenleiste mit fester Rechteliste ohne Installationswarnung, keine Content-Skripte.
const manifest = JSON.parse(read('extension/manifest.json'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, 'Promptomizer');
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.ok(!('version_name' in manifest), 'kein version_name (Prototyp-Kennzeichnung) im Store-Paket');
// Erlaubte Rechte als feste Liste: alles andere schlägt fehl. identity ohne .email, sidePanel und identity warnen nicht.
assert.deepEqual([...manifest.permissions].sort(), ['clipboardWrite', 'identity', 'sidePanel', 'storage']);
assert.deepEqual(manifest.host_permissions, ['https://nrrsroaubbpmjyexhuhi.supabase.co/*']);
for (const forbidden of ['content_scripts', 'web_accessible_resources', 'optional_permissions', 'optional_host_permissions', 'content_security_policy', 'externally_connectable']) {
    assert.ok(!(forbidden in manifest), `manifest darf kein "${forbidden}" enthalten`);
}
assert.ok(!('default_popup' in manifest.action), 'nur Seitenleiste, kein Popup (E2)');
assert.equal(manifest.side_panel.default_path, 'popup.html');
assert.deepEqual(manifest.background, { service_worker: 'background.js' });
assert.ok(Number(manifest.minimum_chrome_version) >= 116, 'sidePanel.open braucht Chrome 116');
assert.equal(manifest.commands['open-side-panel'].suggested_key.default, 'Ctrl+Shift+K');
assert.equal(Object.keys(manifest.commands).length, 1);
assert.equal(typeof manifest.key, 'string');
assert.ok(manifest.key.length >= 300, 'manifest.key fehlt oder ist zu kurz (Base64-DER eines RSA-2048-Keys)');
for (const size of ['16', '48', '128']) {
    assert.equal(manifest.icons[size], `icons/icon-${size}.png`);
    assert.equal(manifest.action.default_icon[size], `icons/icon-${size}.png`);
    assert.ok(fs.existsSync(path.join(root, 'extension', manifest.icons[size])), `Icon ${size} fehlt`);
}

// Service Worker nur zum Öffnen der Leiste: kein Netz, keine Daten.
const backgroundJs = read('extension/background.js');
assert.ok(backgroundJs.includes('setPanelBehavior({ openPanelOnActionClick: true })'));
assert.ok(backgroundJs.includes("command !== 'open-side-panel'") && backgroundJs.includes('chrome.sidePanel.open('));
assert.ok(!/fetch\(|XMLHttpRequest|chrome\.storage|importScripts|supabase/i.test(backgroundJs), 'background.js darf weder Netz noch Daten anfassen');

// popup.html: lokale Skripte in fester Reihenfolge, keine Inline-Handler, keine Remote-Ressourcen.
const popupHtml = read('extension/popup.html');
const scriptOrder = ['vendor/supabase.js', 'contract.js', 'popup.js'].map(src => popupHtml.indexOf(`<script src="${src}"></script>`));
assert.ok(scriptOrder.every(index => index >= 0), 'popup.html muss vendor/supabase.js, contract.js und popup.js laden');
assert.ok(scriptOrder[0] < scriptOrder[1] && scriptOrder[1] < scriptOrder[2], 'Skriptreihenfolge in popup.html');
assert.equal((popupHtml.match(/<script\b/g) || []).length, 3, 'popup.html darf keine weiteren (Inline-)Skripte enthalten');
assert.ok(!popupHtml.includes('kollektionen.js'), 'Kollektionen kommen als JSON von promptomizer.de, nicht als Skript im Paket (E3)');
assert.ok(!/<script[^>]+src=["']https?:/i.test(popupHtml), 'kein Remote-Skript');
assert.ok(!/<link[^>]+href=["']https?:/i.test(popupHtml), 'kein Remote-Stylesheet');
assert.ok(!/\son[a-z]+=/i.test(popupHtml), 'keine Inline-Event-Handler (MV3-CSP)');
for (const href of popupHtml.matchAll(/href="(https?:[^"]+)"/g)) {
    assert.ok(href[1].startsWith('https://www.promptomizer.de/'), `externer Link nur auf promptomizer.de: ${href[1]}`);
}
assert.ok(popupHtml.includes('rel="stylesheet" href="vendor/inter/inter.css"') && popupHtml.includes('rel="stylesheet" href="popup.css"'));
for (const font of ['inter.css', 'latin.woff2', 'latin-ext.woff2']) {
    assert.ok(fs.existsSync(path.join(root, 'extension/vendor/inter', font)), `Schrift ${font} fehlt im Paket`);
}
for (const id of ['view-login', 'view-main', 'view-sub', 'login-form', 'login-email', 'login-password', 'login-password-toggle', 'login-error', 'login-submit', 'login-google',
    'search-input', 'filter-chips', 'main-list', 'new-action', 'tab-library', 'tab-snippets', 'tab-collections', 'menu-layer', 'sheet-layer', 'toast', 'live']) {
    assert.ok(popupHtml.includes(`id="${id}"`), `DOM-Anker #${id}`);
}
assert.ok(popupHtml.includes('autocomplete="username"') && popupHtml.includes('autocomplete="current-password"'), 'Formular für Passwortmanager');
assert.ok(popupHtml.includes('href="https://www.promptomizer.de/agb"') && popupHtml.includes('href="https://www.promptomizer.de/datenschutz"'), 'Hinweis auf AGB und Datenschutz unter dem Google-Knopf');
assert.ok(!popupHtml.includes('Passwort vergessen“ ein Passwort'), 'alter Hinweis für Google-Nutzer entfällt');

// popup.js: gleiche Supabase-URL wie db.js, keine Sitzungs-/Inhaltslecks, Kopierverhalten wie die App.
const popupJs = read('extension/popup.js');
const dbJs = read('db.js');
const url = "const SUPABASE_URL = 'https://nrrsroaubbpmjyexhuhi.supabase.co';";
assert.ok(popupJs.includes(url) && dbJs.includes(url), 'SUPABASE_URL muss in popup.js und db.js identisch sein');
const anonKey = dbJs.match(/const SUPABASE_ANON_KEY = '([^']+)'/)?.[1];
assert.ok(anonKey && popupJs.includes(`const SUPABASE_ANON_KEY = '${anonKey}'`), 'SUPABASE_ANON_KEY muss dem Wert aus db.js entsprechen');
assert.ok(!popupJs.includes('signOut('), 'kein Abmelden in der Seitenleiste (E10)');
assert.ok(dbJs.includes("signOut({ scope: 'local' })"), 'Web-App meldet nur lokal ab, sonst fliegt die Extension mit raus (E4)');
assert.ok(popupJs.includes('detectSessionInUrl: false') && popupJs.includes("flowType: 'pkce'"));
assert.ok(popupJs.includes('persistSession: true') && popupJs.includes('autoRefreshToken: true'));
assert.ok(popupJs.includes('chrome.storage.local'));
assert.ok(popupJs.includes('chrome.identity.launchWebAuthFlow') && popupJs.includes('chrome.identity.getRedirectURL()') && popupJs.includes('exchangeCodeForSession'), 'Google-Anmeldung über launchWebAuthFlow mit PKCE');
assert.ok(popupJs.includes('skipBrowserRedirect: true'));
assert.ok(popupJs.includes("const COLLECTIONS_URL = 'https://www.promptomizer.de/kollektionen.json';"));
assert.ok(popupJs.includes('navigator.clipboard.writeText'));
assert.ok(popupJs.includes("copiedMessage('Prompt'") && popupJs.includes("copiedMessage('Baustein'"));
assert.ok(popupJs.includes(".is('archived_at', null)"));
assert.ok(popupJs.includes("fetchAll('library'") && popupJs.includes("fetchAll('snippets'"));
assert.ok(popupJs.includes('.update({ last_used_at: new Date().toISOString() })'));
assert.ok(popupJs.includes("query.eq('current_version', expectedVersion)"), 'neue Fassung nur auf die geladene Fassung (Konflikthinweis)');
assert.ok(popupJs.includes('contract.libraryFieldsPayload(') && popupJs.includes('contract.toStorageFields(') && popupJs.includes('contract.snippetModeFor('), 'Speicherformate nur über contract.js');
assert.ok(popupJs.includes('PromptomizerContract'));
assert.ok(!popupJs.includes('innerHTML') && !popupJs.includes('insertAdjacentHTML'), 'popup.js darf kein HTML parsen');
assert.ok(!/\beval\(|new Function\(/.test(popupJs), 'kein dynamischer Code');
assert.ok(!/umami|sentry|track\(/i.test(popupJs), 'keine Telemetrie in der Extension');
assert.ok(!/service_role|serviceRole/i.test(popupJs));
// Schreibzugriffe nur auf diese Tabellen (Leitplanke „Schreiben“), nie Löschen.
const tables = new Set([...popupJs.matchAll(/\.from\('([a-z_]+)'\)/g)].map(match => match[1]));
assert.deepEqual([...tables].sort(), ['library', 'profiles', 'prompt_categories', 'prompt_history', 'snippets']);
assert.ok(!/\.delete\(\)|\.rpc\(/.test(popupJs), 'kein Löschen und keine RPCs aus der Extension');

// contract.js: als Browser-Global und als CommonJS-Modul nutzbar.
const contractJs = read('extension/contract.js');
assert.ok(contractJs.includes('const PromptomizerContract = (() => {'));
assert.ok(contractJs.includes("if (typeof module !== 'undefined' && module.exports) module.exports = PromptomizerContract;"));

// Vendor-Kopie muss byteidentisch mit dem Bundle der Web-App bleiben.
assert.ok(
    fs.readFileSync(path.join(root, 'vendor/supabase/supabase.js')).equals(fs.readFileSync(path.join(root, 'extension/vendor/supabase.js'))),
    'extension/vendor/supabase.js weicht von vendor/supabase/supabase.js ab'
);
for (const font of ['latin.woff2', 'latin-ext.woff2']) {
    assert.ok(
        fs.readFileSync(path.join(root, 'vendor/fonts/inter', font)).equals(fs.readFileSync(path.join(root, 'extension/vendor/inter', font))),
        `extension/vendor/inter/${font} weicht von vendor/fonts/inter ab`
    );
}

// Auslieferung: Vercel darf den Ordner nicht veröffentlichen, Tailwind/Sitemap kennen ihn nicht.
const vercelIgnore = read('.vercelignore').split(/\r?\n/).map(line => line.trim());
assert.ok(vercelIgnore.includes('extension'), '.vercelignore muss "extension" enthalten');
assert.ok(!read('vendor/tailwind/tailwind.config.js').includes('extension/'), 'popup.html gehört nicht in die Tailwind-Content-Liste');
assert.ok(!read('sitemap.xml').includes('/extension'), 'Sitemap darf die Extension nicht führen');

console.log('extension source smoke: ok');
