// Browser-Ladetest der Chrome-Extension (Seitenleiste, Version 1.1).
// Echtes Chromium mit geladener Erweiterung aus extension/; Supabase wird von einem kleinen,
// zustandsbehafteten Nachbau abgefangen (Limits, Fassungen, Kategorie-Sync wie die Trigger,
// PKCE-Tausch für Google). kollektionen.json kommt aus dem Repo, mit CORS-Header wie vercel.json.
// Die Zwischenablage wird mitgeschrieben, weil Headless-Chromium sie nicht verlässlich bereitstellt.
// Die Seitenleiste selbst kann Playwright nicht öffnen; die Oberfläche läuft als Tab mit Leistenmaßen.
//
// Aufruf (Playwright-Container, Repo schreibgeschützt unter /repo, Ausgabe unter /out):
//   S=<scratch>; mkdir -p $S/shots; cp tests/extension-sidepanel-browser.mjs $S/run.mjs
//   echo '{"type":"module"}' > $S/package.json
//   docker run --rm --user $(id -u):$(id -g) -e HOME=/tmp -v $S:/e2e -w /e2e \
//     mcr.microsoft.com/playwright:v1.59.1-noble npm i --no-audit --no-fund playwright@1.59.1
//   docker run --rm --user $(id -u):$(id -g) -e HOME=/tmp -v $PWD:/repo:ro -v $S:/out -v $S:/e2e -w /e2e \
//     mcr.microsoft.com/playwright:v1.59.1-noble node /e2e/run.mjs
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const contract = require('/repo/extension/contract.js');

const EXT = '/repo/extension';
const SHOTS = '/out/shots';
const COLLECTIONS_JSON = fs.readFileSync('/repo/kollektionen.json', 'utf8');
const COLLECTION_COUNT = JSON.parse(COLLECTIONS_JSON).collections.length;
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${info ? ' – ' + info : ''}`); };
const USER = '00000000-0000-4000-8000-000000000001';

// ---------- Nachbau des Backends ----------
const now = Date.now();
const iso = (m) => new Date(now - m * 60000).toISOString();
let db;
const calls = [];
const otherCalls = [];
const authCalls = [];
let failNextLibraryRead = false;
let collectionsMode = 'ok';
const collectionsCalls = [];

function scenario(kind) {
  if (kind === 'free') {
    const categories = [{ id: 1, name: '2. Brain' }, { id: 2, name: 'AgentHub' }, { id: 3, name: 'Beratungsprojekte' }, { id: 4, name: 'Vorlagen' }];
    const p = (id, name, extra) => ({ id, name, created_at: iso(900), updated_at: iso(800), description: null, is_favorite: false, last_used_at: null, category: null, category_id: null, current_version: 1, archived_at: null, ...extra });
    const library = [
      p(11, 'Voice-Aufbereiter', { fields: { mode: 'free', text: 'Bereite das Diktat auf.' }, is_favorite: true, last_used_at: iso(5), category_id: 1 }),
      p(12, 'WorkDESK Neue Session', { fields: { mode: 'free', text: 'Neue Session starten.' }, is_favorite: true, category_id: 2 }),
      p(13, 'Meeting Protokoll', { fields: ['Du bist eine erfahrene Protokollführung.', 'Das Meeting fand am [[Datum]] statt. Teilnehmende: [[Teilnehmende]].', 'Erstelle ein Ergebnisprotokoll. Formuliere [[Tonalität]].', '', 'Tabelle mit Thema, Ergebnis, Termin.'], last_used_at: iso(10), category_id: 4, current_version: 3 }),
      p(14, 'LLM Zusammenarbeit verbessern', { fields: { mode: 'free', text: 'Wie arbeiten wir besser zusammen?' }, last_used_at: iso(20) }),
      p(15, 'Abschlussbericht erstellen', { fields: { mode: 'free', text: 'Schreibe einen Abschlussbericht für die Zielgruppe [[Zielgruppe]].' }, category_id: 3 }),
      p(16, 'BPMN Modell erstellen', { fields: ['Du bist Prozessmanager.', 'Prozess [[Name]]', 'Modelliere.', '', 'BPMN-XML'], last_used_at: iso(30) }),
    ];
    const snippets = [
      { id: 21, name: 'Zielgruppe', content: 'Sachbearbeitung in der Kommunalverwaltung', mode: 'free', field_id: 'free', created_at: iso(100), updated_at: iso(100), is_favorite: false, last_used_at: null, archived_at: null },
      { id: 22, name: 'Tonalität', content: 'sachlich und freundlich', mode: 'free', field_id: 'free', created_at: iso(90), updated_at: iso(90), is_favorite: false, last_used_at: null, archived_at: null },
    ];
    return { tier: 'free', mode: 'structured', categories, library, snippets, history: [], nextId: 100 };
  }
  if (kind === 'pro') {
    const categories = Array.from({ length: 14 }, (_, i) => ({ id: i + 1, name: `Kategorie ${String.fromCharCode(65 + i)}` }));
    const library = Array.from({ length: 40 }, (_, i) => ({
      id: 200 + i, name: `Prompt ${String(i + 1).padStart(2, '0')} ${['E-Mail beantworten', 'Protokoll zusammenfassen', 'Social-Post entwerfen', 'Bescheid erklären'][i % 4]}`,
      fields: i % 3 === 0 ? { mode: 'free', text: `Freier Text ${i}` } : ['Rolle', 'Kontext ' + i, 'Aufgabe ' + i, '', 'Format'],
      created_at: iso(1000 + i), updated_at: iso(500 + i), description: null, is_favorite: i < 6, last_used_at: i < 12 ? iso(i * 10) : null,
      category: null, category_id: i % 5 === 0 ? null : (i % 14) + 1, current_version: 1, archived_at: null,
    }));
    const sn = (id, name, content, field_id, mode = 'structured') => ({ id, name, content, mode, field_id, created_at: iso(300 + id), updated_at: iso(300 + id), is_favorite: false, last_used_at: null, archived_at: null });
    const snippets = [
      sn(301, 'Freitext Hinweis', 'Bitte kurz halten.', 'free', 'free'),
      sn(302, 'Ausgabe als Tabelle', 'Antworte als Tabelle.', 'format'),
      sn(303, 'Projektleitung', 'Du bist Projektleitung in einer Kommune.', 'role'),
      sn(304, 'Zielgruppe Verwaltung', 'Sachbearbeitung in der Kommunalverwaltung', 'context'),
      sn(305, 'Ohne Einsatzbereich', 'Alter Baustein ohne field_id.', null, 'free'),
      sn(306, 'Zusammenfassen', 'Fasse in fünf Punkten zusammen.', 'task', 'both'),
      sn(307, 'Bürgerperspektive', 'Leser sind Bürgerinnen und Bürger.', 'context'),
      sn(308, 'Entwurf schreiben', 'Schreibe einen ersten Entwurf.', 'task'),
    ];
    return { tier: 'pro', mode: 'free', categories, library, snippets, history: [], nextId: 500 };
  }
  return { tier: 'free', mode: null, categories: [], library: [], snippets: [], history: [], nextId: 600 };
}

function enrich(row) {
  const type = row.fields?.mode === 'free' || typeof row.fields?.text === 'string' ? 'free' : 'structured';
  const cat = db.categories.find(c => c.id === row.category_id);
  return { ...row, prompt_type: type, category: cat ? cat.name : (row.category_id ? row.category : null) };
}

function param(url, key) {
  const v = url.searchParams.get(key);
  return v && v.startsWith('eq.') ? v.slice(3) : null;
}

function json(route, status, body, headers = {}) {
  return route.fulfill({ status, contentType: 'application/json', headers, body: body === undefined ? '' : JSON.stringify(body) });
}

const limitError = (message) => ({ code: 'P0001', message, details: null, hint: null });

async function handle(route) {
  const req = route.request();
  const url = new URL(req.url());
  const method = req.method();
  const table = url.pathname.replace('/rest/v1/', '');
  const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') {
    authCalls.push(body);
    if (body?.auth_code !== 'testcode' || String(body?.code_verifier || '').length < 43) return json(route, 400, { error: 'invalid_grant', error_description: 'bad code' });
    const exp = Math.floor(Date.now() / 1000) + 86400;
    return json(route, 200, { access_token: 'google-test', refresh_token: 'google-refresh', token_type: 'bearer', expires_in: 86400, expires_at: exp,
      user: { id: USER, aud: 'authenticated', role: 'authenticated', email: 'google@example.org', app_metadata: { provider: 'google' } } });
  }
  if (!url.pathname.startsWith('/rest/v1/')) {
    otherCalls.push(`${method} ${url.pathname}`);
    return json(route, 401, { message: 'blocked in test' });
  }
  calls.push({ method, table, url: url.search, body });

  if (method === 'HEAD') {
    const n = table === 'library' ? db.library.length : table === 'snippets' ? db.snippets.length : db.categories.length;
    return route.fulfill({ status: 200, headers: { 'content-range': `0-${Math.max(0, n - 1)}/${n}` }, body: '' });
  }
  if (method === 'GET') {
    if (table === 'library' && failNextLibraryRead) {
      failNextLibraryRead = false;
      return json(route, 401, { code: '42501', message: 'permission denied for table library' });
    }
    const idFilter = param(url, 'id');
    if (table === 'library' && idFilter) {
      const row = db.library.find(r => String(r.id) === idFilter);
      return json(route, 200, single ? (row ? enrich(row) : null) : (row ? [enrich(row)] : []));
    }
    if (table === 'library') return json(route, 200, db.library.map(enrich));
    if (table === 'snippets') return json(route, 200, db.snippets);
    if (table === 'prompt_categories') return json(route, 200, db.categories);
    if (table === 'profiles') return json(route, 200, single ? { tier: db.tier, default_editor_mode: db.mode } : [{ tier: db.tier, default_editor_mode: db.mode }]);
  }
  const full = () => db.tier === 'free' && db.library.length + db.snippets.length >= 10;
  if (method === 'POST') {
    if (table === 'prompt_history') { db.history.push(body); return json(route, 201); }
    if (table === 'library') {
      if (full()) return json(route, 400, limitError('FREE_LIMIT_REACHED'));
      const cat = body.category ? db.categories.find(c => c.name === body.category) : null;
      const row = { id: db.nextId++, name: body.name, fields: body.fields, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), description: null, is_favorite: false, last_used_at: null, category_id: cat ? cat.id : null, current_version: 1, archived_at: null };
      db.library.push(row);
      return json(route, 201, single ? enrich(row) : [enrich(row)]);
    }
    if (table === 'snippets') {
      if (full()) return json(route, 400, limitError('FREE_LIMIT_REACHED'));
      const row = { id: db.nextId++, ...body, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_favorite: false, last_used_at: null, archived_at: null };
      delete row.user_id;
      db.snippets.push(row);
      return json(route, 201, single ? row : [row]);
    }
    if (table === 'prompt_categories') {
      if (db.tier === 'free' && db.categories.length >= 5) return json(route, 400, limitError('CATEGORY_LIMIT_REACHED'));
      if (db.categories.some(c => c.name === body.name)) return json(route, 409, { code: '23505', message: 'duplicate key value' });
      const row = { id: db.nextId++, name: body.name };
      db.categories.push(row);
      return json(route, 201, single ? row : [row]);
    }
  }
  if (method === 'PATCH') {
    const id = Number(param(url, 'id'));
    const list = table === 'library' ? db.library : db.snippets;
    const row = list.find(r => r.id === id);
    if (!row) return json(route, 200, []);
    const versionFilter = param(url, 'current_version');
    if (table === 'library' && versionFilter !== null && String(row.current_version) !== versionFilter) return json(route, 200, []);
    if (table === 'library' && ('name' in body || 'fields' in body)) {
      const changed = (body.name !== undefined && body.name !== row.name) || (body.fields !== undefined && JSON.stringify(body.fields) !== JSON.stringify(row.fields));
      if (changed) row.current_version += 1;
    }
    Object.assign(row, body);
    return json(route, 200, [table === 'library' ? enrich(row) : row]);
  }
  otherCalls.push(`${method} ${url.pathname}`);
  return json(route, 400, { message: 'unhandled in test' });
}

// ---------- Browser ----------
const ctx = await chromium.launchPersistentContext('/tmp/profile', {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
await ctx.route('https://nrrsroaubbpmjyexhuhi.supabase.co/**', handle);
await ctx.route('https://www.promptomizer.de/kollektionen.json', route => {
  collectionsCalls.push(route.request().method());
  if (collectionsMode === 'fail') return route.fulfill({ status: 503, body: '' });
  return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: COLLECTIONS_JSON });
});

let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
const id = new URL(sw.url()).host;
const manifest = await sw.evaluate(() => chrome.runtime.getManifest());
check('Promptomizer 1.1.0, Store-ID über den key im Manifest', manifest.name === 'Promptomizer' && manifest.version === '1.1.0' && !manifest.version_name && id === 'omeecepdhgklmakffbbllbmfjejkjknl', `${manifest.version} ${id}`);
check('Rechte: storage, clipboardWrite, sidePanel, identity', JSON.stringify(manifest.permissions) === '["storage","clipboardWrite","sidePanel","identity"]');
check('Tastenkürzel Ctrl+Shift+K öffnet die Seitenleiste', manifest.commands?.['open-side-panel']?.suggested_key?.default === 'Ctrl+Shift+K' && Object.keys(manifest.commands).length === 1);
check('Host nur Supabase, kein Content-Script', JSON.stringify(manifest.host_permissions) === '["https://nrrsroaubbpmjyexhuhi.supabase.co/*"]' && !manifest.content_scripts);

const errors = [];
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.addInitScript(() => {
  window.__clip = [];
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__clip.push(t); } }, configurable: true });
});
const PANEL = `chrome-extension://${id}/popup.html`;
const W = 380, H = 760;
await page.setViewportSize({ width: W, height: H });
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const wait = (ms = 250) => page.waitForTimeout(ms);
const toast = () => page.locator('#toast').textContent();
const lastClip = () => page.evaluate(() => window.__clip[window.__clip.length - 1]);
const visibleText = (sel) => page.locator(sel).allTextContents();

