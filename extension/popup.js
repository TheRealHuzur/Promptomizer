// Promptomizer Chrome-Extension – Logik der Seitenleiste (Version 1.1).
//
// Kein Content-Script, kein Zugriff auf fremde Seiten. Der Service Worker (background.js)
// öffnet nur die Seitenleiste und fasst keine Daten an.
// Die Extension meldet sich wie die Web-App mit dem öffentlichen Anon-Key an (E-Mail und
// Passwort oder Google über chrome.identity.launchWebAuthFlow mit PKCE) und arbeitet mit
// einem gewöhnlichen Nutzer-Token gegen dieselben RLS-geschützten Tabellen.
// Prompt-Inhalte werden nirgends protokolliert. Kollektionen kommen als reine Daten
// (JSON) von www.promptomizer.de, kein nachgeladener Code.
//
// Schreibwege wie in der Web-App (db.js, library.js, collections.js); Speicherformate
// liegen in contract.js und sind per Drift-Test an die App gekoppelt:
// - Neue Fassung: UPDATE library (name, fields); der Trigger schreibt prompt_versions
//   und erhöht current_version (db.saveScenarioVersion). Gespeichert wird nur, wenn
//   current_version noch der geladenen Fassung entspricht, sonst fragt die Leiste nach.
// - Neuer Prompt / Übernahme: INSERT library mit Kategoriename (db.saveScenario).
// - Kategorie: INSERT prompt_categories (db.createPromptCategory).
// - Kopieren eines eigenen Prompts: INSERT prompt_history wie handleCopyAndSave in app.html,
//   dazu last_used_at.
// - Limits: Trigger FREE_LIMIT_REACHED / CATEGORY_LIMIT_REACHED; die Vorprüfung zählt wie
//   db.getPromptCount (Prompts + Bausteine inkl. Archiv) und db.getCategoryCount.
(() => {
    'use strict';

    // Identisch mit db.js (öffentlich by design).
    const SUPABASE_URL = 'https://nrrsroaubbpmjyexhuhi.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ycnNyb2F1YmJwbWp5ZXhodWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MzU2ODcsImV4cCI6MjA4MzExMTY4N30.UcUIVDHiV6o5thTyeO8r5cylhPpNGl6Tpc3J0qsSxoM';

    const PRICING_URL = 'https://www.promptomizer.de/preise';
    // Kollektionen als JSON, erzeugt aus kollektionen.js (tools/build-kollektionen-json.cjs),
    // ausgeliefert mit CORS-Header (vercel.json).
    const COLLECTIONS_URL = 'https://www.promptomizer.de/kollektionen.json';
    const COLLECTIONS_REFRESH_MS = 60 * 60 * 1000;

    const AUTH_STORAGE_KEY = 'promptomizer-ext-auth';
    const CACHE_KEY = 'promptomizer-ext-cache';
    const UI_KEY = 'promptomizer-ext-ui';
    const ADOPTED_KEY = 'promptomizer-ext-adopted';
    const COLLECTIONS_KEY = 'promptomizer-ext-collections';
    const CACHE_VERSION = 2;
    const PAGE_SIZE = 200;
    const MAX_ITEMS = 1000;
    const MAX_RENDERED = 200;
    const TOAST_MS = 1400;
    const TOAST_PLACEHOLDER_MS = 2500;
    const RECENT_LIMIT = 5;
    const PANEL_REFRESH_MS = 60 * 1000;

    // Free-Tarif wie check_free_plan_limit und der Kategorie-Trigger.
    const FREE_CONTENT_LIMIT = 10;
    const FREE_CATEGORY_LIMIT = 5;
    const LIMIT_HINT_FROM = 8;

    const NO_CATEGORY = 'Ohne Kategorie';
    const NONE_KEY = 'none';

    // Spalten wie librarySelect in library.js / getLibrarySnippets in db.js, ohne user_id.
    const LIBRARY_SELECT = 'id, name, fields, created_at, category, category_id, description, is_favorite, last_used_at, prompt_type, current_version, updated_at';
    const SNIPPET_SELECT = 'id, name, content, mode, field_id, created_at, updated_at, is_favorite, last_used_at';

    // Feldreihenfolge und Platzhalter wie FIELDS in app.html, Beschriftung nach dem Redesign.
    const STRUCTURED_FIELDS = [
        { key: 'role', label: 'Rolle', placeholder: 'Wer soll die KI sein? (z.B. Senior SEO Experte)' },
        { key: 'context', label: 'Kontext', placeholder: 'Hintergrundinfos (Zielgruppe, Kanal, Produkt...)' },
        { key: 'task', label: 'Aufgabe', placeholder: 'Was soll getan werden? (Schreibe 3 Headlines...)' },
        { key: 'format', label: 'Format', placeholder: 'Ausgabeformat (Tabelle, Markdown, Liste...)' }
    ];

    // Offene Platzhalter im Kopiertext. Bausteine ersetzen sie nicht (die Web-App kennt
    // keine Ersetzung von [[Name]]); gezählt werden alle [[...]].
    const OPEN_PLACEHOLDER = /\[\[[^[\]\n]+\]\]/g;
    // Hervorhebung wie PLACEHOLDER_PATTERN in collections.js.
    const PREVIEW_PLACEHOLDER = /\[\[([^[\]\n]+)\]\]|\[([^[\]\n]+)\](?!\()/g;

    const contract = PromptomizerContract;
    // Wird aus dem Zwischenspeicher und danach von promptomizer.de gefüllt (loadCollections).
    let COLLECTIONS = [];
    let collectionIndex = [];
    let collectionsStatus = 'loading';
    let collectionsFetchedAt = 0;

    const chromeStorageAdapter = {
        async getItem(key) {
            const result = await chrome.storage.local.get(key);
            return result[key] ?? null;
        },
        async setItem(key, value) {
            await chrome.storage.local.set({ [key]: value });
        },
        async removeItem(key) {
            await chrome.storage.local.remove(key);
        }
    };

    const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            storage: chromeStorageAdapter,
            storageKey: AUTH_STORAGE_KEY,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            // PKCE für die Google-Anmeldung: der Code-Verifier liegt im selben Speicher.
            flowType: 'pkce'
        }
    });

    const state = {
        user: null,
        tier: null,
        defaultMode: null,
        prompts: [],
        snippets: [],
        categories: [],
        contentCount: 0,
        indexed: [],
        filter: 'all',
        query: '',
        snippetQuery: '',
        openGroups: new Set(),
        openSnippetGroups: new Set(),
        adopted: {},
        fetchedAt: null,
        refreshing: false,
        sub: null,
        mainScroll: 0,
        pendingSignOut: false
    };

    const el = {
        viewLogin: document.getElementById('view-login'),
        viewMain: document.getElementById('view-main'),
        viewSub: document.getElementById('view-sub'),
        loginForm: document.getElementById('login-form'),
        loginEmail: document.getElementById('login-email'),
        loginPassword: document.getElementById('login-password'),
        loginError: document.getElementById('login-error'),
        loginSubmit: document.getElementById('login-submit'),
        loginGoogle: document.getElementById('login-google'),
        loginPasswordToggle: document.getElementById('login-password-toggle'),
        upgrade: document.getElementById('upgrade-pill'),
        search: document.getElementById('search-input'),
        searchClear: document.getElementById('search-clear'),
        chips: document.getElementById('filter-chips'),
        chipAll: document.getElementById('chip-all'),
        chipAllCount: document.getElementById('chip-all-count'),
        chipFav: document.getElementById('chip-fav'),
        chipFavCount: document.getElementById('chip-fav-count'),
        chipCat: document.getElementById('chip-cat'),
        chipCatLabel: document.getElementById('chip-cat-label'),
        list: document.getElementById('main-list'),
        limitBar: document.getElementById('limit-bar'),
        limitText: document.getElementById('limit-text'),
        limitProgress: document.getElementById('limit-progress'),
        limitFill: document.getElementById('limit-progress-fill'),
        newAction: document.getElementById('new-action'),
        tabLibrary: document.getElementById('tab-library'),
        tabSnippets: document.getElementById('tab-snippets'),
        tabCollections: document.getElementById('tab-collections'),
        menuLayer: document.getElementById('menu-layer'),
        sheetLayer: document.getElementById('sheet-layer'),
        toast: document.getElementById('toast'),
        live: document.getElementById('live')
    };

    // ---------- Symbole (Pfade nach Lucide, ISC-Lizenz) ----------

    const ICONS = {
        search: [['circle', { cx: 11, cy: 11, r: 8 }], ['path', { d: 'm21 21-4.3-4.3' }]],
        x: [['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]],
        crown: [['path', { d: 'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z' }], ['path', { d: 'M5 21h14' }]],
        star: [['path', { d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z' }]],
        pencil: [['path', { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' }], ['path', { d: 'm15 5 4 4' }]],
        grid: [['rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }], ['rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }], ['rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 }], ['rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }]],
        'chevron-right': [['path', { d: 'm9 18 6-6-6-6' }]],
        'chevron-left': [['path', { d: 'm15 18-6-6 6-6' }]],
        'chevron-down': [['path', { d: 'm6 9 6 6 6-6' }]],
        plus: [['path', { d: 'M5 12h14' }], ['path', { d: 'M12 5v14' }]],
        library: [['path', { d: 'm16 6 4 14' }], ['path', { d: 'M12 6v14' }], ['path', { d: 'M8 8v12' }], ['path', { d: 'M4 4v16' }]],
        box: [['path', { d: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z' }], ['path', { d: 'm3.3 7 8.7 5 8.7-5' }], ['path', { d: 'M12 22V12' }]],
        layers: [['path', { d: 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z' }], ['path', { d: 'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12' }], ['path', { d: 'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17' }]],
        copy: [['rect', { x: 8, y: 8, width: 14, height: 14, rx: 2 }], ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }]],
        check: [['path', { d: 'M20 6 9 17l-5-5' }]],
        external: [['path', { d: 'M7 7h10v10' }], ['path', { d: 'M7 17 17 7' }]]
    };

    function icon(name, options = {}) {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        const filled = name === 'star-fill';
        const shapes = ICONS[filled ? 'star' : name] || [];
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', filled ? 'currentColor' : 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', String(options.stroke || 2));
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.classList.add('px-icon');
        shapes.forEach(([tag, attrs]) => {
            const shape = document.createElementNS(ns, tag);
            Object.entries(attrs).forEach(([key, value]) => shape.setAttribute(key, String(value)));
            svg.append(shape);
        });
        return svg;
    }

    function hydrateIcons(root = document) {
        root.querySelectorAll('[data-icon]').forEach(node => {
            if (!node.firstChild) node.append(icon(node.dataset.icon));
        });
    }

    // ---------- DOM-Hilfen (nur DOM-API, Nutzerdaten nur als Text) ----------

    function h(tag, props = {}, ...children) {
        const node = document.createElement(tag);
        Object.entries(props || {}).forEach(([key, value]) => {
            if (value === undefined || value === null || value === false) return;
            if (key === 'class') node.className = value;
            else if (key === 'text') node.textContent = value;
            else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
            else if (key === 'dataset') Object.assign(node.dataset, value);
            else if (key in node && typeof value !== 'string') node[key] = value;
            else node.setAttribute(key, value === true ? '' : String(value));
        });
        children.flat().forEach(child => {
            if (child === null || child === undefined || child === false) return;
            node.append(typeof child === 'string' ? document.createTextNode(child) : child);
        });
        return node;
    }

    function iconSpan(name, className = '') {
        const span = h('span', { class: className, 'aria-hidden': 'true' });
        span.append(icon(name));
        return span;
    }

    function externalLink(href, className, ...children) {
        return h('a', { class: className, href, target: '_blank', rel: 'noopener' }, ...children);
    }

    function autoGrow(textarea) {
        const resize = () => {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight + 2, 360)}px`;
        };
        textarea.addEventListener('input', resize);
        requestAnimationFrame(resize);
    }

    // ---------- Meldungen ----------

    let toastTimer = null;
    function showToast(message, options = {}) {
        el.toast.textContent = message;
        el.toast.className = `px-toast is-visible${options.error ? ' px-toast-error' : ''}`;
        el.live.textContent = '';
        // Neu setzen, damit Screenreader gleiche Meldungen erneut vorlesen.
        requestAnimationFrame(() => { el.live.textContent = message; });
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { el.toast.classList.remove('is-visible'); }, options.duration || TOAST_MS);
    }

    function countOpenPlaceholders(text) {
        return (String(text || '').match(OPEN_PLACEHOLDER) || []).length;
    }

    function copiedMessage(noun, text) {
        const open = countOpenPlaceholders(text);
        if (!open) return { message: `${noun} kopiert.`, duration: TOAST_MS };
        return { message: `${noun} kopiert. ${open} Platzhalter offen.`, duration: TOAST_PLACEHOLDER_MS };
    }

    // ---------- Fachliche Hilfen ----------

    // Solange der Tarif unbekannt ist (erster Start ohne Cache), keine Upgrade-Hinweise;
    // die Datenbank setzt das Limit ohnehin durch.
    function isFree() {
        return state.tier === 'free';
    }

    function contentLimitReached() {
        return isFree() && state.contentCount >= FREE_CONTENT_LIMIT;
    }

    function categoryLimitReached() {
        return isFree() && state.categories.length >= FREE_CATEGORY_LIMIT;
    }

    function isFreePrompt(prompt) {
        return prompt?.prompt_type === 'free' || prompt?.fields?.mode === 'free' || typeof prompt?.fields?.text === 'string';
    }

    function compareText(a, b) {
        return String(a || '').localeCompare(String(b || ''), 'de-DE', { sensitivity: 'base' });
    }

    function compareByName(a, b) {
        return compareText(a?.name, b?.name) || contract.compareLibraryOrder(a, b);
    }

    function categoryKeyOf(prompt) {
        if (prompt?.category_id !== null && prompt?.category_id !== undefined) return `id:${prompt.category_id}`;
        if (prompt?.category) return `name:${prompt.category}`;
        return NONE_KEY;
    }

    function categoryById(id) {
        return state.categories.find(item => String(item.id) === String(id)) || null;
    }

    function categoryLabel(key) {
        if (!key || key === NONE_KEY) return NO_CATEGORY;
        if (key.startsWith('id:')) {
            const category = categoryById(key.slice(3));
            if (category) return category.name;
            const prompt = state.prompts.find(item => categoryKeyOf(item) === key);
            return prompt?.category || NO_CATEGORY;
        }
        return key.slice(5);
    }

    function sortedCategories() {
        return state.categories.slice().sort((a, b) => compareText(a.name, b.name));
    }

    // Speicherformat der Bibliothek wie getCurrentLibraryFieldsPayload in app.html (contract.js).
    function toFieldsPayload(mode, values) {
        return contract.libraryFieldsPayload(mode, values);
    }

    function payloadText(mode, values) {
        return contract.promptToText({ prompt_type: mode, fields: toFieldsPayload(mode, values) });
    }

    function hasContent(mode, values) {
        if (mode === 'free') return Boolean(String(values.text || '').trim());
        return STRUCTURED_FIELDS.some(field => String(values[field.key] || '').trim());
    }

    // Titelvorschlag: erste Zeile ohne Markdown-Zeichen, an Wortgrenze gekürzt.
    function suggestTitle(text) {
        const line = String(text || '').split('\n').map(item => item.trim()).find(Boolean) || '';
        const clean = line.replace(/^(#{1,6}\s+|>\s*|[-*]\s+|\d+\.\s+)/, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
        if (clean.length <= 60) return clean;
        const cut = clean.slice(0, 60);
        const space = cut.lastIndexOf(' ');
        return (space > 30 ? cut.slice(0, space) : cut).trim();
    }

    function suggestionFor(mode, values) {
        if (mode === 'free') return suggestTitle(values.text);
        return suggestTitle(values.task) || suggestTitle(values.role) || suggestTitle(values.context) || suggestTitle(values.format);
    }

    // Kollektionen: Speicherformat und Text wie toStorageFields/promptText in collections.js.
    function collectionFields(prompt) {
        return contract.toStorageFields(prompt);
    }

    function collectionText(prompt) {
        return contract.promptToText({ fields: collectionFields(prompt) });
    }

    // Nur Einträge mit der erwarteten Form übernehmen; das JSON kommt aus dem Netz.
    function sanitizeCollections(list) {
        if (!Array.isArray(list)) return [];
        return list.filter(item => item && typeof item.id === 'string' && typeof item.title === 'string' && Array.isArray(item.prompts))
            .map(item => ({
                id: item.id,
                title: item.title,
                benefit: typeof item.benefit === 'string' ? item.benefit : '',
                prompts: item.prompts.filter(prompt => prompt && typeof prompt.id === 'string' && typeof prompt.title === 'string' && prompt.fields && typeof prompt.fields === 'object')
                    .map(prompt => ({
                        id: prompt.id,
                        title: prompt.title,
                        purpose: typeof prompt.purpose === 'string' ? prompt.purpose : '',
                        fields: prompt.fields
                    }))
            }));
    }

    function setCollections(list) {
        COLLECTIONS = sanitizeCollections(list);
        collectionIndex = COLLECTIONS.flatMap(collection => (collection.prompts || []).map(prompt => ({
            collection,
            prompt,
            tokens: contract.searchTerms([prompt.title, prompt.purpose, collection.title, collectionText(prompt)].join(' '))
        })));
    }

    // Zuerst der zuletzt geladene Stand, dann höchstens stündlich neu von promptomizer.de.
    // Ohne Netz bleibt der gespeicherte Stand; ohne jeden Stand zeigt die Ansicht einen Hinweis.
    async function readCollectionsCache() {
        try {
            const result = await chrome.storage.local.get(COLLECTIONS_KEY);
            const cached = result[COLLECTIONS_KEY];
            if (cached && Array.isArray(cached.collections)) {
                setCollections(cached.collections);
                collectionsFetchedAt = Number(cached.fetchedAt) || 0;
                collectionsStatus = COLLECTIONS.length ? 'ready' : 'loading';
            }
        } catch (_) { }
    }

    async function loadCollections({ force = false } = {}) {
        if (!force && collectionsFetchedAt && Date.now() - collectionsFetchedAt < COLLECTIONS_REFRESH_MS) return;
        try {
            const response = await fetch(COLLECTIONS_URL, { cache: 'no-cache', credentials: 'omit' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const list = sanitizeCollections(data?.collections);
            if (!list.length) throw new Error('keine Kollektionen');
            setCollections(list);
            collectionsFetchedAt = Date.now();
            collectionsStatus = 'ready';
            try { await chrome.storage.local.set({ [COLLECTIONS_KEY]: { fetchedAt: collectionsFetchedAt, collections: list } }); } catch (_) { }
        } catch (error) {
            console.warn('Kollektionen konnten nicht geladen werden.', error?.message);
            if (!COLLECTIONS.length) collectionsStatus = 'error';
        }
        if (state.sub?.type === 'collections') state.sub.refresh?.();
        else if (!el.viewMain.hidden && state.query) renderList();
    }

    function findCollection(id) {
        return COLLECTIONS.find(item => item.id === id) || null;
    }

    function buildIndex() {
        state.indexed = state.prompts.map(item => ({ item, tokens: contract.promptSearchTokens(item) }));
    }

    // ---------- Cache und UI-Einstellungen ----------

    async function readCache() {
        try {
            const result = await chrome.storage.local.get(CACHE_KEY);
            const cache = result[CACHE_KEY];
            if (!cache || cache.version !== CACHE_VERSION) return null;
            return cache;
        } catch (_) {
            return null;
        }
    }

    async function writeCache() {
        if (!state.user) return;
        try {
            await chrome.storage.local.set({
                [CACHE_KEY]: {
                    version: CACHE_VERSION,
                    userId: state.user.id,
                    fetchedAt: state.fetchedAt,
                    tier: state.tier,
                    defaultMode: state.defaultMode,
                    contentCount: state.contentCount,
                    prompts: state.prompts,
                    snippets: state.snippets,
                    categories: state.categories
                }
            });
        } catch (error) {
            console.warn('Cache konnte nicht geschrieben werden.', error?.message);
        }
    }

    async function clearCache() {
        try { await chrome.storage.local.remove([CACHE_KEY, ADOPTED_KEY]); } catch (_) { }
    }

    function applyCache(cache) {
        state.prompts = Array.isArray(cache.prompts) ? cache.prompts : [];
        state.snippets = Array.isArray(cache.snippets) ? cache.snippets : [];
        state.categories = Array.isArray(cache.categories) ? cache.categories : [];
        state.tier = cache.tier === 'pro' || cache.tier === 'free' ? cache.tier : null;
        state.defaultMode = cache.defaultMode || null;
        state.contentCount = Number(cache.contentCount) || 0;
        state.fetchedAt = cache.fetchedAt || null;
        buildIndex();
    }

    async function readUiPrefs() {
        try {
            const result = await chrome.storage.local.get(UI_KEY);
            const prefs = result[UI_KEY] || {};
            if (typeof prefs.filter === 'string') state.filter = prefs.filter;
            if (Array.isArray(prefs.openGroups)) state.openGroups = new Set(prefs.openGroups.map(String));
            if (Array.isArray(prefs.openSnippetGroups)) state.openSnippetGroups = new Set(prefs.openSnippetGroups.map(String));
        } catch (_) { }
    }

    async function writeUiPrefs() {
        try {
            await chrome.storage.local.set({ [UI_KEY]: { filter: state.filter, openGroups: Array.from(state.openGroups), openSnippetGroups: Array.from(state.openSnippetGroups) } });
        } catch (_) { }
    }

    // Kennzeichnung „übernommen“: Kollektions-Prompt-id → id des eigenen Prompts, je Konto.
    async function readAdopted() {
        try {
            const result = await chrome.storage.local.get(ADOPTED_KEY);
            const stored = result[ADOPTED_KEY];
            state.adopted = stored && stored.userId === state.user?.id && stored.map ? stored.map : {};
        } catch (_) {
            state.adopted = {};
        }
    }

    async function writeAdopted() {
        if (!state.user) return;
        try {
            await chrome.storage.local.set({ [ADOPTED_KEY]: { userId: state.user.id, map: state.adopted } });
        } catch (_) { }
    }

    function adoptedPromptFor(collectionPromptId) {
        const id = state.adopted[collectionPromptId];
        if (id === undefined) return null;
        return state.prompts.find(item => String(item.id) === String(id)) || null;
    }

    // ---------- Daten lesen ----------

    async function fetchAll(table, select) {
        const rows = [];
        let from = 0;
        while (true) {
            const { data, error } = await client
                .from(table)
                .select(select)
                .eq('user_id', state.user.id)
                .is('archived_at', null)
                .order('is_favorite', { ascending: false })
                .order('last_used_at', { ascending: false, nullsFirst: false })
                .order('updated_at', { ascending: false })
                .order('id', { ascending: false })
                .range(from, from + PAGE_SIZE - 1);
            if (error) throw error;
            rows.push(...(data || []));
            if (!data || data.length < PAGE_SIZE) break;
            from += PAGE_SIZE;
            if (from >= MAX_ITEMS) break;
        }
        rows.sort(contract.compareLibraryOrder);
        return rows;
    }

    async function fetchCategories() {
        const { data, error } = await client
            .from('prompt_categories')
            .select('id, name')
            .eq('user_id', state.user.id)
            .order('name', { ascending: true });
        if (error) throw error;
        return data || [];
    }

    async function fetchProfile() {
        const { data, error } = await client
            .from('profiles')
            .select('tier, default_editor_mode')
            .eq('id', state.user.id)
            .single();
        if (error) throw error;
        return data || {};
    }

    // Wie db.getPromptCount: Prompts und Bausteine einschließlich Archiv.
    async function fetchContentCount() {
        const [library, snippets] = await Promise.all([
            client.from('library').select('*', { count: 'exact', head: true }).eq('user_id', state.user.id),
            client.from('snippets').select('*', { count: 'exact', head: true }).eq('user_id', state.user.id)
        ]);
        if (library.error) throw library.error;
        if (snippets.error) throw snippets.error;
        return (library.count ?? 0) + (snippets.count ?? 0);
    }

    function refreshIfStale() {
        if (!state.user || document.visibilityState !== 'visible') return;
        const age = state.fetchedAt ? Date.now() - new Date(state.fetchedAt).getTime() : Infinity;
        if (age >= PANEL_REFRESH_MS) refreshFromServer();
        loadCollections();
    }

    async function refreshFromServer() {
        if (!state.user || state.refreshing) return;
        state.refreshing = true;
        try {
            const [prompts, snippets, categories, profile, contentCount] = await Promise.all([
                fetchAll('library', LIBRARY_SELECT),
                fetchAll('snippets', SNIPPET_SELECT),
                fetchCategories(),
                fetchProfile(),
                fetchContentCount()
            ]);
            state.prompts = prompts;
            state.snippets = snippets;
            state.categories = categories;
            state.tier = profile.tier === 'pro' ? 'pro' : 'free';
            state.defaultMode = profile.default_editor_mode === 'free' ? 'free' : 'structured';
            state.contentCount = contentCount;
            state.fetchedAt = new Date().toISOString();
            buildIndex();
            await writeCache();
            renderAfterRefresh();
        } catch (error) {
            console.warn('Bibliothek konnte nicht geladen werden.', error?.message);
            if (isAuthError(error)) await confirmSignedOut();
        } finally {
            state.refreshing = false;
        }
    }

    function renderAfterRefresh() {
        if (!el.viewMain.hidden) renderMain();
        else if (state.sub?.refresh) state.sub.refresh();
    }

    function isAuthError(error) {
        const status = Number(error?.status || error?.code);
        return status === 401 || /jwt|not authenticated/i.test(String(error?.message || ''));
    }

    // Ein 401 heißt nicht automatisch „abgemeldet“: Scheitert nur die Token-Erneuerung
    // (z. B. nach dem Aufwachen ohne Netz), bleibt die Sitzung gespeichert. Abgemeldet ist
    // erst, wenn keine Sitzung mehr da ist (abgelaufen oder in der Web-App abgemeldet).
    async function confirmSignedOut() {
        let session = null;
        try {
            const { data } = await client.auth.getSession();
            session = data?.session || null;
        } catch (_) { }
        if (!session) await handleSignedOut();
    }

    // ---------- Daten schreiben ----------

    function errorText(error) {
        return String(error?.message || '');
    }

    async function markUsed(table, id) {
        try {
            const { error } = await client.from(table)
                .update({ last_used_at: new Date().toISOString() })
                .eq('id', id).eq('user_id', state.user.id);
            if (error) console.warn('last_used_at konnte nicht gesetzt werden.', error.message);
        } catch (error) {
            console.warn('last_used_at konnte nicht gesetzt werden.', error?.message);
        }
    }

    // Historie wie db.savePrompt aus handleCopyAndSave: nur Text, ohne Felder.
    async function addHistory(text) {
        try {
            const { error } = await client.from('prompt_history').insert({
                user_id: state.user.id,
                text,
                created_at: new Date().toISOString(),
                favorite: false
            });
            if (error) console.warn('Historie konnte nicht geschrieben werden.', error.message);
        } catch (error) {
            console.warn('Historie konnte nicht geschrieben werden.', error?.message);
        }
    }

    async function insertPrompt({ name, fields, category }) {
        const { data, error } = await client.from('library')
            .insert({ user_id: state.user.id, name, fields, category: category ?? null })
            .select(LIBRARY_SELECT)
            .single();
        if (error) {
            if (errorText(error).includes('FREE_LIMIT_REACHED')) return { success: false, reason: 'FREE_LIMIT_REACHED' };
            console.warn('Prompt konnte nicht angelegt werden.', error.message);
            return { success: false, reason: 'ERROR' };
        }
        return { success: true, prompt: data };
    }

    // expectedVersion: nur speichern, wenn current_version noch die geladene Fassung ist.
    // Trifft die Bedingung keine Zeile, wird nachgelesen: Hat sich die Fassung geändert,
    // meldet die Funktion CONFLICT mit dem aktuellen Stand.
    async function updatePrompt(id, values, { expectedVersion = null } = {}) {
        let query = client.from('library')
            .update(values)
            .eq('id', id).eq('user_id', state.user.id);
        if (expectedVersion !== null) query = query.eq('current_version', expectedVersion);
        const { data, error } = await query.select(LIBRARY_SELECT);
        if (!error && data && data.length === 1) return { success: true, prompt: data[0] };
        if (!error && expectedVersion !== null && Array.isArray(data) && data.length === 0) {
            const { data: current, error: readError } = await client.from('library')
                .select(LIBRARY_SELECT)
                .eq('id', id).eq('user_id', state.user.id)
                .maybeSingle();
            if (!readError && current && Number(current.current_version) !== Number(expectedVersion)) {
                return { success: false, reason: 'CONFLICT', prompt: current };
            }
        }
        console.warn('Prompt konnte nicht gespeichert werden.', error?.message || 'keine eindeutige Zeile');
        return { success: false, reason: 'ERROR' };
    }

    async function insertCategory(name) {
        const { data, error } = await client.from('prompt_categories')
            .insert({ user_id: state.user.id, name })
            .select('id, name')
            .single();
        if (error) {
            if (errorText(error).includes('CATEGORY_LIMIT_REACHED')) return { success: false, reason: 'CATEGORY_LIMIT_REACHED' };
            if (error.code === '23505') return { success: false, reason: 'DUPLICATE' };
            console.warn('Kategorie konnte nicht angelegt werden.', error.message);
            return { success: false, reason: 'ERROR' };
        }
        return { success: true, category: data };
    }

    // Einsatzbereich wie saveEditor in snippet-library.js: field_id ist der Bereich,
    // mode folgt daraus („free“ nur bei Freie Bausteine, sonst „structured“, contract.js).
    function snippetModeFor(fieldId) {
        return contract.snippetModeFor(fieldId);
    }

    async function insertSnippet({ name, content, fieldId = 'free' }) {
        const { data, error } = await client.from('snippets')
            .insert({ user_id: state.user.id, name, content, mode: snippetModeFor(fieldId), field_id: fieldId })
            .select(SNIPPET_SELECT)
            .single();
        if (error) {
            if (errorText(error).includes('FREE_LIMIT_REACHED')) return { success: false, reason: 'FREE_LIMIT_REACHED' };
            console.warn('Baustein konnte nicht angelegt werden.', error.message);
            return { success: false, reason: 'ERROR' };
        }
        return { success: true, snippet: data };
    }

    async function updateSnippet(id, values) {
        const { data, error } = await client.from('snippets')
            .update(values)
            .eq('id', id).eq('user_id', state.user.id)
            .select(SNIPPET_SELECT);
        if (error || !data || data.length !== 1) {
            console.warn('Baustein konnte nicht gespeichert werden.', error?.message || 'keine eindeutige Zeile');
            return { success: false };
        }
        return { success: true, snippet: data[0] };
    }

    function upsertLocal(list, row) {
        const index = list.findIndex(item => String(item.id) === String(row.id));
        if (index >= 0) list[index] = row;
        else list.push(row);
        list.sort(contract.compareLibraryOrder);
    }

    // ---------- Kopieren ----------

    async function writeClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            console.warn('Kopieren fehlgeschlagen.', error?.message);
            showToast('Kopieren war nicht möglich.', { error: true });
            return false;
        }
    }

    // Eigener Prompt: Zwischenablage, Historie und last_used_at wie handleCopyAndSave.
    async function copyOwnPrompt(prompt, text) {
        if (!text.trim()) {
            showToast('Prompt ist leer.', { error: true });
            return false;
        }
        if (!(await writeClipboard(text))) return false;
        const { message, duration } = copiedMessage('Prompt', text);
        showToast(message, { duration });
        prompt.last_used_at = new Date().toISOString();
        state.prompts.sort(contract.compareLibraryOrder);
        writeCache();
        addHistory(text);
        markUsed('library', prompt.id);
        return true;
    }

    async function copyPromptFromList(prompt) {
        const copied = await copyOwnPrompt(prompt, contract.promptToText(prompt));
        if (copied) renderList();
    }

    async function copySnippet(snippet) {
        const text = contract.snippetToText(snippet);
        if (!text.trim()) {
            showToast('Baustein ist leer.', { error: true });
            return;
        }
        if (!(await writeClipboard(text))) return;
        const { message, duration } = copiedMessage('Baustein', text);
        showToast(message, { duration });
        snippet.last_used_at = new Date().toISOString();
        writeCache();
        markUsed('snippets', snippet.id);
    }

    // Kollektionen: wie collections.js copyPrompt, ohne Historie und Nutzungsdatum.
    async function copyCollectionPrompt(prompt) {
        const text = collectionText(prompt);
        if (!text.trim()) {
            showToast('Prompt ist leer.', { error: true });
            return;
        }
        if (!(await writeClipboard(text))) return;
        const { message, duration } = copiedMessage('Prompt', text);
        showToast(message, { duration });
    }

    // ---------- Auswahlmenü ----------

    let activeMenu = null;

    function closeMenu(options = {}) {
        if (!activeMenu) return;
        const { anchor, node } = activeMenu;
        activeMenu = null;
        node.remove();
        anchor.setAttribute('aria-expanded', 'false');
        document.removeEventListener('pointerdown', onMenuOutside, true);
        if (options.focusAnchor !== false) anchor.focus();
    }

    function onMenuOutside(event) {
        if (!activeMenu) return;
        if (activeMenu.node.contains(event.target) || activeMenu.anchor.contains(event.target)) return;
        closeMenu({ focusAnchor: false });
    }

    // options: [{ key, label, count? }], footer: Funktion, die den fixierten Fußbereich baut.
    function openMenu(anchor, { options, selected, onSelect, footer, minWidth = 200, label }) {
        if (activeMenu?.anchor === anchor) {
            closeMenu();
            return;
        }
        closeMenu({ focusAnchor: false });
        const list = h('div', { class: 'px-menu-list', role: 'listbox', 'aria-label': label || 'Auswahl' });
        options.forEach(option => {
            const isSelected = option.key === selected;
            const check = h('span', { class: 'px-menu-check', 'aria-hidden': 'true' });
            if (isSelected) check.append(icon('check'));
            list.append(h('button', {
                type: 'button',
                class: 'px-menu-option',
                role: 'option',
                'aria-selected': isSelected ? 'true' : 'false',
                onclick: () => {
                    closeMenu();
                    onSelect(option.key);
                }
            }, check,
            h('span', { class: 'px-menu-option-label', text: option.label }),
            option.count !== undefined ? h('span', { class: 'px-menu-option-count', text: String(option.count) }) : null));
        });
        const node = h('div', { class: 'px-menu' }, list);
        if (footer) node.append(h('div', { class: 'px-menu-footer' }, footer()));
        node.addEventListener('keydown', onMenuKeydown);
        el.menuLayer.append(node);
        activeMenu = { anchor, node };
        anchor.setAttribute('aria-expanded', 'true');
        positionMenu(anchor, node, list, minWidth);
        document.addEventListener('pointerdown', onMenuOutside, true);
        (list.querySelector('[aria-selected="true"]') || list.querySelector('button'))?.focus();
    }

    function positionMenu(anchor, node, list, minWidth) {
        const rect = anchor.getBoundingClientRect();
        const margin = 8;
        const width = Math.min(Math.max(rect.width, minWidth), window.innerWidth - margin * 2);
        const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
        const below = window.innerHeight - rect.bottom - margin;
        const above = rect.top - margin;
        const openUp = below < 220 && above > below;
        const space = Math.max(120, (openUp ? above : below) - 4);
        node.style.width = `${width}px`;
        node.style.left = `${left}px`;
        node.style.maxHeight = `${Math.min(space, 360)}px`;
        if (openUp) node.style.bottom = `${window.innerHeight - rect.top + 4}px`;
        else node.style.top = `${rect.bottom + 4}px`;
        list.style.maxHeight = '100%';
    }

    function onMenuKeydown(event) {
        if (!activeMenu) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closeMenu();
            return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const buttons = Array.from(activeMenu.node.querySelectorAll('.px-menu-option'));
        const index = buttons.indexOf(document.activeElement);
        if (index === -1) return;
        event.preventDefault();
        const next = event.key === 'ArrowDown' ? Math.min(buttons.length - 1, index + 1) : Math.max(0, index - 1);
        buttons[next].focus();
    }

    // Kategorieauswahl mit optionalem „Kategorie anlegen“ (nur im Formular „Neuer Prompt“).
    function categoryOptions() {
        return [{ key: NONE_KEY, label: NO_CATEGORY }, ...sortedCategories().map(item => ({ key: `id:${item.id}`, label: item.name }))];
    }

    function buildCategorySelect(initialKey, { allowCreate = false, onChange } = {}) {
        let current = initialKey || NONE_KEY;
        const label = h('span', { class: 'px-select-label', text: categoryLabel(current) });
        const button = h('button', {
            type: 'button',
            class: 'px-select',
            id: `category-${Math.random().toString(36).slice(2, 8)}`,
            'aria-haspopup': 'listbox',
            'aria-expanded': 'false'
        }, label, icon('chevron-down'));
        const select = key => {
            current = key;
            label.textContent = categoryLabel(key);
            onChange?.(key);
        };
        button.addEventListener('click', () => openMenu(button, {
            label: 'Kategorie',
            options: categoryOptions(),
            selected: current,
            onSelect: select,
            minWidth: 220,
            footer: allowCreate ? () => buildCreateCategoryFooter(select) : null
        }));
        return { button, get value() { return current; } };
    }

    function buildCreateCategoryFooter(onCreated) {
        const wrap = h('div');
        const showButton = () => {
            wrap.replaceChildren(h('button', {
                type: 'button',
                class: 'px-menu-option',
                onclick: () => {
                    if (categoryLimitReached()) {
                        closeMenu({ focusAnchor: false });
                        openLimitSheet('category');
                        return;
                    }
                    showForm();
                }
            }, h('span', { class: 'px-menu-check', 'aria-hidden': 'true' }, icon('plus')), h('span', { class: 'px-menu-option-label', text: 'Kategorie anlegen' })));
        };
        const showForm = () => {
            const input = h('input', { class: 'px-input', type: 'text', placeholder: 'Name der Kategorie', 'aria-label': 'Name der neuen Kategorie' });
            const submit = h('button', { type: 'button', class: 'px-btn px-btn-primary', text: 'Anlegen' });
            const create = async () => {
                const name = input.value.trim();
                if (!name) {
                    input.focus();
                    return;
                }
                submit.disabled = true;
                const result = await insertCategory(name);
                submit.disabled = false;
                if (result.success) {
                    state.categories.push(result.category);
                    writeCache();
                    closeMenu();
                    onCreated(`id:${result.category.id}`);
                    return;
                }
                if (result.reason === 'DUPLICATE') {
                    const existing = state.categories.find(item => compareText(item.name, name) === 0);
                    if (existing) {
                        closeMenu();
                        onCreated(`id:${existing.id}`);
                        return;
                    }
                    showToast('Diese Kategorie gibt es schon.', { error: true });
                    return;
                }
                if (result.reason === 'CATEGORY_LIMIT_REACHED') {
                    closeMenu({ focusAnchor: false });
                    openLimitSheet('category');
                    return;
                }
                showToast('Anlegen war nicht möglich.', { error: true });
            };
            input.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    create();
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    showButton();
                    wrap.querySelector('button')?.focus();
                }
            });
            submit.addEventListener('click', create);
            wrap.replaceChildren(h('div', { class: 'px-menu-create' }, input, submit));
            input.focus();
        };
        showButton();
        return wrap;
    }

    // ---------- Rückfragen von unten ----------

    let activeSheet = null;

    function closeSheet(value) {
        if (!activeSheet) return;
        const { resolve, returnFocus } = activeSheet;
        activeSheet = null;
        el.sheetLayer.hidden = true;
        el.sheetLayer.replaceChildren();
        document.removeEventListener('keydown', onSheetKeydown, true);
        if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
        resolve(value);
    }

    // actions: [{ label, kind: 'primary'|'secondary'|'danger', value, href? }]
    function openSheet({ title, text, body, actions }) {
        closeMenu({ focusAnchor: false });
        clearTimeout(toastTimer);
        el.toast.classList.remove('is-visible');
        if (activeSheet) closeSheet(null);
        return new Promise(resolve => {
            const titleId = 'sheet-title';
            const sheet = h('div', { class: 'px-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
                h('h2', { class: 'px-sheet-title', id: titleId, text: title }),
                text ? h('p', { class: 'px-sheet-text', text }) : null,
                body ? h('div', { class: 'px-sheet-body' }, body) : null,
                h('div', { class: 'px-sheet-actions' }, actions.map(action => {
                    const className = `px-btn px-btn-${action.kind || 'secondary'}`;
                    if (action.href) {
                        return externalLink(action.href, className, action.label);
                    }
                    return h('button', { type: 'button', class: className, text: action.label, onclick: () => closeSheet(action.value) });
                })));
            // Erst nach dem Klick schließen, damit der Link sicher im neuen Tab aufgeht.
            sheet.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setTimeout(() => closeSheet(null), 0)));
            const backdrop = h('div', { class: 'px-backdrop', onclick: () => closeSheet(null) });
            el.sheetLayer.replaceChildren(backdrop, sheet);
            el.sheetLayer.hidden = false;
            activeSheet = { resolve, node: sheet, returnFocus: document.activeElement };
            document.addEventListener('keydown', onSheetKeydown, true);
            (sheet.querySelector('.px-choice[aria-checked="true"]') || sheet.querySelector('.px-sheet-actions .px-btn'))?.focus();
        });
    }

    function onSheetKeydown(event) {
        if (!activeSheet) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closeSheet(null);
            return;
        }
        if (event.key !== 'Tab') return;
        // Fokus bleibt im Dialog.
        const focusable = Array.from(activeSheet.node.querySelectorAll('button, a[href], input, textarea'))
            .filter(node => !node.disabled);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        } else if (!activeSheet.node.contains(document.activeElement)) {
            event.preventDefault();
            first.focus();
        }
    }

    function openLimitSheet(kind) {
        if (kind === 'category') {
            return openSheet({
                title: `Alle ${FREE_CATEGORY_LIMIT} Kategorien sind belegt.`,
                text: 'Mit Pro legst du unbegrenzt viele Kategorien an. Ohne Kategorie kannst du den Prompt jederzeit speichern.',
                actions: [
                    { label: 'Pro ansehen', kind: 'primary', href: PRICING_URL },
                    { label: 'Später', kind: 'secondary', value: false }
                ]
            });
        }
        return openSheet({
            title: `Alle ${FREE_CONTENT_LIMIT} Plätze sind belegt.`,
            text: 'Mit Pro speicherst du unbegrenzt viele Prompts und Bausteine.',
            actions: [
                { label: 'Pro ansehen', kind: 'primary', href: PRICING_URL },
                { label: 'Später', kind: 'secondary', value: false }
            ]
        });
    }

    function confirmDiscard() {
        return openSheet({
            title: 'Änderungen verwerfen?',
            text: 'Dein Entwurf ist nicht gespeichert.',
            actions: [
                { label: 'Weiter bearbeiten', kind: 'primary', value: false },
                { label: 'Verwerfen', kind: 'danger', value: true }
            ]
        });
    }

    // Auswahl als Optionsliste im Dialog (Kategorie bei der Übernahme).
    function buildChoiceList(options, selected, onChange) {
        let current = selected;
        const list = h('div', { class: 'px-choice-list', role: 'radiogroup', 'aria-label': 'Kategorie' });
        const render = () => {
            list.querySelectorAll('.px-choice').forEach(node => {
                const checked = node.dataset.key === current;
                node.setAttribute('aria-checked', checked ? 'true' : 'false');
                node.tabIndex = checked ? 0 : -1;
            });
        };
        options.forEach(option => {
            list.append(h('button', {
                type: 'button',
                class: 'px-choice',
                role: 'radio',
                dataset: { key: option.key },
                onclick: () => {
                    current = option.key;
                    onChange(current);
                    render();
                }
            }, h('span', { class: 'px-choice-dot', 'aria-hidden': 'true' }), h('span', { text: option.label })));
        });
        list.addEventListener('keydown', event => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            const buttons = Array.from(list.querySelectorAll('.px-choice'));
            const index = buttons.findIndex(node => node.dataset.key === current);
            const next = buttons[event.key === 'ArrowDown' ? Math.min(buttons.length - 1, index + 1) : Math.max(0, index - 1)];
            current = next.dataset.key;
            onChange(current);
            render();
            next.focus();
        });
        render();
        return list;
    }

    // ---------- Navigation ----------

    function animate(node, direction) {
        node.classList.remove('px-anim-forward', 'px-anim-back');
        if (direction === 'none') return;
        void node.offsetWidth;
        node.classList.add(direction === 'back' ? 'px-anim-back' : 'px-anim-forward');
    }

    function showSub(sub, direction = 'forward') {
        closeMenu({ focusAnchor: false });
        if (!el.viewMain.hidden) state.mainScroll = el.list.scrollTop;
        el.viewMain.hidden = true;
        state.sub = sub;
        el.viewSub.replaceChildren(...sub.render());
        el.viewSub.hidden = false;
        animate(el.viewSub, direction);
        (el.viewSub.querySelector('[data-autofocus]') || el.viewSub.querySelector('.px-back, .px-textbtn') || el.viewSub.querySelector('.px-tabbar [aria-current="page"]'))?.focus();
    }

    function showMain(direction = 'back') {
        closeMenu({ focusAnchor: false });
        state.sub = null;
        el.viewSub.hidden = true;
        el.viewSub.replaceChildren();
        if (state.pendingSignOut) {
            state.pendingSignOut = false;
            handleSignedOut();
            return;
        }
        el.viewMain.hidden = false;
        renderMain();
        el.list.scrollTop = state.mainScroll;
        animate(el.viewMain, direction);
        el.search.focus();
    }

    function subHeader(left, right) {
        return h('header', { class: 'px-header' }, left, right || h('span'));
    }

    function backButton(label, onClick) {
        return h('button', { type: 'button', class: 'px-back', onclick: onClick }, icon('chevron-left'), h('span', { text: label }));
    }

    // ---------- Bereiche: untere Leiste ----------
    // Drei feste Bereiche in fester Reihenfolge. Darüber eine schmale Schaltfläche
    // für „Neu“, die sich nach dem Bereich richtet; bei Kollektionen gibt es keine.

    const AREAS = [
        { key: 'library', label: 'Bibliothek', icon: 'library' },
        { key: 'snippets', label: 'Bausteine', icon: 'box' },
        { key: 'collections', label: 'Kollektionen', icon: 'layers' }
    ];

    // Jede Unteransicht gehört zu einem Bereich; die Leiste bleibt überall stehen.
    const SUB_AREA = {
        edit: 'library', create: 'library',
        snippets: 'snippets', 'snippet-form': 'snippets',
        collections: 'collections', collection: 'collections', 'collection-prompt': 'collections'
    };

    function currentArea() {
        return state.sub ? (SUB_AREA[state.sub.type] || 'library') : 'library';
    }

    function isAreaOverview() {
        return !state.sub || state.sub.type === 'snippets' || state.sub.type === 'collections';
    }

    // Klick auf den aktiven Bereich führt zu dessen Übersicht. Offene Formulare fragen
    // vorher nach (canLeave), damit kein Text verloren geht.
    async function goToArea(target) {
        const from = currentArea();
        if (from === target && isAreaOverview()) return;
        if (state.sub?.canLeave && !(await state.sub.canLeave())) return;
        const order = AREAS.map(area => area.key);
        const direction = order.indexOf(target) > order.indexOf(from) ? 'forward' : 'back';
        if (target === 'library' || state.pendingSignOut) showMain(direction);
        else if (target === 'snippets') openSnippets(direction);
        else openCollections(direction);
    }

    // Bereichsüberschrift wie die Wortmarke: gleiche Größe, erster Teil weiß, Rest blau.
    function areaTitle(white, blue) {
        return h('h1', { class: 'px-area-title' }, h('span', { class: 'px-logo-a', text: white }), h('span', { class: 'px-logo-b', text: blue }));
    }

    // Unten: Aktionsreihe der Seite (falls vorhanden), darunter immer die drei Bereiche.
    function areaNav(active, actions = null) {
        const nodes = [];
        if (actions) nodes.push(h('div', { class: 'px-actionbar' }, actions));
        nodes.push(h('nav', { class: 'px-tabbar', 'aria-label': 'Bereiche' },
            AREAS.map(area => h('button', {
                type: 'button',
                class: 'px-tabbar-btn',
                'data-area': area.key,
                'aria-current': area.key === active ? 'page' : null,
                onclick: () => goToArea(area.key)
            }, icon(area.icon), h('span', { text: area.label })))));
        return nodes;
    }

    function textButton(label, onClick) {
        return h('button', { type: 'button', class: 'px-textbtn', text: label, onclick: onClick });
    }

    // ---------- Hauptansicht ----------

    function renderMain() {
        el.upgrade.hidden = !isFree();
        el.searchClear.hidden = !state.query;
        renderChips();
        renderList();
        renderLimit();
    }

    function categoryGroups() {
        const groups = new Map();
        state.prompts.forEach(prompt => {
            const key = categoryKeyOf(prompt);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(prompt);
        });
        return Array.from(groups.entries())
            .map(([key, items]) => ({ key, label: categoryLabel(key), items: items.slice().sort(compareByName) }))
            .sort((a, b) => {
                if (a.key === NONE_KEY) return -1;
                if (b.key === NONE_KEY) return 1;
                return compareText(a.label, b.label);
            });
    }

    function renderChips() {
        const favorites = state.prompts.filter(item => item.is_favorite).length;
        el.chipAllCount.textContent = String(state.prompts.length);
        el.chipFavCount.textContent = String(favorites);
        el.chips.hidden = !state.prompts.length;
        if (state.filter.startsWith('cat:') && !state.prompts.some(item => categoryKeyOf(item) === state.filter.slice(4))) {
            state.filter = 'all';
        }
        el.chipAll.setAttribute('aria-pressed', state.filter === 'all' ? 'true' : 'false');
        el.chipFav.setAttribute('aria-pressed', state.filter === 'fav' ? 'true' : 'false');
        const catActive = state.filter.startsWith('cat:');
        el.chipCat.setAttribute('aria-pressed', catActive ? 'true' : 'false');
        el.chipCatLabel.textContent = catActive ? categoryLabel(state.filter.slice(4)) : 'Kategorie';
    }

    function setFilter(filter) {
        state.filter = filter;
        renderChips();
        renderList();
        el.list.scrollTop = 0;
        writeUiPrefs();
    }

    function openCategoryFilter() {
        const options = categoryGroups().map(group => ({ key: group.key, label: group.label, count: group.items.length }));
        openMenu(el.chipCat, {
            label: 'Nach Kategorie filtern',
            options,
            selected: state.filter.startsWith('cat:') ? state.filter.slice(4) : null,
            onSelect: key => setFilter(`cat:${key}`),
            minWidth: 220
        });
    }

    function sectionHeading(label, extraClass = '') {
        return h('h2', { class: `px-section ${extraClass}`.trim(), text: label });
    }

    function promptRow(prompt, options = {}) {
        const name = prompt.name || 'Ohne Namen';
        const main = h('button', {
            type: 'button',
            class: 'px-row-main',
            title: 'Klicken zum Kopieren',
            'aria-label': `${name} kopieren`,
            onclick: () => copyPromptFromList(prompt)
        },
        prompt.is_favorite ? iconSpan('star-fill', 'px-row-star') : null,
        h('span', { class: 'px-row-name', text: name }),
        !isFreePrompt(prompt) ? h('span', { class: 'px-row-type', title: 'Strukturierter Prompt' }, icon('grid')) : null);
        const edit = h('button', {
            type: 'button',
            class: 'px-iconbtn px-row-edit',
            'aria-label': `${name} bearbeiten`,
            onclick: () => openEdit(prompt)
        }, icon('pencil'));
        return h('div', { class: `px-row${options.nested ? ' px-row-nested' : ''}`, role: 'listitem' }, main, edit);
    }

    function collectionHitRow(hit) {
        return h('div', { class: 'px-row2', role: 'listitem' },
            h('button', {
                type: 'button',
                class: 'px-row2-main',
                onclick: () => openCollectionPrompt(hit.collection, hit.prompt, 'forward', 'search')
            },
            iconSpan('layers', 'px-row2-icon'),
            h('span', { class: 'px-row2-text' },
                h('span', { class: 'px-row2-title', text: hit.prompt.title }),
                h('span', { class: 'px-row2-sub', text: hit.collection.title })),
            iconSpan('chevron-right', 'px-row2-chevron')));
    }

    // Einklappbare Gruppe. Bibliothek (Kategorien) und Bausteine (Einsatzbereiche) teilen
    // dasselbe Verhalten; der Auf-/Zu-Zustand wird je Liste gemerkt.
    function groupRow(group, options = {}) {
        const openSet = options.openSet || state.openGroups;
        const list = options.list || el.list;
        const rerender = options.render || renderList;
        const open = openSet.has(group.key);
        const button = h('button', {
            type: 'button',
            class: 'px-group',
            'aria-expanded': open ? 'true' : 'false',
            onclick: () => {
                if (openSet.has(group.key)) openSet.delete(group.key);
                else openSet.add(group.key);
                writeUiPrefs();
                const scroll = list.scrollTop;
                rerender();
                list.scrollTop = scroll;
                list.querySelector(`.px-group[data-key="${CSS.escape(group.key)}"]`)?.focus();
            }
        }, iconSpan('chevron-right', 'px-group-chevron'),
        h('span', { class: 'px-group-name', text: group.label }),
        h('span', { class: 'px-group-count', text: String(group.items.length) }));
        button.dataset.key = group.key;
        return button;
    }

    function filterLabel() {
        if (state.filter === 'fav') return 'deinen Favoriten';
        if (state.filter.startsWith('cat:')) return `„${categoryLabel(state.filter.slice(4))}“`;
        return '';
    }

    function filteredPrompts() {
        if (state.filter === 'fav') return state.prompts.filter(item => item.is_favorite);
        if (state.filter.startsWith('cat:')) {
            const key = state.filter.slice(4);
            return state.prompts.filter(item => categoryKeyOf(item) === key);
        }
        return state.prompts;
    }

    function renderList() {
        const nodes = [];
        const query = state.query.trim();

        if (!state.prompts.length && !query) {
            el.list.replaceChildren(renderFirstStart());
            return;
        }

        if (query) {
            const allowed = new Set(filteredPrompts());
            const hits = state.indexed
                .filter(entry => allowed.has(entry.item) && contract.matchesSearch(entry.tokens, query))
                .map(entry => entry.item)
                .sort(contract.compareLibraryOrder);
            if (hits.length) {
                nodes.push(sectionHeading(`Treffer (${hits.length})`));
                hits.slice(0, MAX_RENDERED).forEach(item => nodes.push(promptRow(item)));
            } else if (state.filter !== 'all') {
                nodes.push(h('p', { class: 'px-note' }, `Keine Treffer in ${filterLabel()}.`,
                    h('button', { type: 'button', class: 'px-linkbtn', text: 'In allen suchen', onclick: () => setFilter('all') })));
            } else {
                nodes.push(h('p', { class: 'px-note' }, 'Keine Treffer in deiner Bibliothek.',
                    h('button', { type: 'button', class: 'px-linkbtn', text: `„${query}“ als neuen Prompt anlegen`, onclick: () => startCreate({ title: query }) })));
            }
            if (state.filter === 'all') {
                const collectionHits = collectionIndex.filter(entry => contract.matchesSearch(entry.tokens, query));
                if (collectionHits.length) {
                    nodes.push(sectionHeading(`Aus Kollektionen (${collectionHits.length})`));
                    collectionHits.slice(0, MAX_RENDERED).forEach(hit => nodes.push(collectionHitRow(hit)));
                }
            }
        } else if (state.filter === 'fav') {
            const favorites = state.prompts.filter(item => item.is_favorite).sort(contract.compareLibraryOrder);
            nodes.push(sectionHeading(`Favoriten (${favorites.length})`, 'px-section-fav'));
            if (!favorites.length) nodes.push(h('p', { class: 'px-note', text: 'Noch keine Favoriten. Markiere einen Prompt beim Bearbeiten mit dem Stern.' }));
            favorites.forEach(item => nodes.push(promptRow(item)));
        } else if (state.filter.startsWith('cat:')) {
            filteredPrompts().slice().sort(compareByName).slice(0, MAX_RENDERED).forEach(item => nodes.push(promptRow(item)));
        } else {
            const favorites = state.prompts.filter(item => item.is_favorite).sort(contract.compareLibraryOrder);
            const recent = state.prompts
                .filter(item => !item.is_favorite && item.last_used_at)
                .sort(contract.compareLibraryOrder)
                .slice(0, RECENT_LIMIT);
            if (favorites.length) {
                nodes.push(sectionHeading(`Favoriten (${favorites.length})`, 'px-section-fav'));
                favorites.forEach(item => nodes.push(promptRow(item)));
            }
            if (recent.length) {
                nodes.push(sectionHeading('Zuletzt verwendet'));
                recent.forEach(item => nodes.push(promptRow(item)));
            }
            nodes.push(sectionHeading('Kategorien'));
            categoryGroups().forEach(group => {
                nodes.push(groupRow(group));
                if (state.openGroups.has(group.key)) {
                    group.items.slice(0, MAX_RENDERED).forEach(item => nodes.push(promptRow(item, { nested: true })));
                }
            });
        }
        el.list.replaceChildren(...nodes);
    }

    function renderFirstStart() {
        return h('div', { class: 'px-empty' },
            h('span', { class: 'px-empty-icon', 'aria-hidden': 'true' }, icon('pencil')),
            h('p', { class: 'px-empty-title', text: 'Lege deinen ersten Prompt an.' }),
            h('p', { class: 'px-empty-text', text: 'Oder übernimm einen fertigen aus den Kollektionen.' }),
            h('button', { type: 'button', class: 'px-btn px-btn-primary', text: 'Ersten Prompt anlegen', onclick: () => startCreate() }),
            h('button', { type: 'button', class: 'px-linkbtn', text: 'Kollektionen ansehen', onclick: () => openCollections() }));
    }

    function renderLimit() {
        const show = isFree() && state.contentCount >= LIMIT_HINT_FROM;
        el.limitBar.hidden = !show;
        if (!show) return;
        const used = state.contentCount;
        el.limitText.replaceChildren(h('strong', { text: `${used} von ${FREE_CONTENT_LIMIT}` }), ' Inhalten genutzt');
        el.limitFill.style.width = `${Math.min(100, (used / FREE_CONTENT_LIMIT) * 100)}%`;
        el.limitProgress.classList.toggle('is-full', used >= FREE_CONTENT_LIMIT);
        el.limitProgress.setAttribute('aria-valuenow', String(Math.min(used, FREE_CONTENT_LIMIT)));
        el.limitProgress.setAttribute('aria-valuetext', `${used} von ${FREE_CONTENT_LIMIT} Inhalten genutzt`);
    }

    // ---------- Bearbeiten (Bild 3) ----------

    function promptValues(prompt) {
        if (isFreePrompt(prompt)) return { text: String(prompt.fields?.text || '') };
        return contract.structuredValues(prompt);
    }

    function openEdit(prompt, direction = 'forward') {
        const mode = isFreePrompt(prompt) ? 'free' : 'structured';
        const editor = {
            prompt,
            mode,
            baseline: null,
            copiedSnapshot: null
        };
        const nameInput = h('input', { class: 'px-input', id: 'edit-name', type: 'text', maxLength: 200, value: prompt.name || '' });
        const category = buildCategorySelect(categoryKeyOf(prompt), { onChange: () => update() });
        category.button.id = 'edit-category';
        const inputs = {};
        const fieldNodes = [];
        if (mode === 'free') {
            inputs.text = h('textarea', { class: 'px-textarea is-large', id: 'edit-text', maxLength: 50000 });
            inputs.text.value = String(prompt.fields?.text || '');
            fieldNodes.push(h('label', { class: 'px-label', for: 'edit-text', text: 'Prompt' }), inputs.text);
        } else {
            const values = contract.structuredValues(prompt);
            STRUCTURED_FIELDS.forEach(field => {
                const input = h('textarea', { class: 'px-textarea', id: `edit-${field.key}`, maxLength: 50000, rows: 3 });
                input.value = values[field.key] || '';
                inputs[field.key] = input;
                fieldNodes.push(h('label', { class: 'px-label', for: `edit-${field.key}`, text: field.label }), input);
            });
        }
        Object.values(inputs).forEach(autoGrow);
        const hint = h('p', { class: 'px-formhint', 'aria-live': 'polite' });
        const copyButton = h('button', { type: 'button', class: 'px-btn px-btn-primary' }, icon('copy'), 'Kopieren');
        const saveButton = h('button', { type: 'button', class: 'px-btn px-btn-secondary', text: 'Speichern' });
        const star = h('button', { type: 'button', class: 'px-iconbtn' });

        const currentValues = () => Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value]));
        const snapshot = () => JSON.stringify({ name: nameInput.value.trim(), category: category.value, fields: toFieldsPayload(mode, currentValues()) });
        const contentSnapshot = () => JSON.stringify({ name: nameInput.value.trim(), fields: toFieldsPayload(mode, currentValues()) });
        const setBaseline = () => {
            editor.baseline = { all: snapshot(), content: contentSnapshot(), category: category.value };
        };
        const isDirty = () => snapshot() !== editor.baseline.all;

        const renderStar = () => {
            const fav = !!editor.prompt.is_favorite;
            star.replaceChildren(icon(fav ? 'star-fill' : 'star'));
            star.classList.toggle('is-fav', fav);
            star.setAttribute('aria-pressed', fav ? 'true' : 'false');
            star.setAttribute('aria-label', fav ? 'Favorit entfernen' : 'Als Favorit markieren');
        };

        function update() {
            const version = Number(editor.prompt.current_version) || 1;
            const contentDirty = contentSnapshot() !== editor.baseline.content;
            const categoryDirty = category.value !== editor.baseline.category;
            if (contentDirty) hint.textContent = `Speichern legt Fassung ${version + 1} an. Fassung ${version} bleibt erhalten.`;
            else if (categoryDirty) hint.textContent = `Speichern ändert nur die Kategorie. Fassung ${version} bleibt die aktuelle.`;
            else hint.textContent = `Fassung ${version}. Kopieren übernimmt deine Eingaben, ohne zu speichern.`;
            saveButton.disabled = !(contentDirty || categoryDirty);
        }

        const canLeave = async () => {
            if (isDirty() && editor.copiedSnapshot !== snapshot()) return confirmDiscard();
            return true;
        };
        const leave = async () => {
            if (await canLeave()) showMain('back');
        };

        star.addEventListener('click', async () => {
            const next = !editor.prompt.is_favorite;
            editor.prompt.is_favorite = next;
            renderStar();
            const result = await updatePrompt(editor.prompt.id, { is_favorite: next });
            if (!result.success) {
                editor.prompt.is_favorite = !next;
                renderStar();
                showToast('Speichern war nicht möglich.', { error: true });
                return;
            }
            editor.prompt = Object.assign(editor.prompt, result.prompt);
            upsertLocal(state.prompts, editor.prompt);
            buildIndex();
            writeCache();
        });

        copyButton.addEventListener('click', async () => {
            const copied = await copyOwnPrompt(editor.prompt, payloadText(mode, currentValues()));
            if (copied) editor.copiedSnapshot = snapshot();
        });

        saveButton.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            const values = currentValues();
            if (!name) {
                showToast('Bitte einen Titel eingeben.', { error: true });
                nameInput.focus();
                return;
            }
            if (!hasContent(mode, values)) {
                showToast('Bitte Text eingeben.', { error: true });
                return;
            }
            const patch = {};
            const contentDirty = contentSnapshot() !== editor.baseline.content;
            if (contentDirty) {
                patch.name = name;
                patch.fields = toFieldsPayload(mode, values);
            }
            if (category.value !== editor.baseline.category) {
                patch.category_id = category.value === NONE_KEY ? null : Number(category.value.slice(3));
            }
            saveButton.disabled = true;
            // Neue Fassung nur auf die geladene Fassung; eine reine Kategorieänderung braucht das nicht.
            const expectedVersion = contentDirty ? (Number(editor.prompt.current_version) || 1) : null;
            let result = await updatePrompt(editor.prompt.id, patch, { expectedVersion });
            if (!result.success && result.reason === 'CONFLICT') {
                const choice = await openSheet({
                    title: 'Inzwischen geändert',
                    text: `Dieser Prompt wurde an anderer Stelle geändert und steht jetzt bei Fassung ${result.prompt.current_version}. Speicherst du trotzdem, wird deine Fassung die neue aktuelle. Die andere bleibt als Fassung erhalten.`,
                    actions: [
                        { label: 'Meine Fassung speichern', kind: 'primary', value: 'save' },
                        { label: 'Neu laden', kind: 'secondary', value: 'reload' }
                    ]
                });
                if (choice === 'save') {
                    result = await updatePrompt(editor.prompt.id, patch, { expectedVersion: Number(result.prompt.current_version) || 1 });
                } else {
                    if (choice === 'reload') {
                        upsertLocal(state.prompts, result.prompt);
                        buildIndex();
                        writeCache();
                        openEdit(result.prompt, 'none');
                        showToast('Aktuelle Fassung geladen.');
                    } else {
                        saveButton.disabled = false;
                    }
                    return;
                }
            }
            if (!result.success) {
                saveButton.disabled = false;
                showToast('Speichern war nicht möglich.', { error: true });
                return;
            }
            editor.prompt = Object.assign(editor.prompt, result.prompt);
            upsertLocal(state.prompts, editor.prompt);
            buildIndex();
            writeCache();
            setBaseline();
            editor.copiedSnapshot = null;
            update();
            showToast(contentDirty ? `Fassung ${editor.prompt.current_version} gespeichert.` : 'Kategorie gespeichert.');
        });

        [nameInput, ...Object.values(inputs)].forEach(input => input.addEventListener('input', update));
        setBaseline();

        showSub({
            type: 'edit',
            canLeave,
            render: () => {
                renderStar();
                update();
                return [
                    subHeader(backButton('Bibliothek', leave), star),
                    h('div', { class: 'px-scroll' },
                        h('div', { class: 'px-form' },
                            h('label', { class: 'px-label', for: 'edit-name', text: 'Titel' }), nameInput,
                            h('label', { class: 'px-label', for: 'edit-category', text: 'Kategorie' }), category.button,
                            ...fieldNodes,
                            hint)),
                    ...areaNav('library', [copyButton, saveButton])
                ];
            }
        }, direction);
    }

    // ---------- Neuer Prompt (Bild 4) ----------

    async function startCreate(prefill = {}) {
        if (contentLimitReached()) {
            await openLimitSheet('content');
            return;
        }
        openCreate(prefill);
    }

    function openCreate(prefill = {}) {
        let mode = state.defaultMode === 'structured' ? 'structured' : 'free';
        const filterKey = state.filter.startsWith('cat:') ? state.filter.slice(4) : NONE_KEY;
        const startCategory = filterKey.startsWith('name:') ? NONE_KEY : filterKey;

        // Jeder Modus behält seinen eigenen Entwurf (wie renderCreatePrompt in library.js).
        const inputs = {
            text: h('textarea', { class: 'px-textarea is-large', id: 'create-text', maxLength: 50000, placeholder: 'Prompt hier einfügen oder schreiben...' })
        };
        STRUCTURED_FIELDS.forEach(field => {
            inputs[field.key] = h('textarea', { class: 'px-textarea', id: `create-${field.key}`, maxLength: 50000, rows: 3, placeholder: field.placeholder });
        });
        Object.values(inputs).forEach(autoGrow);
        const titleInput = h('input', { class: 'px-input', id: 'create-title', type: 'text', maxLength: 200, value: prefill.title || '' });
        const category = buildCategorySelect(startCategory, { allowCreate: true });
        category.button.id = 'create-category';
        const fieldsWrap = h('div');
        const saveButton = h('button', { type: 'button', class: 'px-btn px-btn-primary', text: 'In Bibliothek speichern' });
        const segStructured = h('button', { type: 'button', text: 'Strukturiert' });
        const segFree = h('button', { type: 'button', text: 'Frei' });

        const values = () => (mode === 'free'
            ? { text: inputs.text.value }
            : Object.fromEntries(STRUCTURED_FIELDS.map(field => [field.key, inputs[field.key].value])));

        const update = () => {
            const suggestion = suggestionFor(mode, values());
            titleInput.placeholder = suggestion || (mode === 'free' ? 'Wird aus der ersten Zeile vorgeschlagen' : 'Wird aus der Aufgabe vorgeschlagen');
            saveButton.disabled = !hasContent(mode, values());
        };

        const renderFields = () => {
            segStructured.setAttribute('aria-pressed', mode === 'structured' ? 'true' : 'false');
            segFree.setAttribute('aria-pressed', mode === 'free' ? 'true' : 'false');
            if (mode === 'free') {
                fieldsWrap.replaceChildren(h('label', { class: 'px-label', for: 'create-text', text: 'Prompt' }), inputs.text);
            } else {
                fieldsWrap.replaceChildren(...STRUCTURED_FIELDS.flatMap(field => [
                    h('label', { class: 'px-label', for: `create-${field.key}`, text: field.label }),
                    inputs[field.key]
                ]));
            }
            update();
        };

        const setMode = next => {
            if (mode === next) return;
            mode = next;
            renderFields();
            fieldsWrap.querySelector('textarea')?.focus();
        };
        segStructured.addEventListener('click', () => setMode('structured'));
        segFree.addEventListener('click', () => setMode('free'));

        const anyInput = () => Boolean(titleInput.value.trim()) || Object.values(inputs).some(input => input.value.trim());
        const canLeave = async () => {
            const typed = Object.values(inputs).some(input => input.value.trim()) || titleInput.value.trim() !== String(prefill.title || '').trim();
            if (typed && anyInput()) return confirmDiscard();
            return true;
        };
        const cancel = async () => {
            if (await canLeave()) showMain('back');
        };

        saveButton.addEventListener('click', async () => {
            const current = values();
            if (!hasContent(mode, current)) return;
            if (contentLimitReached()) {
                await openLimitSheet('content');
                return;
            }
            const name = titleInput.value.trim() || suggestionFor(mode, current) || 'Neuer Prompt';
            const categoryName = category.value === NONE_KEY ? null : categoryLabel(category.value);
            saveButton.disabled = true;
            const result = await insertPrompt({ name, fields: toFieldsPayload(mode, current), category: categoryName });
            if (!result.success) {
                update();
                if (result.reason === 'FREE_LIMIT_REACHED') {
                    state.contentCount = Math.max(state.contentCount, FREE_CONTENT_LIMIT);
                    await openLimitSheet('content');
                } else {
                    showToast('Speichern war nicht möglich.', { error: true });
                }
                return;
            }
            upsertLocal(state.prompts, result.prompt);
            state.contentCount += 1;
            buildIndex();
            writeCache();
            showMain('back');
            showToast('Prompt gespeichert.');
            refreshFromServer();
        });

        titleInput.addEventListener('input', update);
        Object.values(inputs).forEach(input => input.addEventListener('input', update));

        showSub({
            type: 'create',
            canLeave,
            render: () => {
                renderFields();
                const firstField = mode === 'free' ? inputs.text : inputs.role;
                firstField.dataset.autofocus = '';
                return [
                    subHeader(textButton('Abbrechen', cancel),
                        h('div', { class: 'px-segment', role: 'group', 'aria-label': 'Prompt-Typ' }, segStructured, segFree)),
                    h('div', { class: 'px-scroll' },
                        h('div', { class: 'px-form' },
                            fieldsWrap,
                            h('p', { class: 'px-formhint', text: 'Platzhalter schreibst du als [[Name]], zum Beispiel [[Zielgruppe]].' }),
                            h('label', { class: 'px-label', for: 'create-title', text: 'Titel' }), titleInput,
                            h('label', { class: 'px-label', for: 'create-category', text: 'Kategorie' }), category.button)),
                    ...areaNav('library', [saveButton])
                ];
            }
        });
    }

    // ---------- Bausteine (Bild 5) ----------

    // Einsatzbereiche in der Reihenfolge der Web-App (SNIPPET_CATEGORIES in app.html,
    // fieldLabels in snippet-library.js). Unbekannte oder leere field_id zählen als frei.
    const SNIPPET_GROUPS = [
        { key: 'role', label: 'Rolle & Funktion' },
        { key: 'context', label: 'Kontext' },
        { key: 'task', label: 'Aufgabe' },
        { key: 'format', label: 'Format' },
        { key: 'free', label: 'Freie Bausteine' }
    ];

    function snippetGroupOf(snippet) {
        return SNIPPET_GROUPS.some(group => group.key === snippet.field_id) ? snippet.field_id : 'free';
    }

    function openSnippets(direction = 'forward') {
        const body = h('div', { class: 'px-scroll px-list', id: 'snippet-list', role: 'list', 'aria-label': 'Bausteine' });
        const search = h('input', {
            class: 'px-search-input',
            id: 'snippet-search',
            type: 'search',
            autocomplete: 'off',
            spellcheck: 'false',
            placeholder: 'Suchen...',
            'aria-label': 'Bausteine durchsuchen',
            'aria-controls': 'snippet-list',
            'data-autofocus': ''
        });
        search.value = state.snippetQuery;
        const clear = h('button', { type: 'button', class: 'px-search-clear', 'aria-label': 'Suche leeren', hidden: !state.snippetQuery }, icon('x'));
        const setQuery = value => {
            state.snippetQuery = value;
            search.value = value;
            clear.hidden = !value;
            renderBody();
            body.scrollTop = 0;
        };
        search.addEventListener('input', () => setQuery(search.value));
        search.addEventListener('keydown', event => {
            if (event.key === 'Escape' && state.snippetQuery) {
                event.preventDefault();
                setQuery('');
            }
        });
        clear.addEventListener('click', () => {
            setQuery('');
            search.focus();
        });
        const snippetRow = (snippet, nested = false) => {
                const name = snippet.name || 'Ohne Namen';
                return h('div', { class: `px-row2${nested ? ' px-row2-nested' : ''}`, role: 'listitem' },
                    h('button', {
                        type: 'button',
                        class: 'px-row2-main',
                        title: 'Klicken zum Kopieren',
                        'aria-label': `${name} kopieren`,
                        onclick: () => copySnippet(snippet)
                    }, h('span', { class: 'px-row2-text' },
                        h('span', { class: 'px-row2-title', text: name }),
                        h('span', { class: 'px-row2-sub', text: String(snippet.content || '').replace(/\s+/g, ' ').trim() }))),
                    h('button', {
                        type: 'button',
                        class: 'px-iconbtn px-row-edit',
                        'aria-label': `${name} bearbeiten`,
                        onclick: () => openSnippetForm(snippet)
                    }, icon('pencil')));
        };
        const renderBody = () => {
            if (!state.snippets.length) {
                body.replaceChildren(h('div', { class: 'px-empty' },
                    h('span', { class: 'px-empty-icon', 'aria-hidden': 'true' }, icon('box')),
                    h('p', { class: 'px-empty-title', text: 'Noch keine Bausteine.' }),
                    h('button', { type: 'button', class: 'px-btn px-btn-primary', text: 'Ersten Baustein anlegen', onclick: () => startSnippetForm(null) })));
                return;
            }
            const query = state.snippetQuery.trim();
            const items = query
                ? state.snippets.filter(snippet => contract.matchesSearch(contract.snippetSearchTokens(snippet), query))
                : state.snippets;
            // Wie die Bibliothek: Suche zeigt eine flache Trefferliste, sonst einklappbare
            // Gruppen (anfangs zu, nur Gruppen mit Inhalt, innen nach Namen sortiert).
            if (query) {
                const hits = items.slice().sort(contract.compareLibraryOrder);
                body.replaceChildren(...(hits.length
                    ? [sectionHeading(`Treffer (${hits.length})`), ...hits.slice(0, MAX_RENDERED).map(snippet => snippetRow(snippet))]
                    : [h('p', { class: 'px-note', text: 'Keine Treffer in deinen Bausteinen.' })]));
                return;
            }
            const nodes = [sectionHeading('Einsatzbereiche')];
            SNIPPET_GROUPS.forEach(group => {
                const rows = items.filter(snippet => snippetGroupOf(snippet) === group.key).sort(compareByName);
                if (!rows.length) return;
                nodes.push(groupRow({ key: group.key, label: group.label, items: rows }, { openSet: state.openSnippetGroups, list: body, render: renderBody }));
                if (state.openSnippetGroups.has(group.key)) rows.slice(0, MAX_RENDERED).forEach(snippet => nodes.push(snippetRow(snippet, true)));
            });
            body.replaceChildren(...nodes);
        };
        showSub({
            type: 'snippets',
            refresh: renderBody,
            render: () => {
                renderBody();
                return [
                    subHeader(areaTitle('Bau', 'steine')),
                    state.snippets.length ? h('div', { class: 'px-search' }, iconSpan('search', 'px-search-icon'), search, clear) : null,
                    body,
                    ...areaNav('snippets', [h('button', { type: 'button', class: 'px-newbar-btn', onclick: () => startSnippetForm(null) }, icon('plus'), h('span', { text: 'Neuer Baustein' }))])
                ];
            }
        }, direction);
    }

    async function startSnippetForm(snippet) {
        if (!snippet && contentLimitReached()) {
            await openLimitSheet('content');
            return;
        }
        openSnippetForm(snippet);
    }

    // Auswahl des Einsatzbereichs, gleiches Menü wie die Kategorieauswahl.
    function buildSnippetGroupSelect(initialKey, { onChange } = {}) {
        let current = initialKey;
        const labelOf = key => SNIPPET_GROUPS.find(group => group.key === key)?.label || 'Freie Bausteine';
        const label = h('span', { class: 'px-select-label', text: labelOf(current) });
        const button = h('button', {
            type: 'button',
            class: 'px-select',
            id: 'snippet-group',
            'aria-haspopup': 'listbox',
            'aria-expanded': 'false'
        }, label, icon('chevron-down'));
        button.addEventListener('click', () => openMenu(button, {
            label: 'Einsatzbereich',
            options: SNIPPET_GROUPS.map(group => ({ key: group.key, label: group.label })),
            selected: current,
            onSelect: key => {
                current = key;
                label.textContent = labelOf(key);
                onChange?.(key);
            },
            minWidth: 220
        }));
        return { button, get value() { return current; } };
    }

    function openSnippetForm(snippet) {
        const nameInput = h('input', { class: 'px-input', id: 'snippet-name', type: 'text', maxLength: 200, value: snippet?.name || '', placeholder: 'z. B. Zielgruppe' });
        const contentInput = h('textarea', { class: 'px-textarea', id: 'snippet-content', maxLength: 50000, rows: 4 });
        contentInput.value = snippet?.content || '';
        autoGrow(contentInput);
        nameInput.dataset.autofocus = '';
        const saveButton = h('button', { type: 'button', class: 'px-btn px-btn-primary', text: 'Speichern' });
        // Neue Bausteine starten wie bisher unter „Freie Bausteine“, vorhandene in ihrem Bereich.
        const initialGroup = snippet ? snippetGroupOf(snippet) : 'free';
        const groupSelect = buildSnippetGroupSelect(initialGroup, { onChange: () => update() });
        const baseline = JSON.stringify([nameInput.value, contentInput.value, initialGroup]);
        const isDirty = () => JSON.stringify([nameInput.value, contentInput.value, groupSelect.value]) !== baseline;
        const update = () => {
            saveButton.disabled = !nameInput.value.trim() || !contentInput.value.trim() || !isDirty();
        };
        const canLeave = async () => !isDirty() || confirmDiscard();
        const cancel = async () => {
            if (await canLeave()) openSnippets('back');
        };
        saveButton.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            const content = contentInput.value.replace(/\r\n/g, '\n');
            if (!name || !content.trim()) return;
            saveButton.disabled = true;
            const fieldId = groupSelect.value;
            // Den Bereich nur mitschicken, wenn er sich ändert. So bleibt bei alten Bausteinen
            // ohne field_id oder mit mode „both“ alles, wie es war.
            const patch = { name, content };
            if (snippet && fieldId !== initialGroup) Object.assign(patch, { field_id: fieldId, mode: snippetModeFor(fieldId) });
            const result = snippet
                ? await updateSnippet(snippet.id, patch)
                : await insertSnippet({ name, content, fieldId });
            if (!result.success) {
                update();
                if (result.reason === 'FREE_LIMIT_REACHED') {
                    state.contentCount = Math.max(state.contentCount, FREE_CONTENT_LIMIT);
                    await openLimitSheet('content');
                } else {
                    showToast('Speichern war nicht möglich.', { error: true });
                }
                return;
            }
            upsertLocal(state.snippets, result.snippet);
            if (!snippet) state.contentCount += 1;
            writeCache();
            // Den Zielbereich aufklappen, damit der gespeicherte Baustein sichtbar ist.
            if (!state.openSnippetGroups.has(fieldId)) {
                state.openSnippetGroups.add(fieldId);
                writeUiPrefs();
            }
            openSnippets('back');
            showToast('Baustein gespeichert.');
            if (!snippet) refreshFromServer();
        });
        [nameInput, contentInput].forEach(input => input.addEventListener('input', update));
        update();
        showSub({
            type: 'snippet-form',
            canLeave,
            render: () => [
                subHeader(textButton('Abbrechen', cancel), h('span', { class: 'px-header-title', text: snippet ? 'Baustein bearbeiten' : 'Neuer Baustein' })),
                h('div', { class: 'px-scroll' },
                    h('div', { class: 'px-form' },
                        h('label', { class: 'px-label', for: 'snippet-name', text: 'Name' }), nameInput,
                        h('label', { class: 'px-label', for: 'snippet-group', text: 'Einsatzbereich' }), groupSelect.button,
                        h('label', { class: 'px-label', for: 'snippet-content', text: 'Inhalt' }), contentInput)),
                ...areaNav('snippets', [saveButton])
            ]
        });
    }

    // ---------- Kollektionen (Bild 6) ----------

    function promptCountLabel(count) {
        return count === 1 ? '1 Prompt' : `${count} Prompts`;
    }

    function openCollections(direction = 'forward') {
        const body = h('div', { class: 'px-scroll px-list', id: 'collection-list', role: 'list', 'aria-label': 'Kollektionen' });
        const renderBody = () => {
            if (!COLLECTIONS.length) {
                const retry = h('button', {
                    type: 'button',
                    class: 'px-btn px-btn-secondary',
                    text: 'Erneut versuchen',
                    onclick: async () => {
                        collectionsStatus = 'loading';
                        renderBody();
                        await loadCollections({ force: true });
                    }
                });
                body.replaceChildren(collectionsStatus === 'error'
                    ? h('div', { class: 'px-empty' },
                        h('p', { class: 'px-empty-title', text: 'Kollektionen gerade nicht erreichbar.' }),
                        h('p', { class: 'px-empty-text', text: 'Sie werden von promptomizer.de geladen. Prüfe die Verbindung und versuche es erneut.' }),
                        retry)
                    : h('p', { class: 'px-note', text: 'Kollektionen werden geladen …' }));
                return;
            }
            body.replaceChildren(...COLLECTIONS.map(collection => h('div', { class: 'px-row2', role: 'listitem' },
                h('button', { type: 'button', class: 'px-row2-main', onclick: () => openCollection(collection) },
                    iconSpan('layers', 'px-row2-icon'),
                    h('span', { class: 'px-row2-text' },
                        h('span', { class: 'px-row2-title', text: collection.title }),
                        collection.benefit ? h('span', { class: 'px-row2-sub is-wrap', text: collection.benefit }) : null),
                    h('span', { class: 'px-row2-meta', text: promptCountLabel((collection.prompts || []).length) }),
                    iconSpan('chevron-right', 'px-row2-chevron')))));
        };
        showSub({
            type: 'collections',
            refresh: renderBody,
            render: () => {
                renderBody();
                return [subHeader(areaTitle('Kollekt', 'ionen')), body, ...areaNav('collections')];
            }
        }, direction);
        loadCollections();
    }

    function openCollection(collection, direction = 'forward') {
        const body = h('div', { class: 'px-scroll' });
        const renderBody = () => {
            body.replaceChildren(
                h('div', { class: 'px-coll-head' },
                    h('p', { class: 'px-eyebrow', text: 'Kollektion' }),
                    h('h1', { class: 'px-h2', text: collection.title }),
                    collection.benefit ? h('p', { class: 'px-coll-benefit', text: collection.benefit }) : null),
                h('div', { class: 'px-list', role: 'list', 'aria-label': collection.title },
                    (collection.prompts || []).map(prompt => h('div', { class: 'px-row2', role: 'listitem' },
                        h('button', { type: 'button', class: 'px-row2-main', onclick: () => openCollectionPrompt(collection, prompt) },
                            h('span', { class: 'px-row2-text' }, h('span', { class: 'px-row2-title', text: prompt.title })),
                            adoptedPromptFor(prompt.id) ? h('span', { class: 'px-adopted' }, icon('check'), 'Übernommen') : null,
                            iconSpan('chevron-right', 'px-row2-chevron'))))));
        };
        showSub({
            type: 'collection',
            refresh: renderBody,
            render: () => {
                renderBody();
                return [subHeader(backButton('Kollektionen', () => openCollections('back'))), body, ...areaNav('collections')];
            }
        }, direction);
    }

    function appendHighlighted(container, text) {
        const value = String(text ?? '');
        let cursor = 0;
        PREVIEW_PLACEHOLDER.lastIndex = 0;
        let match;
        while ((match = PREVIEW_PLACEHOLDER.exec(value)) !== null) {
            const inner = (match[1] ?? match[2]).trim();
            if (!inner || /^x$/i.test(inner)) continue;
            if (match.index > cursor) container.append(document.createTextNode(value.slice(cursor, match.index)));
            container.append(h('mark', { class: 'px-ph', text: match[0] }));
            cursor = match.index + match[0].length;
        }
        if (cursor < value.length) container.append(document.createTextNode(value.slice(cursor)));
    }

    function openCollectionPrompt(collection, prompt, direction = 'forward') {
        const preview = h('div', { class: 'px-preview' });
        appendHighlighted(preview, collectionText(prompt));
        const adoptButton = h('button', { type: 'button', class: 'px-btn px-btn-primary' });
        const renderAdopt = () => {
            adoptButton.textContent = adoptedPromptFor(prompt.id) ? 'In Bibliothek öffnen' : 'In meine Bibliothek übernehmen';
        };
        adoptButton.addEventListener('click', async () => {
            const existing = adoptedPromptFor(prompt.id);
            if (existing) {
                openEdit(existing);
                return;
            }
            await adoptCollectionPrompt(prompt, adoptButton);
        });
        renderAdopt();
        showSub({
            type: 'collection-prompt',
            refresh: renderAdopt,
            render: () => [
                subHeader(backButton(collection.title, () => openCollection(collection, 'back'))),
                h('div', { class: 'px-scroll' },
                    h('div', { class: 'px-coll-head' },
                        h('p', { class: 'px-eyebrow', text: collection.title }),
                        h('h1', { class: 'px-h2', text: prompt.title }),
                        prompt.purpose ? h('p', { class: 'px-coll-benefit', text: prompt.purpose }) : null),
                    preview),
                ...areaNav('collections', [adoptButton,
                    h('button', {
                        type: 'button',
                        class: 'px-iconbtn px-iconbtn-square',
                        'aria-label': 'Nur kopieren',
                        title: 'Nur kopieren',
                        onclick: () => copyCollectionPrompt(prompt)
                    }, icon('copy'))])
            ]
        }, direction);
    }

    async function adoptCollectionPrompt(prompt, button) {
        if (contentLimitReached()) {
            await openLimitSheet('content');
            return;
        }
        let choice = NONE_KEY;
        const confirmed = await openSheet({
            title: 'In welche Kategorie?',
            body: buildChoiceList(categoryOptions(), choice, key => { choice = key; }),
            actions: [
                { label: 'Übernehmen', kind: 'primary', value: true },
                { label: 'Abbrechen', kind: 'secondary', value: false }
            ]
        });
        if (!confirmed) return;
        button.disabled = true;
        const result = await insertPrompt({
            name: prompt.title,
            fields: collectionFields(prompt),
            category: choice === NONE_KEY ? null : categoryLabel(choice)
        });
        button.disabled = false;
        if (!result.success) {
            if (result.reason === 'FREE_LIMIT_REACHED') {
                state.contentCount = Math.max(state.contentCount, FREE_CONTENT_LIMIT);
                await openLimitSheet('content');
            } else {
                showToast('Übernehmen war nicht möglich.', { error: true });
            }
            return;
        }
        upsertLocal(state.prompts, result.prompt);
        state.contentCount += 1;
        state.adopted[prompt.id] = result.prompt.id;
        buildIndex();
        writeCache();
        writeAdopted();
        openEdit(result.prompt);
        showToast('In Bibliothek übernommen.');
        refreshFromServer();
    }

    // ---------- Anmeldung ----------

    function renderAuthView() {
        const loggedIn = !!state.user;
        el.viewLogin.hidden = loggedIn;
        el.viewSub.hidden = true;
        el.viewSub.replaceChildren();
        state.sub = null;
        el.viewMain.hidden = !loggedIn;
        if (loggedIn) {
            el.search.value = state.query;
            renderMain();
            el.search.focus();
        } else {
            el.loginEmail.focus();
        }
    }

    function loginErrorMessage(error) {
        const message = String(error?.message || '');
        if (/invalid login credentials/i.test(message)) return 'E-Mail oder Passwort falsch.';
        if (/email not confirmed/i.test(message)) return 'Bitte zuerst die E-Mail-Adresse bestätigen.';
        if (/failed to fetch|network/i.test(message)) return 'Keine Verbindung zum Server.';
        return 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.';
    }

    function showLoginError(message) {
        el.loginError.textContent = message;
        el.loginError.hidden = false;
    }

    async function completeLogin(user) {
        state.user = user || null;
        state.pendingSignOut = false;
        el.loginPassword.value = '';
        resetData();
        await readAdopted();
        renderAuthView();
        await refreshFromServer();
        loadCollections();
    }

    async function handleLogin(event) {
        event.preventDefault();
        const email = el.loginEmail.value.trim();
        const password = el.loginPassword.value;
        el.loginError.hidden = true;
        if (!email || !password) {
            showLoginError('Bitte E-Mail und Passwort eingeben.');
            return;
        }
        el.loginSubmit.disabled = true;
        try {
            const { data, error } = await client.auth.signInWithPassword({ email, password });
            if (error) throw error;
            await completeLogin(data?.user);
        } catch (error) {
            console.warn('Anmeldung fehlgeschlagen.', error?.message);
            showLoginError(loginErrorMessage(error));
        } finally {
            el.loginSubmit.disabled = false;
        }
    }

    // Google über das Chrome-eigene Anmeldefenster (chrome.identity, Recht "identity" ohne
    // Installationswarnung). Supabase leitet nach Google auf die feste Rücksprungadresse
    // https://<extension-id>.chromiumapp.org/ zurück, die in der Supabase-Redirect-Allowlist
    // steht. Der Code wird per PKCE gegen eine normale Sitzung getauscht.
    function readAuthResponse(responseUrl) {
        const url = new URL(responseUrl);
        const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
        const read = key => url.searchParams.get(key) || hash.get(key);
        return { code: read('code'), error: read('error'), description: read('error_description') };
    }

    function googleErrorMessage(error) {
        const message = String(error?.message || '');
        if (/did not approve|cancel|closed|abgebrochen/i.test(message)) return 'Google-Anmeldung abgebrochen.';
        if (/failed to fetch|network|could not be loaded/i.test(message)) return 'Keine Verbindung zum Server.';
        return 'Google-Anmeldung fehlgeschlagen. Bitte erneut versuchen.';
    }

    async function handleGoogleLogin() {
        el.loginError.hidden = true;
        el.loginGoogle.disabled = true;
        try {
            const { data, error } = await client.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: chrome.identity.getRedirectURL(),
                    skipBrowserRedirect: true,
                    queryParams: { prompt: 'select_account' }
                }
            });
            if (error) throw error;
            const responseUrl = await chrome.identity.launchWebAuthFlow({ url: data.url, interactive: true });
            if (!responseUrl) throw new Error('abgebrochen');
            const response = readAuthResponse(responseUrl);
            if (response.error || !response.code) throw new Error(response.description || response.error || 'kein Code');
            const { data: sessionData, error: exchangeError } = await client.auth.exchangeCodeForSession(response.code);
            if (exchangeError) throw exchangeError;
            await completeLogin(sessionData?.user || sessionData?.session?.user);
        } catch (error) {
            console.warn('Google-Anmeldung fehlgeschlagen.', error?.message);
            showLoginError(googleErrorMessage(error));
        } finally {
            el.loginGoogle.disabled = false;
        }
    }

    function togglePasswordVisibility() {
        const show = el.loginPassword.type === 'password';
        el.loginPassword.type = show ? 'text' : 'password';
        el.loginPasswordToggle.textContent = show ? 'Verbergen' : 'Anzeigen';
        el.loginPasswordToggle.setAttribute('aria-pressed', show ? 'true' : 'false');
        el.loginPassword.focus();
    }

    function resetData() {
        state.prompts = [];
        state.snippets = [];
        state.categories = [];
        state.contentCount = 0;
        state.tier = null;
        state.defaultMode = null;
        state.fetchedAt = null;
        state.adopted = {};
        buildIndex();
    }

    // Die Leiste hat kein eigenes Abmelden (Entscheidung E10). Seit die Web-App nur lokal
    // abmeldet (E4), endet die Sitzung hier nur, wenn Supabase sie verwirft, etwa nach einer
    // Kontolöschung oder wenn ein Abmelden auf allen Geräten ausgelöst wurde.
    // Steht gerade ein Formular offen, bleibt es stehen, bis man es verlässt.
    async function handleSignedOut() {
        if (state.sub && ['edit', 'create', 'snippet-form'].includes(state.sub.type)) {
            if (!state.pendingSignOut) showToast('Deine Sitzung ist abgelaufen. Bitte neu anmelden.', { error: true, duration: 4000 });
            state.pendingSignOut = true;
            return;
        }
        state.user = null;
        state.query = '';
        state.snippetQuery = '';
        resetData();
        await clearCache();
        closeMenu({ focusAnchor: false });
        closeSheet(null);
        renderAuthView();
    }

    // ---------- Start ----------

    function bindMain() {
        el.search.addEventListener('input', () => {
            state.query = el.search.value;
            el.searchClear.hidden = !state.query;
            renderList();
            el.list.scrollTop = 0;
        });
        el.search.addEventListener('keydown', event => {
            if (event.key === 'Escape' && state.query) {
                event.preventDefault();
                clearSearch();
            }
        });
        el.searchClear.addEventListener('click', () => {
            clearSearch();
            el.search.focus();
        });
        el.chipAll.addEventListener('click', () => setFilter('all'));
        el.chipFav.addEventListener('click', () => setFilter(state.filter === 'fav' ? 'all' : 'fav'));
        el.chipCat.addEventListener('click', openCategoryFilter);
        el.newAction.addEventListener('click', () => startCreate());
        el.tabLibrary.addEventListener('click', () => goToArea('library'));
        el.tabSnippets.addEventListener('click', () => goToArea('snippets'));
        el.tabCollections.addEventListener('click', () => goToArea('collections'));
    }

    function clearSearch() {
        el.search.value = '';
        state.query = '';
        el.searchClear.hidden = true;
        renderList();
    }

    async function init() {
        hydrateIcons();
        el.loginForm.addEventListener('submit', handleLogin);
        el.loginGoogle.addEventListener('click', handleGoogleLogin);
        el.loginPasswordToggle.addEventListener('click', togglePasswordVisibility);
        bindMain();
        document.addEventListener('visibilitychange', refreshIfStale);
        window.addEventListener('focus', refreshIfStale);
        window.addEventListener('resize', () => closeMenu({ focusAnchor: false }));

        client.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT' && state.user) handleSignedOut();
        });

        const [cache, , sessionResult] = await Promise.all([
            readCache(),
            readUiPrefs(),
            client.auth.getSession().catch(() => ({ data: { session: null } })),
            readCollectionsCache()
        ]);
        const session = sessionResult?.data?.session || null;
        state.user = session?.user || null;

        if (state.user && cache && cache.userId === state.user.id) {
            applyCache(cache);
        } else if (cache) {
            await clearCache();
        }
        if (state.user) await readAdopted();

        renderAuthView();
        if (state.user) {
            refreshFromServer();
            loadCollections();
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
