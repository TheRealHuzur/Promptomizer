// Promptomizer Chrome-Extension – Popup-Logik (Stufe 1: suchen, kopieren, einfügen).
//
// Kein Content-Script, kein Service Worker, kein Zugriff auf fremde Seiten.
// Die Extension meldet sich wie die Web-App mit dem öffentlichen Anon-Key an und
// arbeitet mit einem gewöhnlichen Nutzer-Token gegen dieselben RLS-geschützten
// Tabellen. Prompt-Inhalte werden nirgends protokolliert.
(() => {
    'use strict';

    // Identisch mit db.js (öffentlich by design).
    const SUPABASE_URL = 'https://nrrsroaubbpmjyexhuhi.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ycnNyb2F1YmJwbWp5ZXhodWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MzU2ODcsImV4cCI6MjA4MzExMTY4N30.UcUIVDHiV6o5thTyeO8r5cylhPpNGl6Tpc3J0qsSxoM';

    const AUTH_STORAGE_KEY = 'promptomizer-ext-auth';
    const CACHE_KEY = 'promptomizer-ext-cache';
    const UI_KEY = 'promptomizer-ext-ui';
    const CACHE_VERSION = 1;
    const PAGE_SIZE = 200;
    const MAX_ITEMS = 1000;
    const MAX_RENDERED = 200;
    const TOAST_MS = 1400;

    // Spalten wie librarySelect in library.js / getLibrarySnippets in db.js, ohne user_id.
    const LIBRARY_SELECT = 'id, name, fields, created_at, category, category_id, description, is_favorite, last_used_at, prompt_type, updated_at';
    const SNIPPET_SELECT = 'id, name, content, mode, field_id, created_at, updated_at, is_favorite, last_used_at';

    // Feldlabels wie snippet-library.js.
    const FIELD_LABELS = {
        role: 'Rolle & Funktion',
        context: 'Kontext',
        task: 'Aufgabe',
        format: 'Format',
        free: 'Freie Bausteine'
    };

    const contract = PromptomizerContract;

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
            detectSessionInUrl: false
        }
    });

    const state = {
        user: null,
        tab: 'prompts',
        query: '',
        activeId: null,
        prompts: [],
        snippets: [],
        indexed: { prompts: [], snippets: [] },
        visible: [],
        fetchedAt: null,
        truncated: false,
        refreshing: false
    };

    const el = {
        viewLogin: document.getElementById('view-login'),
        viewLibrary: document.getElementById('view-library'),
        loginForm: document.getElementById('login-form'),
        loginEmail: document.getElementById('login-email'),
        loginPassword: document.getElementById('login-password'),
        loginError: document.getElementById('login-error'),
        loginSubmit: document.getElementById('login-submit'),
        logoutBtn: document.getElementById('logout-btn'),
        tabs: Array.from(document.querySelectorAll('.px-tab')),
        search: document.getElementById('search-input'),
        list: document.getElementById('result-list'),
        empty: document.getElementById('empty-state'),
        status: document.getElementById('status-text'),
        toast: document.getElementById('toast')
    };

    // ---------- Hilfsfunktionen ----------

    let toastTimer = null;
    function showToast(message, type = 'info') {
        el.toast.textContent = message;
        el.toast.className = `px-toast px-toast-${type}`;
        el.toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { el.toast.hidden = true; }, TOAST_MS);
    }

    function setStatus(text) {
        el.status.textContent = text || '';
    }

    function formatTime(value) {
        const date = value ? new Date(value) : null;
        if (!date || Number.isNaN(date.getTime())) return '';
        return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(date);
    }

    function firstLine(text) {
        return String(text || '')
            .replace(/\*\*[^*]*\*\*/g, ' ')
            .replace(/[#*_`>]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function currentList() {
        return state.tab === 'prompts' ? state.prompts : state.snippets;
    }

    function buildIndex() {
        state.indexed.prompts = state.prompts.map(item => ({ item, tokens: contract.promptSearchTokens(item) }));
        state.indexed.snippets = state.snippets.map(item => ({ item, tokens: contract.snippetSearchTokens(item) }));
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
                    truncated: state.truncated,
                    prompts: state.prompts,
                    snippets: state.snippets
                }
            });
        } catch (error) {
            console.warn('Cache konnte nicht geschrieben werden.', error?.message);
        }
    }

    async function clearCache() {
        try { await chrome.storage.local.remove(CACHE_KEY); } catch (_) { }
    }

    async function readUiPrefs() {
        try {
            const result = await chrome.storage.local.get(UI_KEY);
            const tab = result[UI_KEY]?.tab;
            if (tab === 'prompts' || tab === 'snippets') state.tab = tab;
        } catch (_) { }
    }

    async function writeUiPrefs() {
        try { await chrome.storage.local.set({ [UI_KEY]: { tab: state.tab } }); } catch (_) { }
    }

    // ---------- Daten ----------

    function applyCache(cache) {
        state.prompts = Array.isArray(cache.prompts) ? cache.prompts : [];
        state.snippets = Array.isArray(cache.snippets) ? cache.snippets : [];
        state.fetchedAt = cache.fetchedAt || null;
        state.truncated = !!cache.truncated;
        buildIndex();
    }

    async function fetchAll(table, select) {
        const rows = [];
        let from = 0;
        let truncated = false;
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
            if (from >= MAX_ITEMS) { truncated = true; break; }
        }
        // Serverseitig bereits sortiert; lokal nochmals, damit Cache und Neusortierung nach dem Kopieren dieselbe Ordnung nutzen.
        rows.sort(contract.compareLibraryOrder);
        return { rows, truncated };
    }

    async function refreshFromServer() {
        if (!state.user || state.refreshing) return;
        state.refreshing = true;
        setStatus('Aktualisiere …');
        try {
            const [library, snippets] = await Promise.all([
                fetchAll('library', LIBRARY_SELECT),
                fetchAll('snippets', SNIPPET_SELECT)
            ]);
            const changed = JSON.stringify(library.rows) !== JSON.stringify(state.prompts)
                || JSON.stringify(snippets.rows) !== JSON.stringify(state.snippets);
            state.prompts = library.rows;
            state.snippets = snippets.rows;
            state.truncated = library.truncated || snippets.truncated;
            state.fetchedAt = new Date().toISOString();
            if (changed) buildIndex();
            await writeCache();
            if (changed) renderList();
            setStatus(statusLine());
        } catch (error) {
            console.warn('Bibliothek konnte nicht geladen werden.', error?.message);
            if (isAuthError(error)) {
                await handleSignedOut();
                return;
            }
            setStatus(state.fetchedAt ? `Offline – Stand ${formatTime(state.fetchedAt)}` : 'Keine Verbindung');
        } finally {
            state.refreshing = false;
        }
    }

    function isAuthError(error) {
        const status = Number(error?.status || error?.code);
        return status === 401 || /jwt|token|not authenticated/i.test(String(error?.message || ''));
    }

    function statusLine() {
        const parts = [];
        if (state.fetchedAt) parts.push(`Stand ${formatTime(state.fetchedAt)}`);
        if (state.truncated) parts.push(`nur die ersten ${MAX_ITEMS} Einträge`);
        return parts.join(' · ');
    }

    async function markUsed(table, id) {
        if (!state.user) return;
        try {
            const { error } = await client.from(table)
                .update({ last_used_at: new Date().toISOString() })
                .eq('id', id).eq('user_id', state.user.id);
            if (error) console.warn('last_used_at konnte nicht gesetzt werden.', error.message);
        } catch (error) {
            console.warn('last_used_at konnte nicht gesetzt werden.', error?.message);
        }
    }

    // ---------- Kopieren ----------

    async function copyItem(item) {
        if (!item) return;
        const isPrompt = state.tab === 'prompts';
        const text = isPrompt ? contract.promptToText(item) : contract.snippetToText(item);
        if (!text.trim()) {
            showToast(isPrompt ? 'Prompt ist leer' : 'Baustein ist leer', 'error');
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
        } catch (error) {
            console.warn('Kopieren fehlgeschlagen.', error?.message);
            showToast('Kopieren fehlgeschlagen', 'error');
            return;
        }
        showToast(isPrompt ? 'Prompt kopiert' : 'Baustein kopiert', 'success');
        item.last_used_at = new Date().toISOString();
        const list = currentList();
        list.sort(contract.compareLibraryOrder);
        buildIndex();
        state.activeId = item.id;
        renderList();
        writeCache();
        markUsed(isPrompt ? 'library' : 'snippets', item.id);
    }

    // ---------- Rendern ----------

    function renderView() {
        const loggedIn = !!state.user;
        el.viewLogin.hidden = loggedIn;
        el.viewLibrary.hidden = !loggedIn;
        el.logoutBtn.hidden = !loggedIn;
        if (loggedIn) {
            renderTabs();
            renderList();
            el.search.focus();
        } else {
            el.loginEmail.focus();
        }
    }

    function renderTabs() {
        el.tabs.forEach(tab => {
            const selected = tab.dataset.tab === state.tab;
            tab.setAttribute('aria-selected', selected ? 'true' : 'false');
            tab.tabIndex = selected ? 0 : -1;
        });
    }

    function visibleItems() {
        const indexed = state.indexed[state.tab] || [];
        const query = state.query.trim();
        const matches = query
            ? indexed.filter(entry => contract.matchesSearch(entry.tokens, query))
            : indexed;
        return matches.slice(0, MAX_RENDERED).map(entry => entry.item);
    }

    function badgeFor(item) {
        if (state.tab === 'prompts') {
            return {
                category: item.category ? String(item.category) : '',
                type: item.prompt_type === 'free' ? 'Frei' : 'Strukturiert'
            };
        }
        return { category: '', type: FIELD_LABELS[item.field_id] || 'Baustein' };
    }

    function previewFor(item) {
        if (state.tab === 'prompts') {
            return firstLine(item.description) || firstLine(contract.promptToText(item)) || '';
        }
        return firstLine(item.content);
    }

    function renderList() {
        state.visible = visibleItems();
        el.list.replaceChildren();
        const total = currentList().length;
        if (!total) {
            el.empty.replaceChildren();
            el.empty.append(state.tab === 'prompts'
                ? 'Noch keine Prompts. Lege sie im Promptomizer an. '
                : 'Noch keine Bausteine. Lege sie im Promptomizer an. ');
            const link = document.createElement('a');
            link.href = 'https://www.promptomizer.de/app';
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = 'Zur App';
            el.empty.append(link);
            el.empty.hidden = false;
            return;
        }
        if (!state.visible.length) {
            el.empty.textContent = `Nichts gefunden für „${state.query.trim()}“`;
            el.empty.hidden = false;
            return;
        }
        el.empty.hidden = true;

        if (!state.visible.some(item => item.id === state.activeId)) state.activeId = null;

        const fragment = document.createDocumentFragment();
        state.visible.forEach(item => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'px-item';
            row.setAttribute('role', 'option');
            row.dataset.id = String(item.id);
            row.id = `item-${state.tab}-${item.id}`;
            const active = item.id === state.activeId;
            row.setAttribute('aria-selected', active ? 'true' : 'false');
            if (active) row.classList.add('active');

            const head = document.createElement('div');
            head.className = 'px-item-head';
            if (item.is_favorite) {
                const star = document.createElement('span');
                star.className = 'px-star';
                star.textContent = '★';
                star.setAttribute('aria-label', 'Favorit');
                head.append(star);
            }
            const name = document.createElement('span');
            name.className = 'px-item-name';
            name.textContent = item.name || 'Ohne Namen';
            head.append(name);

            const badges = badgeFor(item);
            if (badges.category) {
                const cat = document.createElement('span');
                cat.className = 'px-badge px-badge-sky';
                cat.textContent = badges.category;
                head.append(cat);
            }
            const type = document.createElement('span');
            type.className = 'px-badge';
            type.textContent = badges.type;
            head.append(type);
            row.append(head);

            const preview = previewFor(item);
            if (preview) {
                const line = document.createElement('div');
                line.className = 'px-item-preview';
                line.textContent = preview;
                row.append(line);
            }

            row.addEventListener('click', () => copyItem(item));
            fragment.append(row);
        });
        el.list.append(fragment);
        syncActiveDescendant();
    }

    function syncActiveDescendant() {
        const activeRow = state.activeId === null ? null : el.list.querySelector(`[data-id="${state.activeId}"]`);
        if (activeRow) {
            el.search.setAttribute('aria-activedescendant', activeRow.id);
            activeRow.scrollIntoView?.({ block: 'nearest' });
        } else {
            el.search.removeAttribute('aria-activedescendant');
        }
    }

    function moveActive(delta) {
        if (!state.visible.length) return;
        const index = state.visible.findIndex(item => item.id === state.activeId);
        let next = index + delta;
        if (index === -1) next = delta > 0 ? 0 : state.visible.length - 1;
        next = Math.max(0, Math.min(state.visible.length - 1, next));
        state.activeId = state.visible[next].id;
        el.list.querySelectorAll('.px-item').forEach(row => {
            const active = row.dataset.id === String(state.activeId);
            row.classList.toggle('active', active);
            row.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        syncActiveDescendant();
    }

    function setTab(tab) {
        if (tab !== 'prompts' && tab !== 'snippets') return;
        if (state.tab === tab) return;
        state.tab = tab;
        state.activeId = null;
        renderTabs();
        renderList();
        writeUiPrefs();
        el.search.focus();
    }

    // ---------- Auth ----------

    function loginErrorMessage(error) {
        const message = String(error?.message || '');
        if (/invalid login credentials/i.test(message)) return 'E-Mail oder Passwort falsch.';
        if (/email not confirmed/i.test(message)) return 'Bitte zuerst die E-Mail-Adresse bestätigen.';
        if (/failed to fetch|network/i.test(message)) return 'Keine Verbindung zum Server.';
        return 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.';
    }

    async function handleLogin(event) {
        event.preventDefault();
        const email = el.loginEmail.value.trim();
        const password = el.loginPassword.value;
        el.loginError.hidden = true;
        if (!email || !password) {
            el.loginError.textContent = 'Bitte E-Mail und Passwort eingeben.';
            el.loginError.hidden = false;
            return;
        }
        el.loginSubmit.disabled = true;
        try {
            const { data, error } = await client.auth.signInWithPassword({ email, password });
            if (error) throw error;
            state.user = data?.user || null;
            el.loginPassword.value = '';
            state.prompts = [];
            state.snippets = [];
            state.fetchedAt = null;
            state.truncated = false;
            buildIndex();
            renderView();
            await refreshFromServer();
        } catch (error) {
            console.warn('Anmeldung fehlgeschlagen.', error?.message);
            el.loginError.textContent = loginErrorMessage(error);
            el.loginError.hidden = false;
        } finally {
            el.loginSubmit.disabled = false;
        }
    }

    async function handleLogout() {
        // scope 'local': nur diese Sitzung beenden, die Web-App bleibt angemeldet.
        try { await client.auth.signOut({ scope: 'local' }); } catch (_) { }
        await handleSignedOut();
    }

    async function handleSignedOut() {
        state.user = null;
        state.prompts = [];
        state.snippets = [];
        state.fetchedAt = null;
        state.truncated = false;
        state.activeId = null;
        buildIndex();
        await clearCache();
        setStatus('');
        renderView();
    }

    // ---------- Tastatur ----------

    function onKeydown(event) {
        if (!state.user) return;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            moveActive(1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            moveActive(-1);
        } else if (event.key === 'Enter') {
            if (event.target !== el.search && !el.list.contains(event.target)) return;
            event.preventDefault();
            const item = state.visible.find(entry => entry.id === state.activeId) || state.visible[0];
            copyItem(item);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            if (state.query) {
                el.search.value = '';
                state.query = '';
                state.activeId = null;
                renderList();
            } else {
                window.close();
            }
        }
    }

    function onTabKeydown(event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        setTab(state.tab === 'prompts' ? 'snippets' : 'prompts');
        el.tabs.find(tab => tab.dataset.tab === state.tab)?.focus();
    }

    // ---------- Start ----------

    async function init() {
        el.loginForm.addEventListener('submit', handleLogin);
        el.logoutBtn.addEventListener('click', handleLogout);
        el.tabs.forEach(tab => {
            tab.addEventListener('click', () => setTab(tab.dataset.tab));
            tab.addEventListener('keydown', onTabKeydown);
        });
        el.search.addEventListener('input', () => {
            state.query = el.search.value;
            state.activeId = null;
            renderList();
        });
        document.addEventListener('keydown', onKeydown);

        client.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT' && state.user) handleSignedOut();
        });

        const [cache, , sessionResult] = await Promise.all([
            readCache(),
            readUiPrefs(),
            client.auth.getSession().catch(() => ({ data: { session: null } }))
        ]);
        const session = sessionResult?.data?.session || null;
        state.user = session?.user || null;

        if (state.user && cache && cache.userId === state.user.id) {
            applyCache(cache);
            setStatus(statusLine());
        } else if (cache) {
            await clearCache();
        }

        renderView();
        if (state.user) refreshFromServer();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