async function login(kind) {
  db = scenario(kind);
  await page.goto(PANEL);
  await page.evaluate(async () => {
    await chrome.storage.local.clear();
    const exp = Math.floor(Date.now() / 1000) + 86400;
    const session = { access_token: 'test', refresh_token: 'test', token_type: 'bearer', expires_in: 86400, expires_at: exp,
      user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'demo@example.org' } };
    await chrome.storage.local.set({ 'promptomizer-ext-auth': JSON.stringify(session) });
  });
  await page.goto(PANEL);
  await page.waitForSelector('#view-main:not([hidden])');
  await wait(600);
}

// ---------- Anmeldung ----------
await page.goto(PANEL); await wait(400);
const loginVisible = await page.evaluate(() => !document.getElementById('view-login').hidden && document.getElementById('view-main').hidden);
check('Ohne Sitzung erscheint die Anmeldung', loginVisible);
await shot('00-anmeldung');
const loginView = await page.evaluate(() => ({
  focus: document.activeElement?.id,
  order: Array.from(document.querySelectorAll('#view-login .px-login > *')).map(n => n.id || n.className),
  legal: Array.from(document.querySelectorAll('#view-login .px-legal a')).map(a => a.getAttribute('href')),
  autocomplete: [document.getElementById('login-email').autocomplete, document.getElementById('login-password').autocomplete],
  links: Array.from(document.querySelectorAll('#view-login .px-login-links a')).map(a => a.textContent),
}));
check('Anmeldung: E-Mail-Formular zuerst und im Fokus, „Mit Google anmelden“ darunter', loginView.focus === 'login-email' && loginView.order.indexOf('login-form') < loginView.order.indexOf('px-divider') && loginView.order.indexOf('px-divider') < loginView.order.indexOf('login-google'), JSON.stringify(loginView));
check('Unter dem Google-Knopf: AGB und Datenschutzerklärung verlinkt', JSON.stringify(loginView.legal) === '["https://www.promptomizer.de/agb","https://www.promptomizer.de/datenschutz"]');
check('Formular für Passwortmanager (username, current-password), Links „Passwort vergessen?“ und „Konto anlegen“', JSON.stringify(loginView.autocomplete) === '["username","current-password"]' && JSON.stringify(loginView.links) === '["Passwort vergessen?","Konto anlegen"]');
await page.fill('#login-password', 'geheim');
await page.click('#login-password-toggle');
check('Passwort anzeigen', (await page.getAttribute('#login-password', 'type')) === 'text' && (await page.textContent('#login-password-toggle')) === 'Verbergen');
await page.click('#login-password-toggle');
check('Passwort wieder verbergen', (await page.getAttribute('#login-password', 'type')) === 'password');

// Google: Abbruch im Anmeldefenster
await page.evaluate(() => {
  chrome.identity.launchWebAuthFlow = async () => { throw new Error('The user did not approve access.'); };
});
await page.click('#login-google'); await wait(400);
check('Google-Abbruch: verständliche Meldung, Anmeldung bleibt', (await page.textContent('#login-error')) === 'Google-Anmeldung abgebrochen.' && !(await page.evaluate(() => document.getElementById('view-login').hidden)), await page.textContent('#login-error'));
// Google: erfolgreich (Fenster liefert den Code, Supabase-Tausch per PKCE)
db = scenario('free');
await page.evaluate(() => {
  chrome.identity.launchWebAuthFlow = async ({ url, interactive }) => {
    window.__authFlow = { url, interactive, redirect: chrome.identity.getRedirectURL() };
    return `${chrome.identity.getRedirectURL()}?code=testcode`;
  };
});
await page.click('#login-google');
await page.waitForSelector('#view-main:not([hidden])', { timeout: 5000 }).catch(() => {});
await wait(500);
const flow = await page.evaluate(() => window.__authFlow || { url: 'about:blank' });
const authUrl = new URL(flow.url);
check('Google: Supabase-authorize mit provider=google, PKCE und Rücksprung auf chromiumapp.org', authUrl.origin === 'https://nrrsroaubbpmjyexhuhi.supabase.co' && authUrl.pathname === '/auth/v1/authorize' && authUrl.searchParams.get('provider') === 'google' && authUrl.searchParams.get('redirect_to') === `https://${id}.chromiumapp.org/` && authUrl.searchParams.get('code_challenge_method') === 's256' && flow.interactive === true && flow.redirect === `https://${id}.chromiumapp.org/`, flow.url);
check('Google: Kontoauswahl wird angeboten (prompt=select_account)', authUrl.searchParams.get('prompt') === 'select_account');
check('Google: Code wird per PKCE getauscht, danach ist die Leiste angemeldet', authCalls.length === 1 && authCalls[0].auth_code === 'testcode' && !(await page.evaluate(() => document.getElementById('view-main').hidden)), JSON.stringify(authCalls.map(c => c.auth_code)));
check('Google: Sitzung liegt im Speicher der Extension', await page.evaluate(async () => { const r = await chrome.storage.local.get('promptomizer-ext-auth'); return String(r['promptomizer-ext-auth'] || '').includes('google-test'); }));

