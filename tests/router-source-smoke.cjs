// Deep Links auf Kollektionen: router.js, vercel.json, robots.txt, Vorschau-Tags und Umami-Zählung.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const app = read('app.html');
const router = read('router.js');
const robots = read('robots.txt');
const vercel = JSON.parse(read('vercel.json'));

// Einbindung: Router als äußerste switchView-Schicht nach collections.js, von Cookiebot ausgenommen.
assert(app.includes('<script src="router.js" data-cookieconsent="ignore"></script>'));
assert(app.indexOf('src="collections.js"') < app.indexOf('src="router.js"'), 'router.js muss nach collections.js geladen werden');
assert(router.includes('__routerPatched'));

// Hosting: nur die Kollektionspfade werden umgeschrieben, noindex per Header für die ganze App.
const rewrites = vercel.rewrites || [];
['/app/kollektionen', '/app/kollektionen/:id'].forEach(source => {
    const rule = rewrites.find(item => item.source === source);
    assert(rule, `Rewrite ${source} fehlt`);
    assert.equal(rule.destination, '/app');
});
assert(!rewrites.some(rule => /^\/app\/:path|^\/app\/\(\.\*\)/.test(rule.source)), 'Kein Catch-all für /app/*: andere Unterpfade bleiben 404');
['/app', '/app/(.*)'].forEach(source => {
    const rule = (vercel.headers || []).find(item => item.source === source);
    assert(rule, `Header-Regel ${source} fehlt`);
    assert(rule.headers.some(header => header.key === 'X-Robots-Tag' && /noindex/.test(header.value)));
});
assert(!fs.existsSync(path.join(root, 'app')), 'Ein Ordner app/ würde die Rewrites verdecken');

// robots.txt: /app nicht sperren, sonst sehen Suchmaschinen das noindex nicht.
assert(!/^\s*Disallow:\s*\/app\b/im.test(robots), 'robots.txt darf /app nicht sperren');

// Vorschau-Tags ohne og:url/canonical, noindex bleibt.
assert(app.includes('<meta name="robots" content="noindex, follow">'));
['og:title', 'og:description', 'og:image', 'twitter:card'].forEach(tag => assert(app.includes(`"${tag}"`), `${tag} fehlt`));
assert(!app.includes('property="og:url"'), 'Kein og:url in der App');
assert(!app.includes('rel="canonical"'), 'Kein canonical in der App');

