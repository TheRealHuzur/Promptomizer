const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Manifest: MV3, minimale Rechte, keine Hintergrund-/Content-Skripte.
const manifest = JSON.parse(read('extension/manifest.json'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, 'Promptomizer');
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.deepEqual([...manifest.permissions].sort(), ['clipboardWrite', 'storage']);
assert.deepEqual(manifest.host_permissions, ['https://nrrsroaubbpmjyexhuhi.supabase.co/*']);
for (const forbidden of ['content_scripts', 'background', 'web_accessible_resources', 'optional_permissions', 'optional_host_permissions', 'content_security_policy']) {
    assert.ok(!(forbidden in manifest), `manifest darf kein "${forbidden}" enthalten`);
}
assert.equal(manifest.action.default_popup, 'popup.html');
assert.equal(manifest.commands._execute_action.suggested_key.default, 'Alt+Shift+P');
assert.equal(Object.keys(manifest.commands).length, 1);
assert.equal(typeof manifest.key, 'string');
assert.ok(manifest.key.length >= 300, 'manifest.key fehlt oder ist zu kurz (Base64-DER eines RSA-2048-Keys)');
for (const size of ['16', '48', '128']) {
    assert.equal(manifest.icons[size], `icons/icon-${size}.png`);
    assert.equal(manifest.action.default_icon[size], `icons/icon-${size}.png`);
    assert.ok(fs.existsSync(path.join(root, 'extension', manifest.icons[size])), `Icon ${size} fehlt`);
}

// popup.html: lokale Skripte in fester Reihenfolge, keine Inline-Handler, keine Remote-Ressourcen.
const popupHtml = read('extension/popup.html');
const scriptOrder = ['vendor/supabase.js', 'contract.js', 'popup.js'].map(src => popupHtml.indexOf(`<script src="${src}"></script>`));
assert.ok(scriptOrder.every(index => index >= 0), 'popup.html muss vendor/supabase.js, contract.js und popup.js laden');
assert.ok(scriptOrder[0] < scriptOrder[1] && scriptOrder[1] < scriptOrder[2], 'Skriptreihenfolge in popup.html');
assert.equal((popupHtml.match(/<script\b/g) || []).length, 3, 'popup.html darf keine weiteren (Inline-)Skripte enthalten');
assert.ok(!/<script[^>]+src=["']https?:/i.test(popupHtml), 'kein Remote-Skript');
assert.ok(!/<link[^>]+href=["']https?:/i.test(popupHtml), 'kein Remote-Stylesheet');
assert.ok(!/\son[a-z]+=/i.test(popupHtml), 'keine Inline-Event-Handler (MV3-CSP)');
for (const href of popupHtml.matchAll(/href="(https?:[^"]+)"/g)) {
    assert.ok(href[1].startsWith('https://www.promptomizer.de/'), `externer Link nur auf promptomizer.de: ${href[1]}`);
}
assert.ok(popupHtml.includes('rel="stylesheet" href="popup.css"'));
for (const id of ['view-login', 'view-library', 'login-form', 'login-email', 'login-password', 'login-error', 'logout-btn', 'tab-prompts', 'tab-snippets', 'search-input', 'result-list', 'empty-state', 'status-text', 'toast']) {
    assert.ok(popupHtml.includes(`id="${id}"`), `DOM-Anker #${id}`);
}
assert.ok(popupHtml.includes('role="tablist"') && popupHtml.includes('role="listbox"'));
assert.ok(popupHtml.includes('Passwort vergessen'), 'Hinweis für Google-Nutzer');

// popup.js: gleiche Supabase-URL wie db.js, keine Sitzungs-/Inhaltslecks, Kopierverhalten wie die App.
const popupJs = read('extension/popup.js');
const dbJs = read('db.js');
const url = "const SUPABASE_URL = 'https://nrrsroaubbpmjyexhuhi.supabase.co';";
assert.ok(popupJs.includes(url) && dbJs.includes(url), 'SUPABASE_URL muss in popup.js und db.js identisch sein');
const anonKey = dbJs.match(/const SUPABASE_ANON_KEY = '([^']+)'/)?.[1];
assert.ok(anonKey && popupJs.includes(`const SUPABASE_ANON_KEY = '${anonKey}'`), 'SUPABASE_ANON_KEY muss dem Wert aus db.js entsprechen');
assert.ok(popupJs.includes("signOut({ scope: 'local' })"), 'Abmelden darf die Web-App nicht ausloggen');
assert.ok(popupJs.includes('detectSessionInUrl: false'));
assert.ok(popupJs.includes('persistSession: true') && popupJs.includes('autoRefreshToken: true'));
assert.ok(popupJs.includes('chrome.storage.local'));
assert.ok(popupJs.includes('navigator.clipboard.writeText'));
assert.ok(popupJs.includes("'Prompt kopiert'") && popupJs.includes("'Baustein kopiert'"));
assert.ok(popupJs.includes(".is('archived_at', null)"));
assert.ok(popupJs.includes("fetchAll('library'") && popupJs.includes("fetchAll('snippets'"));
assert.ok(popupJs.includes('.update({ last_used_at: new Date().toISOString() })'));
assert.ok(popupJs.includes('PromptomizerContract'));
assert.ok(!popupJs.includes('innerHTML'), 'popup.js darf kein innerHTML verwenden');
assert.ok(!/umami|sentry|track\(/i.test(popupJs), 'keine Telemetrie in der Extension');
assert.ok(!/service_role|serviceRole/i.test(popupJs));

// contract.js: als Browser-Global und als CommonJS-Modul nutzbar.
const contractJs = read('extension/contract.js');
assert.ok(contractJs.includes('const PromptomizerContract = (() => {'));
assert.ok(contractJs.includes("if (typeof module !== 'undefined' && module.exports) module.exports = PromptomizerContract;"));

// Vendor-Kopie muss byteidentisch mit dem Bundle der Web-App bleiben.
assert.ok(
    fs.readFileSync(path.join(root, 'vendor/supabase/supabase.js')).equals(fs.readFileSync(path.join(root, 'extension/vendor/supabase.js'))),
    'extension/vendor/supabase.js weicht von vendor/supabase/supabase.js ab'
);

// Auslieferung: Vercel darf den Ordner nicht veröffentlichen, Tailwind/Sitemap kennen ihn nicht.
const vercelIgnore = read('.vercelignore').split(/\r?\n/).map(line => line.trim());
assert.ok(vercelIgnore.includes('extension'), '.vercelignore muss "extension" enthalten');
assert.ok(!read('vendor/tailwind/tailwind.config.js').includes('extension/'), 'popup.html gehört nicht in die Tailwind-Content-Liste');
assert.ok(!read('sitemap.xml').includes('/extension'), 'Sitemap darf die Extension nicht führen');

console.log('extension source smoke: ok');