// ---------- Free-Konto: Hauptansicht (Bild 1) ----------
await login('free');
const main = await page.evaluate(() => ({
  sections: Array.from(document.querySelectorAll('#main-list .px-section')).map(n => n.textContent),
  firstGroup: document.querySelector('#main-list .px-group .px-group-name')?.textContent,
  groupsClosed: Array.from(document.querySelectorAll('#main-list .px-group')).every(g => g.getAttribute('aria-expanded') === 'false'),
  upgrade: !document.getElementById('upgrade-pill').hidden,
  limit: !document.getElementById('limit-bar').hidden,
  limitText: document.getElementById('limit-text').textContent,
  progress: document.getElementById('limit-progress').getAttribute('aria-valuenow'),
  tabs: Array.from(document.querySelectorAll('.px-tabbar-btn')).map(b => b.textContent.trim()),
  sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
  font: getComputedStyle(document.body).fontFamily,
}));
check('Abschnitte Favoriten, Zuletzt verwendet, Kategorien', JSON.stringify(main.sections) === '["Favoriten (2)","Zuletzt verwendet","Kategorien"]', JSON.stringify(main.sections));
check('„Ohne Kategorie“ ist erste Gruppe, Gruppen anfangs zu', main.firstGroup === 'Ohne Kategorie' && main.groupsClosed);
check('Upgrade-Pille im Free-Tarif', main.upgrade);
check('Limit-Hinweis ab 8 von 10 mit Fortschrittsbalken', main.limit && main.limitText === '8 von 10 Inhalten genutzt' && main.progress === '8', main.limitText);
check('Untere Leiste mit genau drei Bereichen', JSON.stringify(main.tabs) === '["Bibliothek","Bausteine","Kollektionen"]', JSON.stringify(main.tabs));
check('Kein Querüberlauf, Schrift Inter', main.sw <= main.cw && main.font.startsWith('Inter'));
const fontLoaded = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('600 14px Inter'); });
check('Inter wird aus der Extension geladen', fontLoaded);
await shot('01-liste');

// Gruppe aufklappen, Zustand bleibt gemerkt
await page.click('#main-list .px-group:has-text("Vorlagen")'); await wait();
const nestedVisible = await page.locator('#main-list .px-row-nested').count();
await page.reload(); await page.waitForSelector('#view-main:not([hidden])'); await wait(500);
const stillOpen = await page.locator('#main-list .px-group[aria-expanded="true"]').count();
check('Kategorie klappt auf, Zustand bleibt nach Neuladen', nestedVisible === 1 && stillOpen === 1);

// Klick kopiert sofort, Historie und last_used_at
calls.length = 0;
await page.click('#main-list .px-row-main:has-text("LLM Zusammenarbeit verbessern")'); await wait(400);
const clip1 = await lastClip();
const histPost = calls.filter(c => c.method === 'POST' && c.table === 'prompt_history');
const usedPatch = calls.filter(c => c.method === 'PATCH' && c.table === 'library' && c.body?.last_used_at);
check('Klick auf Zeile kopiert Text wie promptToText', clip1 === 'Wie arbeiten wir besser zusammen?');
check('Meldung „Prompt kopiert.“', (await toast()) === 'Prompt kopiert.');
check('Kopie landet in der Historie wie handleCopyAndSave', histPost.length === 1 && histPost[0].body.text === clip1 && histPost[0].body.favorite === false && !('fields' in histPost[0].body));
check('last_used_at wird gesetzt', usedPatch.length === 1);

// Offene Platzhalter
await page.click('#main-list .px-row-main:has-text("Meeting Protokoll")'); await wait(300);
const clip2 = await lastClip();
const expected = contract.promptToText(db.library.find(r => r.id === 13));
check('Strukturierter Prompt kopiert wie promptToText', clip2 === expected);
check('Meldung zählt offene Platzhalter', (await toast()) === 'Prompt kopiert. 3 Platzhalter offen.', await toast());
const toastShown = await page.evaluate(() => new Promise(r => setTimeout(() => r(document.getElementById('toast').classList.contains('is-visible')), 2000)));
check('Platzhalter-Meldung bleibt 2,5 Sekunden', toastShown);

// ---------- Bearbeiten (Bild 3) ----------
const navOf = root => page.evaluate(sel => {
  const r = document.querySelector(sel);
  return {
    areas: Array.from(r.querySelectorAll('.px-tabbar .px-tabbar-btn')).map(b => b.textContent),
    active: Array.from(r.querySelectorAll('.px-tabbar [aria-current="page"]')).map(b => b.textContent),
    neu: r.querySelector('.px-newbar-btn')?.textContent ?? null,
    back: !!r.querySelector('.px-header .px-back'),
  };
}, root);
const AREAS_OK = '["Bibliothek","Bausteine","Kollektionen"]';
await page.click('[aria-label="Meeting Protokoll bearbeiten"]'); await wait(300);
const edit = await page.evaluate(() => ({
  back: document.querySelector('#view-sub .px-back')?.textContent.trim(),
  labels: Array.from(document.querySelectorAll('#view-sub .px-label')).map(n => n.textContent),
  hint: document.querySelector('#view-sub .px-formhint')?.textContent,
  saveDisabled: document.querySelector('#view-sub .px-actionbar .px-btn-secondary').disabled,
  category: document.querySelector('#edit-category')?.textContent.trim(),
  tabbar: !!document.querySelector('#view-sub .px-tabbar'),
}));
check('Bearbeiten: Kopf, Felder Titel/Kategorie/Rolle/Kontext/Aufgabe/Format', edit.back === 'Bibliothek' && JSON.stringify(edit.labels) === '["Titel","Kategorie","Rolle","Kontext","Aufgabe","Format"]' && edit.category === 'Vorlagen', JSON.stringify(edit));
const navEdit = await navOf('#view-sub');
const editActions = await page.evaluate(() => ({
  labels: Array.from(document.querySelectorAll('#view-sub .px-actionbar button')).map(b => b.textContent.trim()),
  height: Math.round(document.querySelector('#view-sub .px-actionbar .px-btn').getBoundingClientRect().height),
}));
check('Bearbeiten: Leiste bleibt, aktiv Bibliothek, darüber Kopieren · Speichern (34 px)', JSON.stringify(navEdit.areas) === AREAS_OK && JSON.stringify(navEdit.active) === '["Bibliothek"]' && JSON.stringify(editActions.labels) === '["Kopieren","Speichern"]' && editActions.height === 34, JSON.stringify({ navEdit, editActions }));
check('Hinweis ohne Änderung nennt Fassung 3', edit.hint === 'Fassung 3. Kopieren übernimmt deine Eingaben, ohne zu speichern.' && edit.saveDisabled);
await shot('03-bearbeiten-unveraendert');
await page.fill('#edit-task', 'Erstelle ein Ergebnisprotokoll für [[Abteilung]].'); await wait();
const hint2 = await page.locator('#view-sub .px-formhint').textContent();
check('Hinweis mit Änderung: Speichern legt Fassung 4 an', hint2 === 'Speichern legt Fassung 4 an. Fassung 3 bleibt erhalten.');
check('Speichern erst nach Änderung aktiv', !(await page.locator('#view-sub .px-btn-secondary').isDisabled()));
await shot('03-bearbeiten-geaendert');

