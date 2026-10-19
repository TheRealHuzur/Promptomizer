// Router: eigene Adressen für die Kollektionen innerhalb der einen App.
// Nur /app/kollektionen und /app/kollektionen/<id>; alle anderen Bereiche bleiben unter /app.
// vercel.json schreibt beide Pfade auf app.html um. Wegen <base href="/"> nur absolute Pfade verwenden.
//
// Liegt als äußerste Schicht um window.switchView und muss deshalb nach collections.js geladen werden.
// Umami zählt history.pushState und history.replaceState als Seitenaufruf:
// - pushState nur für gewollte Bereichswechsel (zählt),
// - Korrekturen und das Merken der Ansicht laufen still über replaceUrlSilently() aus app.html,
// - Zurück/Vor zählt Umami nicht von selbst, deshalb meldet countPageview() den neuen Stand.
(function () {
    'use strict';

    const APP_PATH = '/app';
    const COLLECTIONS_PATH = '/app/kollektionen';
    const KNOWN_VIEWS = ['editor', 'library', 'collections', 'history', 'settings', 'konto', 'impressum', 'datenschutz', 'agb', 'cookies'];
    const UNKNOWN_COLLECTION_HINT = 'Diese Kollektion gibt es nicht mehr. Hier findest du alle Kollektionen.';

    let currentView = 'editor';
    let applying = false;
    let onboardingDeferred = false;
    let unknownCollectionOnStart = false;
    // Pfad und Query des zuletzt angewendeten Eintrags; ein reiner Hash-Wechsel (z. B. wenn
    // Supabase die Tokens aus der Adresse entfernt) löst popstate aus und wird übergangen.
    let lastUrlKey = '';

    // '/app/kollektionen' → { collectionId: null }, '/app/kollektionen/<id>' → { collectionId }, sonst null.
    // Groß-/Kleinschreibung und ein Schrägstrich am Ende werden toleriert.
    function parseRoute(pathname) {
        let path = String(pathname || '').toLowerCase().replace(/\/+$/, '');
        try {
            path = decodeURIComponent(path);
        } catch (error) {
            return null;
        }
        if (path === COLLECTIONS_PATH) return { collectionId: null };
        const match = path.match(/^\/app\/kollektionen\/([^/]+)$/);
        return match ? { collectionId: match[1] } : null;
    }

    function pathFor(view, collectionId) {
        if (view !== 'collections') return APP_PATH;
        return collectionId ? `${COLLECTIONS_PATH}/${encodeURIComponent(collectionId)}` : COLLECTIONS_PATH;
    }

    // Beim Wechsel bleiben Parameter wie ?intent= erhalten; utm_* zählt nur der Einstiegsaufruf.
    function searchForPush() {
        const params = new URLSearchParams(window.location.search);
        Array.from(params.keys()).forEach(key => {
            if (key.toLowerCase().startsWith('utm_')) params.delete(key);
        });
        const query = params.toString();
        return query ? `?${query}` : '';
    }

    function urlKey() {
        return `${window.location.pathname}${window.location.search}`;
    }

    function replaceSilently(state, url) {
        if (typeof window.replaceUrlSilently === 'function') window.replaceUrlSilently(url, state);
        else History.prototype.replaceState.call(window.history, state, '', url);
    }

    function collectionsApi() {
        return window.PromptCollections || null;
    }

    function currentCollectionId() {
        return currentView === 'collections' ? collectionsApi()?.getCollectionId?.() || null : null;
    }

    function syncUrl() {
        const collectionId = currentCollectionId();
        const path = pathFor(currentView, collectionId);
        const state = { view: currentView, collectionId };
        if (path === window.location.pathname) {
            replaceSilently(state, window.location.href);
        } else {
            window.history.pushState(state, '', `${path}${searchForPush()}`);
        }
        lastUrlKey = urlKey();
    }

    function releaseOnboarding() {
        if (!onboardingDeferred) return;
        onboardingDeferred = false;
        // Vor dem ersten Auth-Ereignis übernimmt checkOnboarding() aus dem Auth-Listener in app.html.
        if (window.authStateKnown && typeof window.checkOnboarding === 'function') {
            window.checkOnboarding(window.currentUser);
        }
    }

    function patchViewSwitching() {
        if (!window.switchView || window.switchView.__routerPatched) return;
        const original = window.switchView;
        const wrapped = function (viewId) {
            original(viewId);
            currentView = KNOWN_VIEWS.includes(viewId) ? viewId : 'editor';
            if (viewId === 'editor') releaseOnboarding();
            if (!applying) syncUrl();
        };
        wrapped.__routerPatched = true;
        window.switchView = wrapped;
    }

    function applyRoute(view, collectionId) {
        applying = true;
        try {
            if (view === 'collections') {
                const found = collectionsApi()?.showCollection?.(collectionId || null) !== false;
                window.switchView('collections');
                return found;
            }
            window.switchView(KNOWN_VIEWS.includes(view) ? view : 'editor');
            return true;
        } finally {
            applying = false;
        }
    }

    // Zurück/Vor: Umami hängt nur an pushState/replaceState. Ein replaceState auf die schon
    // gesetzte Adresse lässt Umami den neuen Stand als Seitenaufruf zählen.
    function countPageview() {
        window.history.replaceState(window.history.state, '', window.location.href);
    }

    function routeFromState(state) {
        const route = parseRoute(window.location.pathname);
        if (route) return { view: 'collections', collectionId: route.collectionId };
        const view = state && KNOWN_VIEWS.includes(state.view) && state.view !== 'collections' ? state.view : 'editor';
        return { view, collectionId: null };
    }

    function handlePopState(event) {
        if (urlKey() === lastUrlKey && !event.state) return;
        const route = routeFromState(event.state);
        const found = applyRoute(route.view, route.collectionId);
        if (!found) {
            replaceSilently({ view: 'collections', collectionId: null }, `${COLLECTIONS_PATH}${window.location.search}`);
        }
        lastUrlKey = urlKey();
        countPageview();
    }

    // Läuft beim Laden des Skripts, also vor dem verzögert geladenen Umami: Korrekturen der
    // Einstiegsadresse sieht Umami nur als einen Seitenaufruf mit der korrigierten Adresse.
    function prepareEntry() {
        const route = parseRoute(window.location.pathname);
        if (!route) {
            replaceSilently({ view: 'editor', collectionId: null }, window.location.href);
            lastUrlKey = urlKey();
            return null;
        }

        onboardingDeferred = true;
        let collectionId = route.collectionId;
        if (collectionId && !collectionsApi()?.exists?.(collectionId)) {
            unknownCollectionOnStart = true;
            collectionId = null;
        }
        const path = pathFor('collections', collectionId);
        replaceSilently({ view: 'collections', collectionId }, `${path}${window.location.search}${window.location.hash}`);
        lastUrlKey = urlKey();
        return { view: 'collections', collectionId };
    }

    function init() {
        patchViewSwitching();
        const entry = prepareEntry();
        window.addEventListener('popstate', handlePopState);
        window.addEventListener('collections-route', () => {
            if (currentView === 'collections') syncUrl();
        });
        if (!entry) return;

        const open = () => {
            applyRoute(entry.view, entry.collectionId);
            if (unknownCollectionOnStart) window.showToast?.(UNKNOWN_COLLECTION_HINT, 'info', 6000);
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', open);
        else open();
    }

    window.PromptRouter = {
        parseRoute,
        pathFor,
        isOnboardingDeferred: () => onboardingDeferred
    };

    init();
})();