// Parameter-Aufräumen ohne zweiten Umami-Aufruf und ohne den History-Zustand zu verlieren.
assert(!app.includes('history.replaceState({}'), 'replaceState({}) überschreibt den Router-Zustand');
assert(app.includes("History.prototype.replaceState.call(window.history, state, '', url)"));
assert.equal((app.match(/replaceUrlSilently\(/g) || []).length, 4, 'Definition plus drei Aufräumstellen');
// Standard-Editormodus nach dem Login reißt niemanden aus den Kollektionen.
assert(app.includes('setEditorMode(preferredMode, { keepView: true })'));
assert(app.includes('if (window.PromptRouter?.isOnboardingDeferred?.()) return;'));

// Links in öffentlichen Seiten zeigen nur auf vorhandene Kollektionen.
const collectionWindow = {};
vm.runInNewContext(read('kollektionen.js'), { window: collectionWindow });
const collectionIds = new Set(collectionWindow.PROMPTOMIZER_COLLECTIONS.map(collection => collection.id));
const htmlFiles = execFileSync('git', ['ls-files', '*.html'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
htmlFiles.forEach(file => {
    for (const match of read(file).matchAll(/\/app\/kollektionen\/([^"'?#<\s]+)/g)) {
        assert(collectionIds.has(match[1]), `${file}: Link auf unbekannte Kollektion ${match[1]}`);
    }
});

// Verhalten in einer Sandbox: Location/History mit Umami-artigem Hook auf den Instanzmethoden.
function createBrowser(startUrl) {
    const counted = [];
    const listeners = {};
    const location = {};
    const setUrl = url => {
        const next = new URL(url, location.href || 'https://www.promptomizer.de/');
        Object.assign(location, { href: next.href, pathname: next.pathname, search: next.search, hash: next.hash });
    };
    setUrl(startUrl);
    class History {
        constructor() { this.state = null; }
        pushState(state, title, url) { this.state = state; setUrl(url); }
        replaceState(state, title, url) { this.state = state; setUrl(url); }
    }
    const history = new History();
    // Wie Umami: Instanzmethoden umhüllen und jede neue Adresse zählen.
    let last = location.href;
    ['pushState', 'replaceState'].forEach(name => {
        const original = history[name];
        history[name] = (...args) => {
            original.apply(history, args);
            if (location.href !== last) counted.push(location.pathname + location.search);
            last = location.href;
        };
    });
    const window = {
        location,
        history,
        authStateKnown: true,
        currentUser: null,
        addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
        dispatchEvent: event => (listeners[event.type] || []).forEach(fn => fn(event)),
        showToast: (message) => { window.lastToast = message; },
        replaceUrlSilently: (url, state = history.state) => History.prototype.replaceState.call(history, state, '', url)
    };
    const views = [];
    window.switchView = viewId => views.push(viewId);
    let collectionId = null;
    window.PromptCollections = {
        exists: id => collectionIds.has(id),
        showCollection: id => { const found = !id || collectionIds.has(id); collectionId = found ? id || null : null; return found; },
        getCollectionId: () => collectionId
    };
    const document = { readyState: 'complete', addEventListener: () => {} };
    const sandbox = { window, document, History, URLSearchParams, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } } };
    vm.createContext(sandbox);
    vm.runInContext(router, sandbox);
    const popTo = url => {
        setUrl(url);
        (listeners.popstate || []).forEach(fn => fn({ state: history.state }));
    };
    return { window, location, history, counted, views, popTo, openCollection: id => { collectionId = id; window.dispatchEvent({ type: 'collections-route' }); } };
}

// Pfade lesen und bauen.
const probe = createBrowser('https://www.promptomizer.de/app');
const { parseRoute, pathFor } = probe.window.PromptRouter;
assert.deepEqual({ ...parseRoute('/app/kollektionen') }, { collectionId: null });
assert.deepEqual({ ...parseRoute('/app/Kollektionen/Service-Design/') }, { collectionId: 'service-design' });
assert.equal(parseRoute('/app'), null);
assert.equal(parseRoute('/app/bibliothek'), null);
assert.equal(parseRoute('/app/kollektionen/a/b'), null);
assert.equal(pathFor('collections', null), '/app/kollektionen');
assert.equal(pathFor('collections', 'oeffentlicher-dienst'), '/app/kollektionen/oeffentlicher-dienst');
assert.equal(pathFor('library', null), '/app');
assert.equal(probe.counted.length, 0, 'Einstieg auf /app zählt kein Router-Aufruf');
assert.equal(probe.views.length, 0, 'Einstieg auf /app schaltet keine Ansicht');

// Einstieg über einen Kollektionslink mit UTM: Kollektion öffnen, Onboarding zurückstellen, nichts zusätzlich zählen.
const entry = createBrowser('https://www.promptomizer.de/app/kollektionen/oeffentlicher-dienst?utm_source=linkedin&utm_medium=social');
assert.deepEqual(entry.views, ['collections']);
assert.equal(entry.window.PromptCollections.getCollectionId(), 'oeffentlicher-dienst');
assert.equal(entry.window.PromptRouter.isOnboardingDeferred(), true);
assert.equal(entry.location.search, '?utm_source=linkedin&utm_medium=social', 'UTM bleibt für den Einstiegsaufruf erhalten');
assert.equal(entry.counted.length, 0);

// Wechsel: zurück zur Übersicht und in den Editor zählen je einmal, UTM wird nicht weitergetragen.
entry.openCollection(null);
assert.equal(entry.location.pathname, '/app/kollektionen');
assert.equal(entry.location.search, '');
entry.window.switchView('editor');
assert.equal(entry.location.pathname, '/app');
assert.equal(entry.window.PromptRouter.isOnboardingDeferred(), false, 'Onboarding nach erstem Editorwechsel frei');
// Wechsel zwischen Bereichen ohne eigenen Pfad zählt nicht.
entry.window.switchView('library');
assert.equal(entry.history.state.view, 'library');
assert.deepEqual(entry.counted, ['/app/kollektionen', '/app']);

// Zurück: Kollektionsübersicht wieder anzeigen und als Seitenaufruf zählen.
entry.popTo('/app/kollektionen');
assert.equal(entry.views.at(-1), 'collections');
assert.equal(entry.window.PromptCollections.getCollectionId(), null);
assert.deepEqual(entry.counted, ['/app/kollektionen', '/app', '/app/kollektionen']);
// Reiner Hash-Wechsel (Supabase entfernt Tokens) wird übergangen.
const viewsBefore = entry.views.length;
entry.history.state = null;
entry.popTo('/app/kollektionen#');
assert.equal(entry.views.length, viewsBefore);

// Unbekannte Kollektion: still auf die Übersicht korrigieren, Hinweis zeigen, nichts zählen.
const unknown = createBrowser('https://www.promptomizer.de/app/kollektionen/gibt-es-nicht?utm_source=mastodon');
assert.equal(unknown.location.pathname, '/app/kollektionen');
assert.equal(unknown.location.search, '?utm_source=mastodon');
assert.equal(unknown.window.PromptCollections.getCollectionId(), null);
assert.match(unknown.window.lastToast, /gibt es nicht mehr/);
assert.equal(unknown.counted.length, 0);

// Uneinheitliche Schreibweise wird normalisiert.
const mixed = createBrowser('https://www.promptomizer.de/app/Kollektionen/Service-Design');
assert.equal(mixed.location.pathname, '/app/kollektionen/service-design');

console.log('router-source-smoke: ok');