// Zurück ohne Kopie: Rückfrage
await page.click('#view-sub .px-back'); await wait(300);
const dialog = await page.evaluate(() => {
  const d = document.querySelector('#sheet-layer [role="dialog"]');
  return d ? { modal: d.getAttribute('aria-modal'), title: d.querySelector('h2').textContent, buttons: Array.from(d.querySelectorAll('button')).map(b => b.textContent), focusInside: d.contains(document.activeElement) } : null;
});
check('Rückfrage „Änderungen verwerfen?“ als modaler Dialog mit Fokus', dialog && dialog.modal === 'true' && dialog.title === 'Änderungen verwerfen?' && JSON.stringify(dialog.buttons) === '["Weiter bearbeiten","Verwerfen"]' && dialog.focusInside, JSON.stringify(dialog));
await shot('03-rueckfrage');
await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
const trapped = await page.evaluate(() => document.querySelector('#sheet-layer [role="dialog"]').contains(document.activeElement));
await page.keyboard.press('Escape'); await wait(200);
const stillEditing = await page.evaluate(() => !document.getElementById('view-sub').hidden && document.getElementById('sheet-layer').hidden);
check('Fokus bleibt im Dialog, Esc schließt ihn und man bleibt im Bearbeiten', trapped && stillEditing);
await page.click('#view-sub .px-tabbar [data-area="snippets"]'); await wait(300);
const tabAsk = await page.evaluate(() => document.querySelector('#sheet-layer:not([hidden]) h2')?.textContent);
await page.click('#sheet-layer .px-btn-primary'); await wait(300);
const keptText = await page.evaluate(() => document.getElementById('edit-task')?.value || '');
check('Bereichswechsel mit ungespeicherter Änderung fragt nach, „Weiter bearbeiten“ behält den Text', tabAsk === 'Änderungen verwerfen?' && keptText.includes('[[Abteilung]]'), JSON.stringify({ tabAsk, keptText }));

// Kopieren im Bearbeiten: ungespeicherter Stand, danach Zurück ohne Rückfrage
calls.length = 0;
await page.click('#view-sub .px-actionbar .px-btn-primary'); await wait(300);
const clip3 = await lastClip();
check('Kopieren übernimmt ungespeicherte Eingaben', clip3.includes('[[Abteilung]]') && !clip3.includes('[[Tonalität]]'));
check('Kopie aus dem Bearbeiten steht in der Historie', calls.some(c => c.table === 'prompt_history' && c.body.text === clip3));
check('Nach dem Kopieren bleibt man im Bearbeiten', !(await page.evaluate(() => document.getElementById('view-sub').hidden)));

// Speichern legt Fassung 4 an
calls.length = 0;
await page.click('#view-sub .px-btn-secondary'); await wait(300);
const savePatch = calls.find(c => c.method === 'PATCH' && c.table === 'library');
check('Speichern schreibt name/fields im Format der Web-App', savePatch && Array.isArray(savePatch.body.fields) && savePatch.body.fields.length === 5 && savePatch.body.fields[3] === '' && !('category_id' in savePatch.body), JSON.stringify(savePatch?.body));
check('Meldung „Fassung 4 gespeichert.“ und Hinweis nachgezogen', (await toast()) === 'Fassung 4 gespeichert.' && (await page.locator('#view-sub .px-formhint').textContent()).startsWith('Fassung 4.'));

// Favorit umschalten
await page.click('#view-sub .px-header .px-iconbtn'); await wait(300);
check('Stern im Kopf schaltet Favorit', db.library.find(r => r.id === 13).is_favorite === true);

// Zurück nach Kopie ohne Rückfrage
await page.fill('#edit-format', 'Liste'); await wait();
await page.click('#view-sub .px-actionbar .px-btn-primary'); await wait(300);
await page.click('#view-sub .px-back'); await wait(300);
const backDirect = await page.evaluate(() => !document.getElementById('view-main').hidden && document.getElementById('sheet-layer').hidden);
check('Nach Kopie der Änderung geht Zurück ohne Rückfrage', backDirect);
await page.click('[aria-label="Meeting Protokoll bearbeiten"]'); await wait(300);
await page.click('#view-sub .px-tabbar [data-area="library"]'); await wait(350);
check('Tipp auf „Bibliothek“ im Bearbeiten ohne Änderung führt zur Liste', await page.evaluate(() => !document.getElementById('view-main').hidden && document.getElementById('sheet-layer').hidden));

// ---------- Kategoriefilter ----------
await page.click('#chip-cat'); await wait(250);
const menu = await page.evaluate(() => Array.from(document.querySelectorAll('.px-menu .px-menu-option-label')).map(n => n.textContent));
check('Kategoriemenü: „Ohne Kategorie“ oben, dann alphabetisch', menu[0] === 'Ohne Kategorie' && JSON.stringify(menu.slice(1)) === JSON.stringify([...menu.slice(1)].sort((a, b) => a.localeCompare(b, 'de'))), JSON.stringify(menu));
await shot('01-kategoriemenue');
await page.keyboard.press('Escape'); await wait(150);
check('Esc schließt das Menü', (await page.locator('.px-menu').count()) === 0);
await page.click('#chip-cat'); await wait(150);
await page.mouse.click(20, 86); await wait(150);
check('Klick daneben schließt das Menü', (await page.locator('.px-menu').count()) === 0);
await page.click('#chip-cat'); await wait(150);
await page.click('.px-menu .px-menu-option:has-text("Vorlagen")'); await wait(250);
const flat = await page.evaluate(() => ({ sections: document.querySelectorAll('#main-list .px-section').length, names: Array.from(document.querySelectorAll('#main-list .px-row-name')).map(n => n.textContent), chip: document.getElementById('chip-cat-label').textContent }));
check('Kategoriefilter: flache Liste ohne Abschnitte und ohne Doppelungen', flat.sections === 0 && flat.names.length === new Set(flat.names).size && flat.names.includes('Meeting Protokoll') && flat.chip === 'Vorlagen', JSON.stringify(flat));
await page.fill('#search-input', 'xyzunbekannt'); await wait();
const noHitsCat = await page.locator('#main-list .px-note').textContent();
check('Keine Treffer im Filter: Hinweis mit „In allen suchen“', noHitsCat.startsWith('Keine Treffer in „Vorlagen“.') && noHitsCat.includes('In allen suchen'));
await page.click('#main-list .px-linkbtn:has-text("In allen suchen")'); await wait();
check('„In allen suchen“ hebt den Filter auf', (await page.getAttribute('#chip-all', 'aria-pressed')) === 'true');

// ---------- Suche (Bild 2) ----------
await page.fill('#search-input', 'Zielgruppe'); await wait();
const search = await page.evaluate(() => ({
  sections: Array.from(document.querySelectorAll('#main-list .px-section')).map(n => n.textContent),
  clear: !document.getElementById('search-clear').hidden,
  cancelHidden: Array.from(document.styleSheets).flatMap(sheet => Array.from(sheet.cssRules)).some(rule => rule.selectorText?.includes('::-webkit-search-cancel-button') && rule.style.display === 'none') ? 'none' : 'sichtbar',
}));
check('Suche: Treffer und „Aus Kollektionen“', search.sections[0] === 'Treffer (1)' && search.sections[1]?.startsWith('Aus Kollektionen ('), JSON.stringify(search.sections));
check('Eigenes X statt Browser-Löschsymbol', search.clear && search.cancelHidden === 'none');
await shot('02-suche');
await page.fill('#search-input', 'Wochenplanung'); await wait();
const noHits = await page.locator('#main-list .px-note').textContent();
check('Keine eigenen Treffer: Angebot als neuen Prompt', noHits.includes('Keine Treffer in deiner Bibliothek.') && noHits.includes('„Wochenplanung“ als neuen Prompt anlegen'));
await page.click('#main-list .px-linkbtn'); await wait(300);
check('Angebot öffnet „Neuer Prompt“ mit Suchbegriff als Titel', (await page.inputValue('#create-title')) === 'Wochenplanung');
await page.click('#view-sub .px-textbtn'); await wait(300);
check('Abbrechen ohne Eingabe geht ohne Rückfrage zurück', !(await page.evaluate(() => document.getElementById('view-main').hidden)));
await page.click('#search-clear'); await wait();
check('X leert die Suche', (await page.inputValue('#search-input')) === '');

// ---------- Kollektionen (Bild 6) und Übernahme ----------
const navMain = await navOf('#view-main');
check('Leiste Bibliothek: feste Bereiche, aktiv Bibliothek, darüber „Neuer Prompt“', JSON.stringify(navMain.areas) === AREAS_OK && JSON.stringify(navMain.active) === '["Bibliothek"]' && navMain.neu === 'Neuer Prompt', JSON.stringify(navMain));
await page.click('#tab-snippets'); await wait(350);
const navSnip = await navOf('#view-sub');
check('Leiste Bausteine: gleiche Reihenfolge, aktiv Bausteine, darüber „Neuer Baustein“, kein Zurück', JSON.stringify(navSnip.areas) === AREAS_OK && JSON.stringify(navSnip.active) === '["Bausteine"]' && navSnip.neu === 'Neuer Baustein' && !navSnip.back, JSON.stringify(navSnip));
await page.click('#view-sub .px-group[data-key="free"]'); await wait(100);
const newBtnHeight = await page.evaluate(() => document.querySelector('#view-sub .px-newbar-btn').getBoundingClientRect().height);
const titleStyle = await page.evaluate(() => {
  const t = document.querySelector('#view-sub .px-area-title');
  const logo = getComputedStyle(document.querySelector('#view-main .px-logo'));
  const parts = Array.from(t.children).map(s => [s.textContent, getComputedStyle(s).color]);
  const cs = getComputedStyle(t);
  return { parts, same: cs.fontSize === logo.fontSize && cs.fontWeight === logo.fontWeight };
});
check('Überschrift „Bausteine“ so groß wie die Wortmarke, „Bau“ weiß, „steine“ blau', titleStyle.same && JSON.stringify(titleStyle.parts) === '[["Bau","rgb(255, 255, 255)"],["steine","rgb(56, 189, 248)"]]', JSON.stringify(titleStyle));
check('„Neu“-Schaltfläche ist schmal (34 px)', Math.round(newBtnHeight) === 34, String(newBtnHeight));
await page.click('#view-sub .px-tabbar [data-area="collections"]'); await wait(50);
const anim = await page.evaluate(() => getComputedStyle(document.getElementById('view-sub')).animationName);
check('Wechsel nach rechts in der Leiste schiebt von rechts herein', anim === 'px-in-right');
await wait(350);
const navColl = await navOf('#view-sub');
check('Überschrift „Kollektionen“: „Kollekt“ weiß, „ionen“ blau', (await page.evaluate(() => Array.from(document.querySelectorAll('#view-sub .px-area-title span')).map(s => s.textContent).join('|'))) === 'Kollekt|ionen');
check('Leiste Kollektionen: aktiv Kollektionen, keine „Neu“-Schaltfläche', JSON.stringify(navColl.areas) === AREAS_OK && JSON.stringify(navColl.active) === '["Kollektionen"]' && navColl.neu === null && !navColl.back, JSON.stringify(navColl));
await shot('09-leiste-kollektionen');
await page.click('#view-sub .px-tabbar [data-area="snippets"]'); await wait(50);
check('Wechsel nach links in der Leiste schiebt von links herein', (await page.evaluate(() => getComputedStyle(document.getElementById('view-sub')).animationName)) === 'px-in-left');
await wait(350);
await shot('09-leiste-bausteine');
await page.click('#view-sub .px-tabbar [data-area="collections"]'); await wait(350);
const collections = await page.locator('#view-sub .px-row2').count();
check('Kollektionen kommen live von promptomizer.de (kollektionen.json mit CORS)', collections === COLLECTION_COUNT && collectionsCalls.length >= 1, `${collections} / ${collectionsCalls.length} Abrufe`);
check('Kollektionsübersicht ohne gestrichelte Rahmen', collections > 0 && (await page.evaluate(() => Array.from(document.querySelectorAll('#view-sub .px-row2')).every(n => getComputedStyle(n).borderStyle !== 'dashed'))));
await shot('06-kollektionen');
await page.click('#view-sub .px-row2-main >> nth=0'); await wait(300);
const collTitle = await page.locator('#view-sub .px-h2').textContent();
check('Kollektion: Zurück heißt „Kollektionen“', (await page.locator('#view-sub .px-back').textContent()).trim() === 'Kollektionen');
const navCollPage = await navOf('#view-sub');
check('Kollektion: Leiste bleibt, aktiv Kollektionen, keine „Neu“-Schaltfläche', JSON.stringify(navCollPage.areas) === AREAS_OK && JSON.stringify(navCollPage.active) === '["Kollektionen"]' && navCollPage.neu === null, JSON.stringify(navCollPage));
await shot('06-kollektion');
await page.click('#view-sub .px-list .px-row2-main >> nth=0'); await wait(300);
const detail = await page.evaluate(() => ({
  back: document.querySelector('#view-sub .px-back').textContent.trim(),
  marks: document.querySelectorAll('#view-sub .px-preview mark.px-ph').length,
  adopt: document.querySelector('#view-sub .px-actionbar .px-btn-primary').textContent,
  copyLabel: document.querySelector('#view-sub .px-actionbar .px-iconbtn-square').getAttribute('aria-label'),
}));
check('Prompt-Detail: Zurück heißt wie die Kollektion, Platzhalter hervorgehoben', detail.back === collTitle && detail.marks > 0, JSON.stringify(detail));
check('Knöpfe „In meine Bibliothek übernehmen“ und „Nur kopieren“', detail.adopt === 'In meine Bibliothek übernehmen' && detail.copyLabel === 'Nur kopieren');
await shot('06-kollektion-prompt');
calls.length = 0;
await page.click('#view-sub .px-iconbtn-square'); await wait(300);
check('„Nur kopieren“ kopiert ohne Historie', (await lastClip()).length > 20 && !calls.some(c => c.table === 'prompt_history'));
await page.click('#view-sub .px-actionbar .px-btn-primary'); await wait(300);
const adoptSheet = await page.evaluate(() => ({ title: document.querySelector('#sheet-layer h2')?.textContent, checked: document.querySelector('#sheet-layer .px-choice[aria-checked="true"]')?.textContent }));
check('Übernahme fragt „In welche Kategorie?“, Standard „Ohne Kategorie“', adoptSheet.title === 'In welche Kategorie?' && adoptSheet.checked === 'Ohne Kategorie');
await shot('06-uebernehmen-kategorie');
await page.click('#sheet-layer .px-choice:has-text("AgentHub")');
await page.click('#sheet-layer .px-btn-primary'); await wait(400);
const adoptPost = calls.find(c => c.method === 'POST' && c.table === 'library');
const afterAdopt = await page.evaluate(() => ({ label: document.querySelector('#view-sub .px-label')?.textContent, toast: document.getElementById('toast').textContent }));
check('Übernahme legt eigenen Prompt mit Kategorie an und öffnet Bearbeiten', adoptPost?.body.category === 'AgentHub' && afterAdopt.label === 'Titel' && afterAdopt.toast === 'In Bibliothek übernommen.', JSON.stringify(afterAdopt));
await page.click('#view-sub .px-back'); await wait(300);
await page.click('#tab-collections'); await wait(300);
await page.click('#view-sub .px-row2-main >> nth=0'); await wait(300);
check('Übernommener Prompt trägt „Übernommen“', (await page.locator('#view-sub .px-adopted').count()) === 1);
await page.click('#view-sub .px-list .px-row2-main >> nth=0'); await wait(300);
check('Bei übernommenen Prompts heißt der Knopf „In Bibliothek öffnen“', (await page.locator('#view-sub .px-actionbar .px-btn-primary').textContent()) === 'In Bibliothek öffnen');
check('Kollektions-Prompt: Übernehmen · Kopieren über der Leiste', (await page.evaluate(() => document.querySelectorAll('#view-sub .px-actionbar + .px-tabbar').length)) === 1);
await page.click('#view-sub .px-tabbar [data-area="collections"]'); await wait(350);
check('Tipp auf den aktiven Bereich führt zur Kollektionsübersicht', (await page.evaluate(() => Array.from(document.querySelectorAll('#view-sub .px-area-title span')).map(s => s.textContent).join(''))) === 'Kollektionen');
await page.click('#view-sub .px-tabbar [data-area="library"]'); await wait(50);
const backAnim = await page.evaluate(() => getComputedStyle(document.getElementById('view-main')).animationName);
check('Bibliothek in der Leiste schiebt von links herein', backAnim === 'px-in-left');
await wait(300);

// ---------- Neuer Prompt (Bild 4) ----------
await page.click('#new-action'); await wait(300);
const create = await page.evaluate(() => ({
  pressed: document.querySelector('.px-segment [aria-pressed="true"]')?.textContent,
  labels: Array.from(document.querySelectorAll('#view-sub .px-label')).map(n => n.textContent),
  placeholders: Array.from(document.querySelectorAll('#view-sub textarea')).map(n => n.placeholder),
  saveDisabled: document.querySelector('#view-sub .px-actionbar .px-btn-primary').disabled,
  category: document.getElementById('create-category').textContent.trim(),
  segHeight: Math.round(document.querySelector('.px-segment').getBoundingClientRect().height),
}));
check('Standardmodus aus dem Profil (Strukturiert)', create.pressed === 'Strukturiert');
check('Strukturiert: vier Felder mit Platzhaltern der Web-App', JSON.stringify(create.placeholders) === JSON.stringify(['Wer soll die KI sein? (z.B. Senior SEO Experte)', 'Hintergrundinfos (Zielgruppe, Kanal, Produkt...)', 'Was soll getan werden? (Schreibe 3 Headlines...)', 'Ausgabeformat (Tabelle, Markdown, Liste...)']));
check('„In Bibliothek speichern“ erst mit Text, Kategorie vorbelegt „Ohne Kategorie“', create.saveDisabled && create.category === 'Ohne Kategorie');
check('Umschalter etwa 24 px hoch', create.segHeight >= 22 && create.segHeight <= 28, `${create.segHeight}px`);
await shot('04-neuer-prompt');
await page.fill('#create-task', 'Schreibe drei Varianten für einen Newsletter-Betreff\nmit Bezug auf [[Zielgruppe]]'); await wait();
check('Titelvorschlag aus der Aufgabe', (await page.getAttribute('#create-title', 'placeholder')) === 'Schreibe drei Varianten für einen Newsletter-Betreff');
await page.click('.px-segment button:has-text("Frei")'); await wait();
check('Frei: eigenes Textfeld, Entwurf je Modus bleibt getrennt', (await page.inputValue('#create-text')) === '' && (await page.getAttribute('#create-text', 'placeholder')) === 'Prompt hier einfügen oder schreiben...');
await page.click('.px-segment button:has-text("Strukturiert")'); await wait();
check('Zurück zu Strukturiert behält den Entwurf', (await page.inputValue('#create-task')).startsWith('Schreibe drei'));

// Kategorie anlegen im Menü
await page.click('#create-category'); await wait(250);
const footer = await page.evaluate(() => {
  const menu = document.querySelector('.px-menu');
  const foot = menu.querySelector('.px-menu-footer');
  return { text: foot?.textContent.trim(), last: menu.lastElementChild === foot, border: getComputedStyle(foot).borderTopStyle };
});
check('„Kategorie anlegen“ unten fixiert und abgetrennt', footer.text === 'Kategorie anlegen' && footer.last && footer.border === 'solid');
await page.click('.px-menu-footer .px-menu-option'); await wait(150);
await page.fill('.px-menu-create input', 'Newsletter');
await page.keyboard.press('Enter'); await wait(400);
check('Enter legt Kategorie an und wählt sie aus', db.categories.some(c => c.name === 'Newsletter') && (await page.locator('#create-category').textContent()).trim() === 'Newsletter');
await page.click('#create-category'); await wait(200);
await page.click('.px-menu-footer .px-menu-option'); await wait(300);
const catLimit = await page.evaluate(() => ({ title: document.querySelector('#sheet-layer h2')?.textContent, text: document.querySelector('#sheet-layer .px-sheet-text')?.textContent }));
check('Kategorielimit: Hinweis bei 5 von 5', catLimit.title === 'Alle 5 Kategorien sind belegt.' && catLimit.text === 'Mit Pro legst du unbegrenzt viele Kategorien an. Ohne Kategorie kannst du den Prompt jederzeit speichern.', JSON.stringify(catLimit));
await page.click('#sheet-layer .px-btn-secondary'); await wait(200);
calls.length = 0;
await page.click('#view-sub .px-actionbar .px-btn-primary'); await wait(500);
const createPost = calls.find(c => c.method === 'POST' && c.table === 'library');
check('Speichern legt Prompt mit Vorschlagstitel und Kategorie an', createPost?.body.name === 'Schreibe drei Varianten für einen Newsletter-Betreff' && createPost.body.category === 'Newsletter' && Array.isArray(createPost.body.fields), JSON.stringify(createPost?.body));
check('Zurück zur Liste mit „Prompt gespeichert.“', !(await page.evaluate(() => document.getElementById('view-main').hidden)) && (await toast()) === 'Prompt gespeichert.');

// ---------- Limit erreicht (Bild 7) ----------
await wait(400);
const limitFull = await page.evaluate(() => ({ text: document.getElementById('limit-text').textContent, full: document.getElementById('limit-progress').classList.contains('is-full'), color: getComputedStyle(document.getElementById('limit-progress-fill')).backgroundColor }));
check('Bei 10 von 10 Balken hellrot', limitFull.text === '10 von 10 Inhalten genutzt' && limitFull.full && limitFull.color === 'rgb(248, 113, 113)', JSON.stringify(limitFull));
calls.length = 0;
await page.click('#new-action'); await wait(300);
const limitSheet = await page.evaluate(() => ({ title: document.querySelector('#sheet-layer h2')?.textContent, actions: Array.from(document.querySelectorAll('#sheet-layer .px-btn')).map(b => `${b.tagName}:${b.textContent}:${b.getAttribute('target') || ''}`) }));
check('„Neuer Prompt“ zeigt sofort den Limit-Hinweis', limitSheet.title === 'Alle 10 Plätze sind belegt.' && JSON.stringify(limitSheet.actions) === '["A:Pro ansehen:_blank","BUTTON:Später:"]' && !calls.some(c => c.method === 'POST'), JSON.stringify(limitSheet));
await shot('07-limit-erreicht');
await page.click('#sheet-layer .px-btn-secondary'); await wait(200);
await page.click('#tab-snippets'); await wait(300);
await shot('05-bausteine');
const snippetRows = await page.evaluate(() => Array.from(document.querySelectorAll('#view-sub .px-row2')).map(r => r.textContent));
check('Bausteine: Name und Wert in zweiter Zeile', snippetRows.includes('ZielgruppeSachbearbeitung in der Kommunalverwaltung'), JSON.stringify(snippetRows));
await page.click('#view-sub .px-row2-main:has-text("Zielgruppe")'); await wait(300);
check('Klick auf Baustein kopiert den Wert', (await lastClip()) === 'Sachbearbeitung in der Kommunalverwaltung' && (await toast()) === 'Baustein kopiert.');
await page.click('#view-sub .px-newbar-btn'); await wait(300);
check('„Neuer Baustein“ zeigt bei 10 von 10 den Limit-Hinweis', (await page.locator('#sheet-layer h2').textContent()) === 'Alle 10 Plätze sind belegt.');
await page.keyboard.press('Escape'); await wait(200);
await page.click('[aria-label="Tonalität bearbeiten"]'); await wait(300);
check('Stift öffnet „Baustein bearbeiten“ mit Name und Inhalt', (await page.locator('#view-sub .px-header-title').textContent()) === 'Baustein bearbeiten' && (await page.inputValue('#snippet-content')) === 'sachlich und freundlich');
await page.fill('#snippet-content', 'sachlich, freundlich und klar'); await wait();
calls.length = 0;
await page.click('#view-sub .px-actionbar .px-btn-primary'); await wait(400);
const snippetPatch = calls.find(c => c.method === 'PATCH' && c.table === 'snippets');
check('Baustein speichern aktualisiert nur Name und Inhalt', snippetPatch && JSON.stringify(Object.keys(snippetPatch.body).sort()) === '["content","name"]' && (await toast()) === 'Baustein gespeichert.');

// Bereichswechsel aus dem Baustein-Formular: „Verwerfen“ speichert nichts
await page.click('[aria-label="Tonalität bearbeiten"]'); await wait(300);
check('Baustein-Formular: Leiste bleibt, aktiv Bausteine', JSON.stringify((await navOf('#view-sub')).active) === '["Bausteine"]');
await page.fill('#snippet-content', 'wird verworfen'); await wait();
calls.length = 0;
await page.click('#view-sub .px-tabbar [data-area="collections"]'); await wait(300);
await page.click('#sheet-layer .px-btn-danger'); await wait(400);
const afterDiscard = await page.evaluate(() => Array.from(document.querySelectorAll('#view-sub .px-area-title span')).map(s => s.textContent).join(''));
check('„Verwerfen“ beim Bereichswechsel öffnet den neuen Bereich, nichts gespeichert', afterDiscard === 'Kollektionen' && !calls.some(c => c.method === 'PATCH' || c.method === 'POST'), afterDiscard);

// Fehler beim Schreiben verwirft keine Eingaben
await page.click('#view-sub .px-tabbar [data-area="library"]'); await wait(350);
await page.click('[aria-label="Voice-Aufbereiter bearbeiten"]'); await wait(300);
await page.fill('#edit-text', 'Neuer Text, der bleiben muss'); await wait();
await ctx.unroute('https://nrrsroaubbpmjyexhuhi.supabase.co/**', handle);
await ctx.route('https://nrrsroaubbpmjyexhuhi.supabase.co/**', r => r.request().method() === 'PATCH' ? json(r, 500, { message: 'boom' }) : handle(r));
await page.click('#view-sub .px-btn-secondary'); await wait(400);
check('Fehler beim Speichern: Meldung, Eingabe bleibt', (await toast()) === 'Speichern war nicht möglich.' && (await page.inputValue('#edit-text')) === 'Neuer Text, der bleiben muss');
await ctx.unroute('https://nrrsroaubbpmjyexhuhi.supabase.co/**');
await ctx.route('https://nrrsroaubbpmjyexhuhi.supabase.co/**', handle);
await page.click('#view-sub .px-back'); await wait(200);
await page.click('#sheet-layer .px-btn-danger'); await wait(300);

// Anmeldung bleibt bei einem einzelnen 401 bestehen
failNextLibraryRead = true;
await page.evaluate(() => { const real = Date.now; Date.now = () => real() + 2 * 60000; window.dispatchEvent(new Event('focus')); });
await wait(800);
check('Ein 401 beim Nachladen meldet nicht ab, solange die Sitzung besteht', !(await page.evaluate(() => document.getElementById('view-main').hidden)) && (await page.evaluate(() => document.getElementById('view-login').hidden)));

// Konflikt: Der Prompt wurde inzwischen an anderer Stelle geändert
await page.click('[aria-label="Voice-Aufbereiter bearbeiten"]'); await wait(300);
const voice = db.library.find(r => r.id === 11);
const loadedVersion = voice.current_version;
voice.fields = { mode: 'free', text: 'In der App geändert' };
voice.current_version += 1;
await page.fill('#edit-text', 'Meine Änderung in der Leiste'); await wait();
calls.length = 0;
await page.click('#view-sub .px-actionbar .px-btn-secondary'); await wait(500);
const conflictPatch = calls.find(c => c.method === 'PATCH' && c.table === 'library');
const conflictSheet = await page.evaluate(() => ({ title: document.querySelector('#sheet-layer h2')?.textContent, actions: Array.from(document.querySelectorAll('#sheet-layer .px-btn')).map(b => b.textContent) }));
check('Speichern nur auf die geladene Fassung (current_version im Filter)', conflictPatch && conflictPatch.url.includes(`current_version=eq.${loadedVersion}`), conflictPatch?.url);
check('Konflikt: Rückfrage „Inzwischen geändert“ mit „Meine Fassung speichern“ und „Neu laden“', conflictSheet.title === 'Inzwischen geändert' && JSON.stringify(conflictSheet.actions) === '["Meine Fassung speichern","Neu laden"]', JSON.stringify(conflictSheet));
check('Konflikt: in der App geänderter Text bleibt unangetastet', voice.fields.text === 'In der App geändert');
await shot('03-konflikt');
await page.click('#sheet-layer .px-btn-secondary'); await wait(400);
check('„Neu laden“ zeigt die aktuelle Fassung', (await page.inputValue('#edit-text')) === 'In der App geändert' && (await toast()) === 'Aktuelle Fassung geladen.', await toast());
voice.fields = { mode: 'free', text: 'Noch einmal in der App geändert' };
voice.current_version += 1;
await page.fill('#edit-text', 'Meine Fassung gewinnt'); await wait();
await page.click('#view-sub .px-actionbar .px-btn-secondary'); await wait(500);
calls.length = 0;
await page.click('#sheet-layer .px-btn-primary'); await wait(500);
const forcedPatch = calls.find(c => c.method === 'PATCH' && c.table === 'library');
check('„Meine Fassung speichern“ legt eine neue Fassung auf den aktuellen Stand', forcedPatch && forcedPatch.url.includes(`current_version=eq.${voice.current_version - 1}`) && voice.fields.text === 'Meine Fassung gewinnt' && (await toast()) === `Fassung ${voice.current_version} gespeichert.`, `${forcedPatch?.url} ${await toast()}`);
await page.click('#view-sub .px-back'); await wait(300);

// Kollektionen ohne Netz und ohne gespeicherten Stand
collectionsMode = 'fail';
await page.evaluate(() => chrome.storage.local.remove('promptomizer-ext-collections'));
await page.reload(); await page.waitForSelector('#view-main:not([hidden])'); await wait(500);
await page.click('#tab-collections'); await wait(500);
const offline = await page.evaluate(() => ({ title: document.querySelector('#collection-list .px-empty-title')?.textContent, retry: document.querySelector('#collection-list .px-btn')?.textContent }));
check('Ohne Netz und ohne Stand: klarer Hinweis statt leerer Fläche', offline.title === 'Kollektionen gerade nicht erreichbar.' && offline.retry === 'Erneut versuchen', JSON.stringify(offline));
await shot('06-kollektionen-offline');
collectionsMode = 'ok';
await page.click('#collection-list .px-btn'); await wait(500);
check('„Erneut versuchen“ lädt die Kollektionen', (await page.locator('#collection-list .px-row2').count()) === COLLECTION_COUNT);
collectionsMode = 'fail';
await page.reload(); await page.waitForSelector('#view-main:not([hidden])'); await wait(500);
await page.click('#tab-collections'); await wait(400);
check('Ohne Netz bleibt der zuletzt geladene Stand', (await page.locator('#collection-list .px-row2').count()) === COLLECTION_COUNT);
collectionsMode = 'ok';
await page.click('#view-sub .px-tabbar [data-area="library"]'); await wait(350);

// Externe Links
const links = await page.evaluate(() => Array.from(document.querySelectorAll('a[href^="http"]')).map(a => `${a.getAttribute('href')}|${a.target}|${a.rel}`));
check('Alle externen Links öffnen in neuem Tab', links.length >= 3 && links.every(l => l.endsWith('|_blank|noopener')), JSON.stringify(links));

// Fokus: Eingabefeld mit leichtem blauen Rand, Knöpfe nur bei Tastatur
await page.click('#search-input'); await wait(100);
const focusStyle = await page.evaluate(() => getComputedStyle(document.getElementById('search-input')).borderColor);
await page.click('#chip-all'); await wait(100);
const mouseOutline = await page.evaluate(() => getComputedStyle(document.getElementById('chip-all')).outlineStyle);
await page.keyboard.press('Tab'); await wait(100);
const kbOutline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
check('Fokus: blauer Rand im Feld, Rahmen nur bei Tastatur', focusStyle === 'rgb(14, 165, 233)' && mouseOutline === 'none' && kbOutline === 'solid', `${focusStyle} ${mouseOutline} ${kbOutline}`);

// ---------- Pro-Konto: stehende Überschriften, viele Kategorien ----------
await login('pro');
const pro = await page.evaluate(() => ({ upgrade: !document.getElementById('upgrade-pill').hidden, limit: !document.getElementById('limit-bar').hidden }));
check('Pro: keine Upgrade-Pille, kein Limit-Hinweis', !pro.upgrade && !pro.limit);
await page.click('#new-action'); await wait(300);
check('Pro mit Standard „Frei“: Umschalter auf Frei', (await page.locator('.px-segment [aria-pressed="true"]').textContent()) === 'Frei');
await page.click('#view-sub .px-textbtn'); await wait(300);
await page.evaluate(() => { document.getElementById('main-list').scrollTop = 260; }); await wait(150);
const sticky = await page.evaluate(() => {
  const list = document.getElementById('main-list');
  const top = list.getBoundingClientRect().top;
  const stuck = Array.from(list.querySelectorAll('.px-section')).filter(n => Math.abs(n.getBoundingClientRect().top - top) < 1);
  const chips = document.getElementById('filter-chips').getBoundingClientRect().bottom;
  const below = document.elementFromPoint(40, top + 1);
  return { stuck: stuck.map(n => n.textContent), gap: Math.round(top - chips), covered: stuck.length ? stuck[stuck.length - 1].contains(below) : false };
});
check('Überschrift bleibt oben stehen, ohne Lücke unter den Chips', sticky.stuck.length >= 1 && sticky.gap <= 0 && sticky.covered, JSON.stringify(sticky));
await shot('01-liste-pro-gescrollt');
await page.click('#chip-cat'); await wait(250);
const scrollMenu = await page.evaluate(() => { const l = document.querySelector('.px-menu-list'); return { scrolls: l.scrollHeight > l.clientHeight, first: l.querySelector('.px-menu-option-label').textContent }; });
check('Kategoriemenü scrollt bei vielen Einträgen', scrollMenu.scrolls && scrollMenu.first === 'Ohne Kategorie', JSON.stringify(scrollMenu));
await page.keyboard.press('Escape');

// Bewegung reduziert: nur überblenden
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.click('#tab-snippets'); await wait(100);
const reduced = await page.evaluate(() => getComputedStyle(document.getElementById('view-sub')).animationName);
check('prefers-reduced-motion: nur überblenden', reduced === 'px-fade-in', reduced);
await page.emulateMedia({ reducedMotion: 'no-preference' });

// ---------- Bausteine: Suche und Einsatzbereiche ----------
await wait(300);
const snipView = () => page.evaluate(() => ({
  search: !!document.getElementById('snippet-search'),
  focused: document.activeElement?.id,
  headings: Array.from(document.querySelectorAll('#snippet-list .px-section')).map(n => n.textContent),
  groups: Array.from(document.querySelectorAll('#snippet-list .px-group')).map(n => `${n.querySelector('.px-group-name').textContent} ${n.querySelector('.px-group-count').textContent} ${n.getAttribute('aria-expanded')}`),
  rows: Array.from(document.querySelectorAll('#snippet-list .px-row2-title')).map(n => n.textContent),
  nested: document.querySelectorAll('#snippet-list .px-row2-nested').length,
  note: document.querySelector('#snippet-list .px-note')?.textContent ?? null,
}));
const sv1 = await snipView();
check('Bausteine: Suchfeld oben, Fokus im Suchfeld', sv1.search && sv1.focused === 'snippet-search', JSON.stringify(sv1));
check('Einsatzbereiche als Gruppen wie die Kategorien: Reihenfolge der Web-App, Anzahl, anfangs zu', JSON.stringify(sv1.headings) === '["Einsatzbereiche"]' && JSON.stringify(sv1.groups) === '["Rolle & Funktion 1 false","Kontext 2 false","Aufgabe 2 false","Format 1 false","Freie Bausteine 2 false"]' && sv1.rows.length === 0, JSON.stringify(sv1));
await shot('05-bausteine-kategorien');
await page.click('#snippet-list .px-group[data-key="context"]'); await wait(100);
const svOpen = await snipView();
check('Klick öffnet die Gruppe: eingerückt, nach Namen sortiert, Fokus bleibt auf der Gruppe', JSON.stringify(svOpen.rows) === '["Bürgerperspektive","Zielgruppe Verwaltung"]' && svOpen.nested === 2 && (await page.evaluate(() => document.activeElement?.dataset.key)) === 'context', JSON.stringify(svOpen));
await page.click('#snippet-list .px-group[data-key="free"]'); await wait(100);
check('Baustein ohne field_id steht unter „Freie Bausteine“', JSON.stringify((await snipView()).rows) === '["Bürgerperspektive","Zielgruppe Verwaltung","Freitext Hinweis","Ohne Einsatzbereich"]');
await shot('05-bausteine-gruppe-offen');
await page.click('#snippet-list .px-group[data-key="free"]'); await wait(100);
check('Zweiter Klick schließt die Gruppe wieder', JSON.stringify((await snipView()).rows) === '["Bürgerperspektive","Zielgruppe Verwaltung"]');
await page.fill('#snippet-search', 'kommun'); await wait();
const sv2 = await snipView();
check('Suche wie in der Bibliothek: flache Trefferliste über Name und Inhalt', JSON.stringify(sv2.headings) === '["Treffer (2)"]' && sv2.groups.length === 0 && JSON.stringify(sv2.rows.slice().sort()) === '["Projektleitung","Zielgruppe Verwaltung"]', JSON.stringify(sv2));
await shot('05-bausteine-suche');
await page.fill('#snippet-search', 'xyzzy'); await wait();
check('Keine Treffer: Hinweis', (await snipView()).note === 'Keine Treffer in deinen Bausteinen.');
await page.fill('#snippet-search', 'tabelle'); await wait();
await page.click('#view-sub .px-tabbar [data-area="library"]'); await wait(350);
await page.click('#tab-snippets'); await wait(350);
check('Suchbegriff bleibt beim Bereichswechsel erhalten', (await page.inputValue('#snippet-search')) === 'tabelle' && JSON.stringify((await snipView()).rows) === '["Ausgabe als Tabelle"]');
await page.focus('#snippet-search'); await page.keyboard.press('Escape'); await wait();
const svEsc = await snipView();
check('Esc leert die Suche, offene Gruppe bleibt offen', (await page.inputValue('#snippet-search')) === '' && svEsc.groups.length === 5 && JSON.stringify(svEsc.rows) === '["Bürgerperspektive","Zielgruppe Verwaltung"]', JSON.stringify(svEsc));

// ---------- Bausteine: Einsatzbereich wählen ----------
const groupField = () => page.evaluate(() => {
  const button = document.getElementById('snippet-group');
  const labels = Array.from(document.querySelectorAll('#view-sub .px-label')).map(l => l.textContent);
  return { label: button?.querySelector('.px-select-label')?.textContent ?? null, linked: !!document.querySelector('#view-sub label[for="snippet-group"]'), labels, saveDisabled: document.querySelector('#view-sub .px-actionbar .px-btn-primary')?.disabled };
});
await page.click('#view-sub .px-newbar-btn'); await wait(300);
const gf1 = await groupField();
check('Neuer Baustein: Feld „Einsatzbereich“ zwischen Name und Inhalt, vorbelegt mit „Freie Bausteine“', gf1.label === 'Freie Bausteine' && gf1.linked && JSON.stringify(gf1.labels) === '["Name","Einsatzbereich","Inhalt"]', JSON.stringify(gf1));
await page.fill('#snippet-name', 'Rückfragen zulassen');
await page.fill('#snippet-content', 'Stelle Rückfragen, wenn etwas fehlt.'); await wait();
await page.click('#snippet-group'); await wait(200);
const groupMenu = await page.evaluate(() => Array.from(document.querySelectorAll('.px-menu-option')).map(o => `${o.querySelector('.px-menu-option-label').textContent}:${o.getAttribute('aria-selected')}`));
check('Menü zeigt die fünf Einsatzbereiche in der Reihenfolge der Web-App, aktuell „Freie Bausteine“', JSON.stringify(groupMenu) === '["Rolle & Funktion:false","Kontext:false","Aufgabe:false","Format:false","Freie Bausteine:true"]', JSON.stringify(groupMenu));
await shot('05-baustein-einsatzbereich');
await page.click('.px-menu-option:has-text("Aufgabe")'); await wait(150);
check('Auswahl übernimmt den Bereich und gibt den Fokus an das Feld zurück', (await groupField()).label === 'Aufgabe' && (await page.evaluate(() => document.activeElement?.id)) === 'snippet-group');
calls.length = 0;
await page.click('#view-sub .px-actionbar .px-btn-primary'); await wait(400);
const snippetPost = calls.find(c => c.method === 'POST' && c.table === 'snippets');
check('Anlegen schreibt field_id und mode wie die Web-App', snippetPost && snippetPost.body.field_id === 'task' && snippetPost.body.mode === 'structured' && (await toast()) === 'Baustein gespeichert.', JSON.stringify(snippetPost?.body));
const svNew = await snipView();
check('Nach dem Speichern ist der Zielbereich aufgeklappt und zeigt den neuen Baustein', svNew.groups.includes('Aufgabe 3 true') && svNew.rows.includes('Rückfragen zulassen'), JSON.stringify(svNew));

// Vorhandener Baustein ohne field_id: steht als „Freie Bausteine“ im Formular, Umstellen auf Format
await page.click('#snippet-list .px-group[data-key="free"]'); await wait(100);
await page.click('[aria-label="Ohne Einsatzbereich bearbeiten"]'); await wait(300);
const gf2 = await groupField();
check('Baustein ohne field_id: Formular zeigt „Freie Bausteine“, Speichern gesperrt', gf2.label === 'Freie Bausteine' && gf2.saveDisabled === true, JSON.stringify(gf2));
await page.click('#snippet-group'); await wait(200);
await page.click('.px-menu-option:has-text("Format")'); await wait(150);
check('Nur der Bereich geändert: Speichern wird frei', (await groupField()).saveDisabled === false);
calls.length = 0;
await page.click('#view-sub .px-actionbar .px-btn-primary'); await wait(400);
const groupPatch = calls.find(c => c.method === 'PATCH' && c.table === 'snippets');
check('Bereich ändern schickt field_id und mode mit', groupPatch && groupPatch.body.field_id === 'format' && groupPatch.body.mode === 'structured' && groupPatch.body.name === 'Ohne Einsatzbereich', JSON.stringify(groupPatch?.body));
const svMoved = await snipView();
check('Baustein steht danach unter „Format“, die Gruppe ist aufgeklappt', svMoved.groups.includes('Format 2 true') && svMoved.groups.includes('Freie Bausteine 1 true') && svMoved.rows.includes('Ohne Einsatzbereich'), JSON.stringify(svMoved));

// mode „both“ bleibt erhalten, solange der Bereich gleich bleibt
await page.click('[aria-label="Zusammenfassen bearbeiten"]'); await wait(300);
check('Baustein mit mode „both“ zeigt seinen Bereich', (await groupField()).label === 'Aufgabe');
await page.fill('#snippet-content', 'Fasse in drei Punkten zusammen.'); await wait();
calls.length = 0;
await page.click('#view-sub .px-actionbar .px-btn-primary'); await wait(400);
const bothPatch = calls.find(c => c.method === 'PATCH' && c.table === 'snippets');
check('Unveränderter Bereich: nur Name und Inhalt, mode „both“ bleibt', bothPatch && JSON.stringify(Object.keys(bothPatch.body).sort()) === '["content","name"]', JSON.stringify(bothPatch?.body));

// ---------- Erster Start (Bild 8) ----------
await login('empty');
const empty = await page.evaluate(() => ({ title: document.querySelector('.px-empty-title')?.textContent, text: document.querySelector('.px-empty-text')?.textContent, buttons: Array.from(document.querySelectorAll('.px-empty button')).map(b => b.textContent), chips: document.getElementById('filter-chips').hidden }));
check('Leere Bibliothek: Einladung zum ersten Prompt', empty.title === 'Lege deinen ersten Prompt an.' && empty.text === 'Oder übernimm einen fertigen aus den Kollektionen.' && JSON.stringify(empty.buttons) === '["Ersten Prompt anlegen","Kollektionen ansehen"]' && empty.chips, JSON.stringify(empty));
await shot('08-erster-start');
await page.click('#tab-snippets'); await wait(300);
const emptySnip = await page.evaluate(() => ({ text: document.querySelector('#view-sub .px-empty')?.textContent }));
check('Leere Bausteine ohne Erklärsatz zu Platzhaltern', emptySnip.text === 'Noch keine Bausteine.Ersten Baustein anlegen', JSON.stringify(emptySnip));

// Breiten 280 bis 560
for (const w of [280, 560]) {
  await page.setViewportSize({ width: w, height: H });
  await login('free');
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check(`Kein Querüberlauf bei ${w}px`, m.sw <= m.cw, JSON.stringify(m));
  await shot(`01-liste-${w}`);
}

// Absichtlich erzeugte Antworten (500 beim Speichern, 401 beim Nachladen, 503 für die Kollektionen) meldet Chrome als Ladefehler.
const unexpected = errors.filter(e => !/^Failed to load resource: the server responded with a status of (500|401|503)/.test(e));
check('Keine Konsolen- oder CSP-Fehler außer den provozierten', unexpected.length === 0 && errors.length - unexpected.length <= 4, errors.join(' | '));
check('Keine Auth- oder Fremdaufrufe', otherCalls.length === 0, otherCalls.join(', '));
await ctx.close();
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed} von ${results.length} Prüfungen bestanden`);
process.exit(failed ? 1 : 0);
