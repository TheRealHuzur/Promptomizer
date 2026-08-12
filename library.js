(function () {
    'use strict';

    const PAGE_SIZE = 24;
    const VIEW_KEY = 'promptomizer_library_view';
    const CONTENT_KEY = 'promptomizer_library_content';
    const state = {
        initialized: false,
        loading: false,
        items: [],
        categories: [],
        counts: { categories: {}, archived: 0, favorites: 0 },
        total: 0,
        hasMore: false,
        offset: 0,
        search: '',
        promptType: '',
        sort: 'default',
        categoryId: null,
        uncategorized: false,
        favoriteOnly: false,
        archived: false,
        activeSection: 'all',
        viewMode: localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'cards',
        tier: 'free',
        selectionMode: false,
        selected: new Set(),
        editPromptId: null,
        descriptionTimer: null
    };

    const librarySelect = 'id, user_id, name, fields, created_at, category, category_id, description, is_favorite, last_used_at, archived_at, prompt_type, current_version, updated_at';
    const db = window.db;
    const client = () => db?.getClient?.();

    function prefixSearchQuery(value) {
        return String(value || '')
            .match(/[\p{L}\p{N}]+/gu)
            ?.map(term => `${term.toLocaleLowerCase('de-DE')}:*`)
            .join(' & ') || '';
    }

    function isPromptArea() {
        return document.getElementById('view-library')?.dataset.contentType !== 'snippets';
    }

    function track(name, data = {}) {
        try {
            if (window.umami?.track) window.umami.track(name, data);
        } catch (_) { }
    }

    function formatDate(value) {
        if (!value) return 'Noch nicht verwendet';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '–';
        return new Intl.DateTimeFormat('de-DE', {
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(date);
    }

    function cleanText(value) {
        return String(value || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/[#*_`>\[\](){}]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function structuredValues(prompt) {
        const result = { role: '', context: '', task: '', format: '' };
        const fields = prompt?.fields;
        const order = ['role', 'context', 'task', 'style', 'format'];
        if (Array.isArray(fields)) {
            fields.forEach((value, index) => {
                const key = order[index];
                if (Object.prototype.hasOwnProperty.call(result, key)) result[key] = value || '';
            });
        } else if (fields && typeof fields === 'object') {
            const source = fields.mode === 'structured' ? fields.fields : fields;
            if (Array.isArray(source)) {
                source.forEach((value, index) => {
                    const key = order[index];
                    if (Object.prototype.hasOwnProperty.call(result, key)) result[key] = value || '';
                });
            } else if (source && typeof source === 'object') {
                Object.keys(result).forEach(key => { result[key] = source[key] || ''; });
            }
        }
        return result;
    }

    function promptToText(prompt) {
        if (!prompt) return '';
        if (prompt.prompt_type === 'free' || prompt.fields?.mode === 'free' || typeof prompt.fields?.text === 'string') {
            return String(prompt.fields?.text || '');
        }
        const values = structuredValues(prompt);
        const labels = {
            role: 'ROLLE & FUNKTION',
            context: 'KONTEXT',
            task: 'AUFGABE',
            format: 'AUSGABEFORMAT'
        };
        return Object.keys(labels)
            .filter(key => String(values[key] || '').trim())
            .map(key => `**${labels[key]}**\n${String(values[key]).trim()}`)
            .join('\n\n');
    }

    function previewFor(prompt) {
        return cleanText(prompt.description) || cleanText(promptToText(prompt)) || 'Noch keine Vorschau vorhanden.';
    }


    function downloadFile(filename, content, mime) {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function safeFilename(name) {
        return cleanText(name).toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-|-$/g, '') || 'prompt';
    }

    let confirmationResolver = null;

    function resolveConfirmation(accepted) {
        const modal = document.getElementById('library-confirm-modal');
        modal?.classList.add('hidden');
        const resolver = confirmationResolver;
        confirmationResolver = null;
        resolver?.(accepted);
    }

    function ensureConfirmationModal() {
        let modal = document.getElementById('library-confirm-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'library-confirm-modal';
        modal.className = 'ui-backdrop z-[140] hidden';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'library-confirm-title');
        modal.setAttribute('aria-describedby', 'library-confirm-message');
        modal.innerHTML = `
            <div class="ui-modal ui-modal-sm">
                <h3 id="library-confirm-title" class="ui-modal-title mb-2"></h3>
                <p id="library-confirm-message" class="text-sm text-slate-400 mb-5"></p>
                <div class="ui-actions">
                    <button id="library-confirm-cancel" type="button" class="ui-btn ui-btn-ghost">Abbrechen</button>
                    <button id="library-confirm-accept" type="button" class="ui-btn ui-btn-danger">Löschen</button>
                </div>
            </div>`;
        modal.querySelector('#library-confirm-cancel').addEventListener('click', () => resolveConfirmation(false));
        modal.querySelector('#library-confirm-accept').addEventListener('click', () => resolveConfirmation(true));
        modal.addEventListener('click', event => {
            if (event.target === modal) resolveConfirmation(false);
        });
        modal.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                resolveConfirmation(false);
            }
        });
        document.body.append(modal);
        return modal;
    }

    function askConfirmation(title, message, confirmLabel = 'Löschen') {
        if (confirmationResolver) resolveConfirmation(false);
        const modal = ensureConfirmationModal();
        modal.querySelector('#library-confirm-title').textContent = title;
        modal.querySelector('#library-confirm-message').textContent = message;
        modal.querySelector('#library-confirm-accept').textContent = confirmLabel;
        modal.classList.remove('hidden');
        return new Promise(resolve => {
            confirmationResolver = resolve;
            requestAnimationFrame(() => modal.querySelector('#library-confirm-cancel')?.focus());
        });
    }

    Object.assign(db, {
        async getScenarios() {
            if (!window.currentUser || !client()) return [];
            const { data, error } = await client()
                .from('library')
                .select(librarySelect)
                .eq('user_id', window.currentUser.id)
                .is('archived_at', null)
                .order('created_at', { ascending: false });
            if (error) {
                console.error('Library Fetch Error:', error);
                return [];
            }
            return data || [];
        },

        async getScenarioById(id) {
            if (!window.currentUser || !client()) return null;
            const { data, error } = await client()
                .from('library')
                .select(librarySelect)
                .eq('id', id)
                .eq('user_id', window.currentUser.id)
                .maybeSingle();
            if (error) console.error('Library Prompt Fetch Error:', error);
            return error ? null : data;
        },

        async getLibraryPrompts(options = {}) {
            if (!window.currentUser || !client()) {
                return { success: false, reason: 'NOT_LOGGED_IN', items: [], total: 0, hasMore: false };
            }
            const offset = Math.max(0, Number(options.offset) || 0);
            const limit = Math.min(50, Math.max(1, Number(options.limit) || PAGE_SIZE));
            let query = client()
                .from('library')
                .select(librarySelect, { count: 'exact' })
                .eq('user_id', window.currentUser.id);

            query = options.archived
                ? query.not('archived_at', 'is', null)
                : query.is('archived_at', null);

            const search = prefixSearchQuery(options.search);
            if (search) query = query.textSearch('search_vector', search, { config: 'simple' });
            if (options.uncategorized) query = query.is('category_id', null);
            else if (options.categoryId !== null && options.categoryId !== undefined && options.categoryId !== '') {
                query = query.eq('category_id', Number(options.categoryId));
            }
            if (options.promptType === 'free' || options.promptType === 'structured') query = query.eq('prompt_type', options.promptType);
            if (options.favoriteOnly) query = query.eq('is_favorite', true);

            if (options.sort === 'name') query = query.order('name').order('id');
            else if (options.sort === 'created') query = query.order('created_at', { ascending: false }).order('id', { ascending: false });
            else if (options.sort === 'updated') query = query.order('updated_at', { ascending: false }).order('id', { ascending: false });
            else if (options.sort === 'used') {
                query = query.order('last_used_at', { ascending: false, nullsFirst: false })
                    .order('updated_at', { ascending: false })
                    .order('id', { ascending: false });
            } else {
                query = query.order('is_favorite', { ascending: false })
                    .order('last_used_at', { ascending: false, nullsFirst: false })
                    .order('updated_at', { ascending: false })
                    .order('id', { ascending: false });
            }

            const { data, error, count } = await query.range(offset, offset + limit - 1);
            if (error) {
                console.error('Library Query Error:', error);
                return { success: false, reason: 'ERROR', items: [], total: 0, hasMore: false };
            }
            const items = data || [];
            return { success: true, items, total: count || 0, hasMore: offset + items.length < (count || 0) };
        },

        async getLibraryCategoryCounts() {
            if (!window.currentUser || !client()) return { categories: {}, archived: 0, favorites: 0 };
            const [categoryResult, archiveResult, favoriteResult] = await Promise.all([
                client().rpc('get_library_category_counts'),
                client().from('library').select('*', { count: 'exact', head: true })
                    .eq('user_id', window.currentUser.id).not('archived_at', 'is', null),
                client().from('library').select('*', { count: 'exact', head: true })
                    .eq('user_id', window.currentUser.id).is('archived_at', null).eq('is_favorite', true)
            ]);
            if (categoryResult.error || archiveResult.error || favoriteResult.error) {
                console.error('Library Counts Error:', categoryResult.error || archiveResult.error || favoriteResult.error);
                return { categories: {}, archived: 0, favorites: 0 };
            }
            const categories = {};
            (categoryResult.data || []).forEach(row => {
                categories[row.category_id === null ? 'uncategorized' : String(row.category_id)] = Number(row.prompt_count) || 0;
            });
            return { categories, archived: archiveResult.count || 0, favorites: favoriteResult.count || 0 };
        },

        async updateScenarioMetadata(id, patch = {}) {
            if (!window.currentUser || !client()) return { success: false, reason: 'NOT_LOGGED_IN' };
            const values = {};
            if (Object.prototype.hasOwnProperty.call(patch, 'description')) values.description = String(patch.description || '').trim() || null;
            if (Object.prototype.hasOwnProperty.call(patch, 'categoryId')) values.category_id = patch.categoryId === null || patch.categoryId === '' ? null : Number(patch.categoryId);
            if (Object.prototype.hasOwnProperty.call(patch, 'isFavorite')) values.is_favorite = Boolean(patch.isFavorite);
            if (Object.prototype.hasOwnProperty.call(patch, 'archivedAt')) values.archived_at = patch.archivedAt || null;
            if (!Object.keys(values).length) return { success: false, reason: 'EMPTY_PATCH' };

            const { data, error } = await client().from('library').update(values)
                .eq('id', id).eq('user_id', window.currentUser.id)
                .select(librarySelect);
            if (error || !data || data.length !== 1) {
                console.error('Library Metadata Update Error:', error || { id });
                return { success: false, reason: 'ERROR' };
            }
            return { success: true, scenario: data[0] };
        },

        async markScenarioUsed(id) {
            if (!window.currentUser || !client()) return false;
            const { error } = await client().from('library')
                .update({ last_used_at: new Date().toISOString() })
                .eq('id', id).eq('user_id', window.currentUser.id);
            if (error) console.error('Library Last Used Error:', error);
            return !error;
        },

        async duplicateScenario(id) {
            if (!window.currentUser || !client()) return { success: false, reason: 'NOT_LOGGED_IN' };
            const { data, error } = await client().rpc('duplicate_library_prompt', { p_prompt_id: id });
            if (error) {
                console.error('Library Duplicate Error:', error);
                if (error.message?.includes('FREE_LIMIT_REACHED')) return { success: false, reason: 'FREE_LIMIT_REACHED' };
                return { success: false, reason: 'ERROR' };
            }
            return { success: true, scenario: Array.isArray(data) ? data[0] : data };
        },

        async bulkManageScenarios(ids, action, categoryId = null) {
            if (!window.currentUser || !client()) return { success: false, reason: 'NOT_LOGGED_IN' };
            const promptIds = [...new Set((ids || []).map(Number).filter(Number.isFinite))];
            const { data, error } = await client().rpc('bulk_manage_library_prompts', {
                p_prompt_ids: promptIds,
                p_action: action,
                p_category_id: categoryId === null || categoryId === '' ? null : Number(categoryId)
            });
            if (error) {
                console.error('Library Bulk Action Error:', error);
                return { success: false, reason: error.message?.includes('PRO_REQUIRED') ? 'PRO_REQUIRED' : 'ERROR' };
            }
            return { success: true, count: Number(data) || 0 };
        }
    });

    function createNavItem() {
        if (document.getElementById('nav-library')) return;
        const history = Array.from(document.querySelectorAll('.nav-item'))
            .find(item => item.getAttribute('onclick')?.includes("switchView('history')"));
        if (!history?.parentElement) return;

        const editor = Array.from(document.querySelectorAll('.nav-item'))
            .find(item => {
                const handler = item.getAttribute('onclick') || '';
                return handler.includes('openEditorFromNavigation') || handler.includes("switchView('editor')");
            });
        const settings = Array.from(document.querySelectorAll('.nav-item'))
            .find(item => item.getAttribute('onclick')?.includes('toggleSettingsMenu'));
        if (editor) editor.dataset.appView = 'editor';
        history.dataset.appView = 'history';
        if (settings) settings.dataset.appView = 'settings';

        const item = document.createElement('div');
        item.id = 'nav-library';
        item.dataset.appView = 'library';
        item.className = 'nav-item group relative flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer text-slate-500 hover:text-slate-200 hover:bg-slate-800/50 transition-all';
        item.innerHTML = '<span class="nav-indicator absolute left-0 top-0 bottom-0 w-[3px] bg-brand-sky"></span><i class="fa-solid fa-table-cells-large w-5 text-center group-hover:text-brand-sky transition-colors"></i><span class="nav-label text-sm font-medium">Bibliothek</span>';
        item.addEventListener('click', () => window.switchView('library'));
        history.parentElement.insertBefore(item, history);
    }

    function createView() {
        if (document.getElementById('view-library')) return;
        const main = document.getElementById('main-scroll-area');
        const history = document.getElementById('view-history');
        if (!main || !history) return;

        const view = document.createElement('div');
        view.id = 'view-library';
        view.className = 'hidden library-view fade-in';
        view.innerHTML = `
            <div class="library-hero">
                <h2 class="library-title">Prompt-Bibliothek</h2>
                <div class="library-hero-actions">
                    <div class="library-content-toggle" aria-label="Bibliotheksbereich wählen">
                        <button id="library-content-prompts" type="button">Prompts</button>
                        <button id="library-content-snippets" type="button">Bausteine</button>
                    </div>
                    <div class="library-view-toggle" aria-label="Darstellung wählen">
                        <button id="library-view-cards" type="button" title="Kartenansicht" aria-label="Kartenansicht"><i class="fa-solid fa-table-cells-large"></i></button>
                        <button id="library-view-list" type="button" title="Listenansicht" aria-label="Listenansicht"><i class="fa-solid fa-list"></i></button>
                    </div>
                </div>
            </div>
            <div class="library-toolbar">
                <label class="library-control">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input id="library-search" class="library-input" type="search" placeholder="Prompts durchsuchen …" autocomplete="off" />
                </label>
                <select id="library-type" class="library-select" aria-label="Prompt-Typ filtern">
                    <option value="">Alle Prompt-Typen</option>
                    <option value="structured">Strukturiert</option>
                    <option value="free">Frei</option>
                </select>
                <select id="library-sort" class="library-select" aria-label="Prompts sortieren">
                    <option value="default">Favoriten & Nutzung</option>
                    <option value="used">Zuletzt verwendet</option>
                    <option value="updated">Zuletzt geändert</option>
                    <option value="name">Name A–Z</option>
                    <option value="created">Erstellungsdatum</option>
                </select>
                <button id="library-selection-toggle" class="library-selection-button" type="button"><i class="fa-solid fa-check-double"></i><span>Auswählen</span></button>
            </div>
            <div class="library-layout">
                <aside class="library-categories">
                    <div class="library-side-label">Ansichten</div>
                    <div id="library-static-filters"></div>
                    <div class="library-side-divider"></div>
                    <div class="library-side-label">Kategorien</div>
                    <div id="library-category-list"></div>
                    <button id="library-add-category" class="library-add-category" type="button"><i class="fa-solid fa-plus"></i> Kategorie anlegen</button>
                </aside>
                <section id="library-results" aria-live="polite">
                    <div class="library-results-head">
                        <div id="library-result-count" class="library-result-count"></div>
                    </div>
                    <div id="library-bulk-bar"></div>
                    <div id="library-content"></div>
                    <button id="library-load-more" class="library-load-more hidden" type="button">Mehr laden</button>
                </section>
            </div>`;
        main.insertBefore(view, history);
    }

    function setActiveNavigation(viewId) {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active-nav');
            item.classList.add('text-slate-500', 'border-transparent');
        });
        const active = document.querySelector(`.nav-item[data-app-view="${viewId}"]`);
        if (active) {
            active.classList.remove('text-slate-500', 'border-transparent');
            active.classList.add('active-nav');
        }
    }

    function setFooterContentType(contentType) {
        const action = document.getElementById('library-create-content');
        if (!action) return;
        action.dataset.contentType = contentType === 'snippets' ? 'snippets' : 'prompts';
        const label = action.querySelector('span');
        if (label) label.textContent = contentType === 'snippets' ? 'Neuer Baustein' : 'Neuer Prompt';
    }

    function configureFooter(viewId) {
        const isLibrary = viewId === 'library';
        document.getElementById('footer-save-wrap')?.classList.toggle('hidden', viewId !== 'editor');
        document.getElementById('btn-reset')?.classList.toggle('hidden', isLibrary);
        document.getElementById('btn-copy')?.classList.toggle('hidden', isLibrary);
        document.getElementById('library-create-content')?.classList.toggle('hidden', !isLibrary);
        if (isLibrary) {
            const type = document.getElementById('view-library')?.dataset.contentType || 'prompts';
            setFooterContentType(type);
        }
    }

    function patchViewSwitching() {
        if (!window.switchView || window.switchView.__libraryPatched) return;
        const original = window.switchView;
        const wrapped = function (viewId) {
            if (viewId !== 'library') document.getElementById('view-library')?.classList.add('hidden');
            original(viewId);
            const modeToggle = document.getElementById('mode-toggle-container');
            const editorFooter = document.getElementById('editor-footer');
            if (modeToggle) modeToggle.classList.toggle('hidden', viewId === 'library');
            if (editorFooter) editorFooter.classList.toggle('hidden', viewId !== 'editor' && viewId !== 'library');
            configureFooter(viewId);
            setActiveNavigation(viewId);
            if (viewId === 'library') openLibrary();
        };
        wrapped.__libraryPatched = true;
        window.switchView = wrapped;
    }

    function bindControls() {
        let searchTimer = null;
        document.getElementById('library-search')?.addEventListener('input', event => {
            if (!isPromptArea()) return;
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                state.search = event.target.value || '';
                track('library_search', { active: Boolean(state.search.trim()) });
                reloadItems();
            }, 250);
        });
        document.getElementById('library-type')?.addEventListener('change', event => {
            if (!isPromptArea()) return;
            state.promptType = event.target.value;
            track('library_filter_type', { type: state.promptType || 'all' });
            reloadItems();
        });
        document.getElementById('library-sort')?.addEventListener('change', event => {
            if (!isPromptArea()) return;
            state.sort = event.target.value;
            track('library_sort', { sort: state.sort });
            reloadItems();
        });
        document.getElementById('library-view-cards')?.addEventListener('click', () => { if (isPromptArea()) setViewMode('cards'); });
        document.getElementById('library-view-list')?.addEventListener('click', () => { if (isPromptArea()) setViewMode('list'); });
        document.getElementById('library-load-more')?.addEventListener('click', () => { if (isPromptArea()) loadItems(false); });
        document.getElementById('library-add-category')?.addEventListener('click', () => {
            if (!isPromptArea()) return;
            if (window.openPromptCategoryModal) window.openPromptCategoryModal();
        });
        document.getElementById('library-selection-toggle')?.addEventListener('click', () => { if (isPromptArea()) toggleSelectionMode(); });
        document.getElementById('library-content-prompts')?.addEventListener('click', () => {
            localStorage.setItem(CONTENT_KEY, 'prompts');
            openPrompts();
        });
        document.getElementById('library-content-snippets')?.addEventListener('click', () => {
            localStorage.setItem(CONTENT_KEY, 'snippets');
            window.SnippetLibrary?.open();
        });
        document.getElementById('library-create-content')?.addEventListener('click', () => {
            if (document.getElementById('view-library')?.classList.contains('hidden')) return;
            if (!window.currentUser) return window.openAuthModal?.();
            if (isPromptArea()) renderCreatePrompt();
            else window.SnippetLibrary?.openCreate?.();
        });
    }

    function setViewMode(mode) {
        state.viewMode = mode === 'list' ? 'list' : 'cards';
        localStorage.setItem(VIEW_KEY, state.viewMode);
        renderViewToggle();
        renderItems();
        track('library_view_mode', { mode: state.viewMode });
    }

    function renderViewToggle() {
        document.getElementById('library-view-cards')?.classList.toggle('is-active', state.viewMode === 'cards');
        document.getElementById('library-view-list')?.classList.toggle('is-active', state.viewMode === 'list');
    }

    function resetFilters(section) {
        state.categoryId = null;
        state.uncategorized = false;
        state.favoriteOnly = false;
        state.archived = false;
        state.activeSection = section;
    }

    function chooseSection(section, categoryId = null) {
        resetFilters(section);
        if (section === 'favorites') state.favoriteOnly = true;
        if (section === 'recent') state.sort = 'used';
        if (section === 'uncategorized') state.uncategorized = true;
        if (section === 'category') state.categoryId = categoryId;
        if (section === 'archive') state.archived = true;
        const sort = document.getElementById('library-sort');
        if (sort) sort.value = state.sort;
        renderCategories();
        track('library_filter_section', { section });
        reloadItems();
    }

    function categoryButton(label, icon, count, section, categoryId = null) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'library-category-button';
        const isActive = state.activeSection === section && (section !== 'category' || String(state.categoryId) === String(categoryId));
        button.classList.toggle('is-active', isActive);
        const iconEl = document.createElement('i');
        iconEl.className = `fa-solid ${icon}`;
        iconEl.style.width = '1.25rem';
        const name = document.createElement('span');
        name.className = 'library-category-name';
        name.textContent = label;
        const badge = document.createElement('span');
        badge.className = 'library-count';
        badge.textContent = String(count || 0);
        button.append(iconEl, name, badge);
        button.addEventListener('click', () => chooseSection(section, categoryId));
        return button;
    }

    function renderCategories() {
        if (!isPromptArea()) return;
        const staticWrap = document.getElementById('library-static-filters');
        const categoryWrap = document.getElementById('library-category-list');
        if (!staticWrap || !categoryWrap) return;
        staticWrap.replaceChildren();
        categoryWrap.replaceChildren();
        const allCount = Object.values(state.counts.categories).reduce((sum, value) => sum + Number(value || 0), 0);
        staticWrap.append(
            categoryButton('Alle Prompts', 'fa-layer-group', allCount, 'all'),
            categoryButton('Favoriten', 'fa-star', state.counts.favorites || 0, 'favorites'),
            categoryButton('Zuletzt verwendet', 'fa-clock-rotate-left', allCount, 'recent'),
            categoryButton('Ohne Kategorie', 'fa-folder-open', state.counts.categories.uncategorized || 0, 'uncategorized')
        );

        state.categories.forEach(category => {
            categoryWrap.append(
                categoryButton(category.name, 'fa-folder', state.counts.categories[String(category.id)] || 0, 'category', category.id)
            );
        });
        const divider = document.createElement('div');
        divider.className = 'library-side-divider';
        categoryWrap.append(divider, categoryButton('Archiv', 'fa-box-archive', state.counts.archived || 0, 'archive'));
    }

    async function loadContext() {
        if (!window.currentUser) {
            state.categories = [];
            state.counts = { categories: {}, archived: 0, favorites: 0 };
            state.tier = 'free';
            renderCategories();
            return;
        }
        const [categories, counts, tier] = await Promise.all([
            db.getPromptCategories?.() || [],
            db.getLibraryCategoryCounts(),
            db.getUserTier?.() || 'free'
        ]);
        state.categories = categories || [];
        state.counts = counts || { categories: {}, archived: 0 };
        state.tier = tier || 'free';
        renderCategories();
        renderSelectionButton();
    }

    function currentQuery() {
        return {
            search: state.search,
            promptType: state.promptType,
            sort: state.sort,
            categoryId: state.categoryId,
            uncategorized: state.uncategorized,
            favoriteOnly: state.favoriteOnly,
            archived: state.archived,
            offset: state.offset,
            limit: PAGE_SIZE
        };
    }

    async function loadItems(reset = true) {
        if (state.loading) return;
        state.loading = true;
        if (reset) {
            state.offset = 0;
            state.items = [];
            renderLoading();
        }

        if (!window.currentUser) {
            state.loading = false;
            renderSignedOut();
            return;
        }

        const result = await db.getLibraryPrompts(currentQuery());
        state.loading = false;
        if (!result.success) {
            renderError();
            return;
        }
        state.items = reset ? result.items : [...state.items, ...result.items];
        state.total = result.total;
        state.hasMore = result.hasMore;
        state.offset = state.items.length;
        renderItems();
    }

    async function reloadItems() {
        state.selected.clear();
        await Promise.all([loadContext(), loadItems(true)]);
    }

    function renderLoading() {
        if (!isPromptArea()) return;
        const content = document.getElementById('library-content');
        if (!content) return;
        content.innerHTML = '<div class="library-empty"><div class="library-empty-icon"><i class="fa-solid fa-circle-notch fa-spin"></i></div><div>Bibliothek wird geladen …</div></div>';
        document.getElementById('library-load-more')?.classList.add('hidden');
    }

    function renderSignedOut() {
        if (!isPromptArea()) return;
        const content = document.getElementById('library-content');
        if (!content) return;
        content.innerHTML = '<div class="library-empty"><div class="library-empty-icon"><i class="fa-solid fa-lock"></i></div><strong style="color:#e2e8f0;margin-bottom:.35rem">Deine Bibliothek wartet auf dich</strong><div>Melde dich an, um gespeicherte Prompts zu sehen.</div><button id="library-login" class="library-load-more" type="button">Jetzt anmelden</button></div>';
        document.getElementById('library-login')?.addEventListener('click', () => window.openAuthModal?.());
    }

    function renderError() {
        if (!isPromptArea()) return;
        const content = document.getElementById('library-content');
        if (!content) return;
        content.innerHTML = '<div class="library-empty"><div class="library-empty-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><strong style="color:#e2e8f0;margin-bottom:.35rem">Bibliothek konnte nicht geladen werden</strong><div>Bitte versuche es erneut.</div><button id="library-retry" class="library-load-more" type="button">Erneut laden</button></div>';
        document.getElementById('library-retry')?.addEventListener('click', reloadItems);
    }

    function emptyCopy() {
        if (state.search.trim()) return ['Keine passenden Prompts', 'Versuche einen anderen Suchbegriff oder entferne Filter.', 'fa-magnifying-glass'];
        if (state.archived) return ['Das Archiv ist leer', 'Archivierte Prompts erscheinen an dieser Stelle.', 'fa-box-archive'];
        if (state.favoriteOnly) return ['Noch keine Favoriten', 'Markiere wichtige Prompts über den Stern auf der Karte.', 'fa-star'];
        return ['Noch keine Prompts', 'Erstelle im Editor deinen ersten Prompt und speichere ihn in der Bibliothek.', 'fa-layer-group'];
    }

    function renderItems() {
        if (!isPromptArea()) return;
        const content = document.getElementById('library-content');
        const count = document.getElementById('library-result-count');
        const more = document.getElementById('library-load-more');
        if (!content || !count || !more) return;
        renderViewToggle();
        renderBulkBar();
        content.classList.toggle('library-selection-mode', state.selectionMode);
        count.textContent = `${state.total} ${state.total === 1 ? 'Prompt' : 'Prompts'}`;
        more.classList.toggle('hidden', !state.hasMore);
        if (!state.items.length) {
            const [title, description, icon] = emptyCopy();
            content.innerHTML = `<div class="library-empty"><div class="library-empty-icon"><i class="fa-solid ${icon}"></i></div><strong style="color:#e2e8f0;margin-bottom:.35rem"></strong><div></div></div>`;
            content.querySelector('strong').textContent = title;
            content.querySelector('.library-empty > div:last-child').textContent = description;
            return;
        }
        content.replaceChildren();
        const wrap = document.createElement('div');
        wrap.className = state.viewMode === 'cards' ? 'library-grid' : 'library-list';
        state.items.forEach(prompt => wrap.append(state.viewMode === 'cards' ? buildCard(prompt) : buildListRow(prompt)));
        content.append(wrap);
    }

    function makeFavoriteButton(prompt, className) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.classList.toggle('is-favorite', Boolean(prompt.is_favorite));
        button.title = prompt.is_favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen';
        button.setAttribute('aria-label', button.title);
        button.setAttribute('aria-pressed', String(Boolean(prompt.is_favorite)));
        button.innerHTML = `<i class="${prompt.is_favorite ? 'fa-solid' : 'fa-regular'} fa-star"></i>`;
        button.addEventListener('click', event => toggleFavorite(event, prompt.id));
        return button;
    }

    function makeUseButton(prompt) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'library-use-button';
        button.title = 'Im Editor verwenden';
        button.setAttribute('aria-label', 'Im Editor verwenden');
        button.innerHTML = '<i class="fa-solid fa-copy"></i>';
        button.addEventListener('click', event => usePrompt(event, prompt.id));
        return button;
    }

    function attachOpenBehavior(element, prompt) {
        element.addEventListener('click', () => state.selectionMode ? toggleSelected(prompt.id) : openEdit(prompt));
        element.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                state.selectionMode ? toggleSelected(prompt.id) : openEdit(prompt);
            }
        });
    }

    function buildCard(prompt) {
        const card = document.createElement('article');
        card.className = 'library-card';
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `${prompt.name} bearbeiten`);
        card.classList.toggle('is-selected', state.selected.has(Number(prompt.id)));
        const selection = document.createElement('span');
        selection.className = 'library-card-selection';
        selection.innerHTML = '<i class="fa-solid fa-check"></i>';
        const body = document.createElement('div');
        body.className = 'library-card-body';
        const badges = document.createElement('div');
        badges.className = 'library-card-badges';
        const category = document.createElement('span');
        category.className = 'library-badge';
        category.textContent = prompt.category || 'Ohne Kategorie';
        const type = document.createElement('span');
        type.className = 'library-badge library-badge-type';
        type.textContent = prompt.prompt_type === 'free' ? 'Frei' : 'Strukturiert';
        const title = document.createElement('h3');
        title.className = 'library-card-title';
        title.textContent = prompt.name || 'Unbenannter Prompt';
        const preview = document.createElement('p');
        preview.className = 'library-card-preview';
        preview.textContent = previewFor(prompt);
        const footer = document.createElement('div');
        footer.className = 'library-card-footer';
        footer.append(makeUseButton(prompt));
        badges.append(category, type);
        body.append(badges, title, preview, footer);
        card.append(makeFavoriteButton(prompt, 'library-card-star'), selection, body);
        attachOpenBehavior(card, prompt);
        return card;
    }

    function buildListRow(prompt) {
        const row = document.createElement('div');
        row.className = 'library-list-row';
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', `${prompt.name} bearbeiten`);
        row.classList.toggle('is-selected', state.selected.has(Number(prompt.id)));
        const first = document.createElement('div');
        first.style.display = 'grid';
        first.style.placeItems = 'center';
        const selection = document.createElement('span');
        selection.className = 'library-list-selection';
        selection.innerHTML = '<i class="fa-solid fa-check"></i>';
        const star = makeFavoriteButton(prompt, 'library-card-star');
        star.style.position = 'static';
        first.append(state.selectionMode ? selection : star);
        const title = document.createElement('div');
        title.className = 'library-list-title';
        title.textContent = prompt.name || 'Unbenannter Prompt';
        const preview = document.createElement('div');
        preview.className = 'library-list-preview';
        preview.textContent = previewFor(prompt);
        const category = document.createElement('span');
        category.className = 'library-badge';
        category.textContent = prompt.category || 'Ohne Kategorie';
        const type = document.createElement('span');
        type.className = 'library-badge library-badge-type';
        type.textContent = prompt.prompt_type === 'free' ? 'Frei' : 'Strukturiert';
        row.append(first, title, preview, category, type, makeUseButton(prompt));
        attachOpenBehavior(row, prompt);
        return row;
    }

    async function toggleFavorite(event, id) {
        event.stopPropagation();
        if (state.selectionMode) return toggleSelected(id);
        const prompt = state.items.find(item => Number(item.id) === Number(id));
        if (!prompt) return;
        const previous = Boolean(prompt.is_favorite);
        prompt.is_favorite = !previous;
        renderItems();
        const result = await db.updateScenarioMetadata(id, { isFavorite: !previous });
        if (!result.success) {
            prompt.is_favorite = previous;
            renderItems();
            window.showToast?.('Favorit konnte nicht gespeichert werden.', 'error');
            return;
        }
        track('library_favorite', { favorite: !previous });
        await loadContext();
    }

    async function usePrompt(event, id) {
        event.stopPropagation();
        if (state.selectionMode) return toggleSelected(id);
        window.switchView?.('editor');
        await window.handlePromptClick?.(id);
        await db.markScenarioUsed(id);
        const prompt = state.items.find(item => Number(item.id) === Number(id));
        if (prompt) prompt.last_used_at = new Date().toISOString();
        track('library_prompt_use');
    }

    async function openEdit(prompt) {
        state.editPromptId = Number(prompt.id);
        track('library_prompt_edit');
        window.switchView?.('editor');
        await window.startPromptEditSession?.(prompt.id);
        await renderEditDetails(prompt.id);
    }

    function renderCreatePrompt() {
        if (!isPromptArea()) return;
        document.getElementById('library-bulk-bar')?.replaceChildren();
        document.getElementById('library-load-more')?.classList.add('hidden');
        const content = document.getElementById('library-content');
        const count = document.getElementById('library-result-count');
        if (!content || !count) return;

        count.textContent = 'Neuer Prompt';
        content.replaceChildren();
        const editor = document.createElement('div');
        editor.className = 'snippet-editor prompt-create-editor';
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'snippet-editor-back';
        back.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Zur Prompt-Bibliothek';
        back.addEventListener('click', renderItems);
        const title = document.createElement('h3');
        title.className = 'snippet-editor-title';
        title.textContent = 'Neuen Prompt anlegen';
        const form = document.createElement('div');
        form.className = 'snippet-editor-grid';
        const main = document.createElement('div');
        const nameLabel = document.createElement('label');
        nameLabel.className = 'ui-label';
        nameLabel.textContent = 'Name';
        const name = document.createElement('input');
        name.className = 'library-input snippet-editor-input';
        name.maxLength = 200;
        name.placeholder = 'Name des Prompts';
        const fields = document.createElement('div');
        fields.className = 'prompt-create-fields';
        main.append(nameLabel, name, fields);

        const side = document.createElement('div');
        const typeLabel = document.createElement('label');
        typeLabel.className = 'ui-label';
        typeLabel.textContent = 'Prompt-Typ';
        const type = document.createElement('select');
        type.className = 'library-edit-category';
        type.innerHTML = '<option value="structured">Strukturiert</option><option value="free">Frei</option>';
        const categoryLabel = document.createElement('label');
        categoryLabel.className = 'ui-label prompt-create-category-label';
        categoryLabel.textContent = 'Kategorie';
        const category = document.createElement('select');
        category.className = 'library-edit-category';
        category.innerHTML = '<option value="">Ohne Kategorie</option>';
        state.categories.forEach(item => {
            const option = document.createElement('option');
            option.value = item.name;
            option.textContent = item.name;
            category.append(option);
        });
        side.append(typeLabel, type, categoryLabel, category);
        form.append(main, side);

        const drafts = {
            free: '',
            structured: { role: '', context: '', task: '', format: '' }
        };
        let activeType = 'structured';
        const definitions = [
            ['role', 'Rolle & Funktion'],
            ['context', 'Kontext'],
            ['task', 'Aufgabe'],
            ['format', 'Ausgabeformat']
        ];
        const captureDraft = () => {
            if (activeType === 'free') {
                drafts.free = fields.querySelector('[data-prompt-field="free"]')?.value || '';
                return;
            }
            definitions.forEach(([key]) => {
                drafts.structured[key] = fields.querySelector(`[data-prompt-field="${key}"]`)?.value || '';
            });
        };
        const renderFields = () => {
            fields.replaceChildren();
            if (activeType === 'free') {
                const label = document.createElement('label');
                label.className = 'ui-label snippet-editor-content-label';
                label.textContent = 'Prompt-Text';
                const input = document.createElement('textarea');
                input.className = 'snippet-editor-textarea';
                input.dataset.promptField = 'free';
                input.maxLength = 50000;
                input.placeholder = 'Prompt eingeben …';
                input.value = drafts.free;
                fields.append(label, input);
                return;
            }
            definitions.forEach(([key, labelText]) => {
                const label = document.createElement('label');
                label.className = 'ui-label snippet-editor-content-label';
                label.textContent = labelText;
                const input = document.createElement('textarea');
                input.className = 'snippet-editor-textarea prompt-create-textarea';
                input.dataset.promptField = key;
                input.maxLength = 50000;
                input.value = drafts.structured[key];
                fields.append(label, input);
            });
        };
        type.addEventListener('change', () => {
            captureDraft();
            activeType = type.value === 'free' ? 'free' : 'structured';
            renderFields();
            fields.querySelector('textarea')?.focus();
        });
        renderFields();

        const actions = document.createElement('div');
        actions.className = 'library-edit-actions';
        const save = editAction('Prompt anlegen', 'fa-floppy-disk', async () => {
            const promptName = name.value.trim();
            captureDraft();
            const hasContent = activeType === 'free'
                ? Boolean(drafts.free.trim())
                : Object.values(drafts.structured).some(value => value.trim());
            if (!promptName || !hasContent) {
                window.showToast?.('Name und Prompt-Inhalt sind Pflichtfelder.', 'info');
                return;
            }
            save.disabled = true;
            const promptFields = activeType === 'free'
                ? { mode: 'free', text: drafts.free.trim() }
                : [drafts.structured.role, drafts.structured.context, drafts.structured.task, '', drafts.structured.format];
            const result = await db.saveScenario({
                name: promptName,
                category: category.value || null,
                fields: promptFields
            });
            if (!result.success) {
                save.disabled = false;
                if (result.reason === 'FREE_LIMIT_REACHED') window.openUpgradeModal?.('library_full');
                else window.showToast?.('Prompt konnte nicht angelegt werden.', 'error');
                return;
            }
            track('library_prompt_create', { prompt_type: activeType });
            window.showToast?.('Prompt wurde angelegt.', 'success');
            await Promise.all([
                reloadItems(),
                window.refreshPromptLibraryAndCategories?.(),
                window.updatePromptCounter?.()
            ]);
        });
        save.classList.add('snippet-editor-save');
        actions.append(save);
        editor.append(back, title, form, actions);
        content.append(editor);
        requestAnimationFrame(() => name.focus());
        track('library_prompt_edit', { creating: true });
    }

    function renderSelectionButton() {
        if (!isPromptArea()) return;
        const button = document.getElementById('library-selection-toggle');
        if (!button) return;
        button.classList.toggle('is-active', state.selectionMode);
        button.innerHTML = state.selectionMode
            ? '<i class="fa-solid fa-xmark"></i><span>Auswahl beenden</span>'
            : `<i class="fa-solid ${state.tier === 'pro' ? 'fa-check-double' : 'fa-lock'}"></i><span>${state.tier === 'pro' ? 'Auswählen' : 'Mehrfachauswahl mit Pro'}</span>`;
    }

    function toggleSelectionMode() {
        if (state.tier !== 'pro') {
            window.openUpgradeModal?.('library_full');
            return;
        }
        state.selectionMode = !state.selectionMode;
        state.selected.clear();
        renderSelectionButton();
        renderItems();
    }

    function toggleSelected(id) {
        const numericId = Number(id);
        state.selected.has(numericId) ? state.selected.delete(numericId) : state.selected.add(numericId);
        renderItems();
    }

    function renderBulkBar() {
        const wrap = document.getElementById('library-bulk-bar');
        if (!wrap) return;
        wrap.replaceChildren();
        if (!state.selectionMode) return;
        const bar = document.createElement('div');
        bar.className = 'library-bulk-bar';
        const count = document.createElement('span');
        count.className = 'library-bulk-count';
        count.textContent = `${state.selected.size} ausgewählt`;
        const move = document.createElement('select');
        move.className = 'library-bulk-action';
        move.innerHTML = '<option value="">Kategorie ändern …</option><option value="uncategorized">Ohne Kategorie</option>';
        state.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = String(category.id);
            option.textContent = category.name;
            move.append(option);
        });
        move.addEventListener('change', () => {
            if (!move.value) return;
            bulkAction('move', move.value === 'uncategorized' ? null : Number(move.value));
        });
        const archive = bulkButton(state.archived ? 'Wiederherstellen' : 'Archivieren', state.archived ? 'fa-rotate-left' : 'fa-box-archive', () => bulkAction(state.archived ? 'restore' : 'archive'));
        const exportButton = bulkButton('Export', 'fa-file-export', exportSelected);
        const remove = bulkButton('Löschen', 'fa-trash', () => bulkAction('delete'), true);
        bar.append(count, move, archive, exportButton, remove);
        wrap.append(bar);
    }

    function bulkButton(label, icon, handler, danger = false) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `library-bulk-action${danger ? ' library-bulk-danger' : ''}`;
        button.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
        button.addEventListener('click', handler);
        return button;
    }

    async function bulkAction(action, categoryId = null) {
        const ids = [...state.selected];
        if (!ids.length) return window.showToast?.('Bitte mindestens einen Prompt auswählen.', 'info');
        if (action === 'delete') {
            const confirmed = await askConfirmation(
                'Prompts endgültig löschen?',
                `${ids.length} ausgewählte Prompts werden einschließlich ihrer Versionsverläufe gelöscht.`
            );
            if (!confirmed) return;
        }
        const result = await db.bulkManageScenarios(ids, action, categoryId);
        if (!result.success) {
            if (result.reason === 'PRO_REQUIRED') window.openUpgradeModal?.('library_full');
            else window.showToast?.('Mehrfachaktion konnte nicht ausgeführt werden.', 'error');
            return;
        }
        track('library_bulk_action', { action, count: result.count });
        state.selected.clear();
        await reloadItems();
        await window.refreshPromptLibraryAndCategories?.();
        window.updatePromptCounter?.();
        window.showToast?.(`${result.count} Prompts aktualisiert.`, 'success');
    }

    function exportSelected() {
        const selected = state.items.filter(item => state.selected.has(Number(item.id)));
        if (!selected.length) return window.showToast?.('Bitte mindestens einen Prompt auswählen.', 'info');
        const payload = selected.map(prompt => ({
            name: prompt.name,
            description: prompt.description,
            category: prompt.category,
            promptType: prompt.prompt_type,
            content: promptToText(prompt),
            createdAt: prompt.created_at,
            updatedAt: prompt.updated_at
        }));
        downloadFile('promptomizer-prompts.json', JSON.stringify(payload, null, 2), 'application/json');
        track('library_export', { format: 'json', multiple: true });
    }

    function ensureEditDetails() {
        const banner = document.getElementById('prompt-edit-banner');
        if (!banner) return null;
        let details = document.getElementById('library-edit-details');
        if (!details) {
            details = document.createElement('div');
            details.id = 'library-edit-details';
            details.className = 'library-edit-details';
            banner.append(details);
        }
        return details;
    }

    async function renderEditDetails(id) {
        const details = ensureEditDetails();
        if (!details) return;
        const prompt = await db.getScenarioById(id);
        if (!prompt) {
            details.innerHTML = '<div class="text-xs text-red-400">Prompt-Informationen konnten nicht geladen werden.</div>';
            return;
        }
        state.editPromptId = Number(prompt.id);
        details.replaceChildren();
        const grid = document.createElement('div');
        grid.className = 'library-edit-grid';
        const left = document.createElement('div');
        const descLabel = document.createElement('label');
        descLabel.className = 'ui-label';
        descLabel.textContent = 'Kurzbeschreibung';
        const desc = document.createElement('textarea');
        desc.id = 'library-edit-description';
        desc.className = 'library-edit-description';
        desc.maxLength = 1000;
        desc.placeholder = 'Wofür ist dieser Prompt gedacht?';
        desc.value = prompt.description || '';
        const saving = document.createElement('div');
        saving.className = 'library-saving-hint';
        saving.textContent = 'Änderungen werden automatisch gespeichert.';
        desc.addEventListener('input', () => {
            saving.textContent = 'Wird gespeichert …';
            clearTimeout(state.descriptionTimer);
            state.descriptionTimer = setTimeout(async () => {
                const result = await db.updateScenarioMetadata(prompt.id, { description: desc.value });
                saving.textContent = result.success ? 'Gespeichert.' : 'Speichern fehlgeschlagen.';
                if (result.success) track('library_description_save');
            }, 600);
        });
        left.append(descLabel, desc, saving);

        const right = document.createElement('div');
        const categoryLabel = document.createElement('label');
        categoryLabel.className = 'ui-label';
        categoryLabel.textContent = 'Kategorie';
        const category = document.createElement('select');
        category.className = 'library-edit-category';
        category.innerHTML = '<option value="">Ohne Kategorie</option>';
        state.categories.forEach(item => {
            const option = document.createElement('option');
            option.value = String(item.id);
            option.textContent = item.name;
            category.append(option);
        });
        category.value = prompt.category_id === null ? '' : String(prompt.category_id);
        category.addEventListener('change', async () => {
            const value = category.value ? Number(category.value) : null;
            const result = await db.updateScenarioMetadata(prompt.id, { categoryId: value });
            if (!result.success) {
                window.showToast?.('Kategorie konnte nicht gespeichert werden.', 'error');
                category.value = prompt.category_id === null ? '' : String(prompt.category_id);
                return;
            }
            prompt.category_id = result.scenario.category_id;
            prompt.category = result.scenario.category;
            const badge = document.getElementById('prompt-edit-category-badge');
            if (badge) badge.textContent = prompt.category || 'Ohne Kategorie';
            await Promise.all([loadContext(), window.refreshPromptLibraryAndCategories?.()]);
            track('library_edit_category');
        });
        const meta = document.createElement('div');
        meta.className = 'library-edit-meta';
        meta.style.marginTop = '.7rem';
        meta.append(
            metaBox('Prompt-Typ', prompt.prompt_type === 'free' ? 'Frei' : 'Strukturiert'),
            metaBox('Version', String(prompt.current_version || 1)),
            metaBox('Letzte Änderung', formatDate(prompt.updated_at)),
            metaBox('Letzte Verwendung', formatDate(prompt.last_used_at))
        );
        right.append(categoryLabel, category, meta);
        grid.append(left, right);

        const actions = document.createElement('div');
        actions.className = 'library-edit-actions';
        actions.append(
            editAction('Duplizieren', 'fa-clone', () => duplicatePrompt(prompt.id)),
            editAction(prompt.archived_at ? 'Wiederherstellen' : 'Archivieren', prompt.archived_at ? 'fa-rotate-left' : 'fa-box-archive', () => archivePrompt(prompt.id, Boolean(prompt.archived_at)))
        );
        if (state.tier === 'pro') {
            actions.append(editAction('Versionen', 'fa-clock-rotate-left', () => window.openActivePromptVersions?.()));
        }
        actions.append(
            editAction('Markdown', 'fa-file-arrow-down', () => exportPrompt(prompt, 'markdown')),
            editAction('JSON', 'fa-file-code', () => exportPrompt(prompt, 'json')),
            editAction('Löschen', 'fa-trash', () => deletePrompt(prompt.id), true)
        );
        details.append(grid, actions);
    }

    function metaBox(label, value) {
        const box = document.createElement('div');
        box.className = 'library-meta-box';
        const labelEl = document.createElement('div');
        labelEl.className = 'library-meta-label';
        labelEl.textContent = label;
        const valueEl = document.createElement('div');
        valueEl.className = 'library-meta-value';
        valueEl.textContent = value;
        valueEl.title = value;
        box.append(labelEl, valueEl);
        return box;
    }

    function editAction(label, icon, handler, danger = false) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `library-edit-action${danger ? ' library-edit-action-danger' : ''}`;
        button.innerHTML = `<i class="fa-solid ${icon}"></i><span>${label}</span>`;
        button.addEventListener('click', handler);
        return button;
    }

    async function duplicatePrompt(id) {
        const result = await db.duplicateScenario(id);
        if (!result.success) {
            if (result.reason === 'FREE_LIMIT_REACHED') window.openUpgradeModal?.('library_full');
            else window.showToast?.('Prompt konnte nicht dupliziert werden.', 'error');
            return;
        }
        track('library_prompt_duplicate');
        await Promise.all([reloadItems(), window.refreshPromptLibraryAndCategories?.(), window.updatePromptCounter?.()]);
        window.showToast?.('Prompt wurde dupliziert.', 'success');
        await openEdit(result.scenario);
    }

    async function archivePrompt(id, restore) {
        const result = await db.updateScenarioMetadata(id, { archivedAt: restore ? null : new Date().toISOString() });
        if (!result.success) return window.showToast?.('Archivstatus konnte nicht gespeichert werden.', 'error');
        track('library_prompt_archive', { archived: !restore });
        window.exitPromptEditSession?.(false);
        window.switchView?.('library');
        await Promise.all([reloadItems(), window.refreshPromptLibraryAndCategories?.()]);
        window.showToast?.(restore ? 'Prompt wurde wiederhergestellt.' : 'Prompt wurde archiviert.', 'success');
    }

    async function deletePrompt(id) {
        const confirmed = await askConfirmation(
            'Prompt endgültig löschen?',
            'Der Prompt und sein vollständiger Versionsverlauf werden unwiderruflich gelöscht.'
        );
        if (!confirmed) return;
        const ok = await db.deleteScenario(id);
        if (!ok) return window.showToast?.('Prompt konnte nicht gelöscht werden.', 'error');
        track('library_prompt_delete');
        window.exitPromptEditSession?.(false);
        window.switchView?.('library');
        await Promise.all([reloadItems(), window.refreshPromptLibraryAndCategories?.(), window.updatePromptCounter?.()]);
        window.showToast?.('Prompt wurde gelöscht.', 'success');
    }

    function exportPrompt(prompt, format) {
        if (format === 'json') {
            const payload = {
                name: prompt.name,
                description: prompt.description,
                category: prompt.category,
                promptType: prompt.prompt_type,
                content: promptToText(prompt),
                createdAt: prompt.created_at,
                updatedAt: prompt.updated_at
            };
            downloadFile(`${safeFilename(prompt.name)}.json`, JSON.stringify(payload, null, 2), 'application/json');
        } else {
            const header = [`# ${prompt.name}`, prompt.description ? `\n${prompt.description}` : '', `\nKategorie: ${prompt.category || 'Ohne Kategorie'}`, `Typ: ${prompt.prompt_type === 'free' ? 'Frei' : 'Strukturiert'}`, '\n---\n'].join('\n');
            downloadFile(`${safeFilename(prompt.name)}.md`, header + promptToText(prompt) + '\n', 'text/markdown');
        }
        track('library_export', { format, multiple: false });
    }

    function patchEditSession() {
        if (!window.startPromptEditSession || window.startPromptEditSession.__libraryPatched) return;
        const originalStart = window.startPromptEditSession;
        const wrappedStart = async function (id, draftOverride = null) {
            const target = await db.getScenarioById(id);
            const regularGetScenarios = db.getScenarios;
            if (target?.archived_at) {
                db.getScenarios = async function () {
                    const active = await regularGetScenarios.call(db);
                    return active.some(item => Number(item.id) === Number(target.id)) ? active : [...active, target];
                };
            }
            try {
                const result = await originalStart(id, draftOverride);
                state.editPromptId = Number(id);
                await renderEditDetails(id);
                return result;
            } finally {
                db.getScenarios = regularGetScenarios;
            }
        };
        wrappedStart.__libraryPatched = true;
        window.startPromptEditSession = wrappedStart;

        if (window.exitPromptEditSession) {
            const originalExit = window.exitPromptEditSession;
            window.exitPromptEditSession = function (...args) {
                state.editPromptId = null;
                clearTimeout(state.descriptionTimer);
                document.getElementById('library-edit-details')?.replaceChildren();
                return originalExit(...args);
            };
        }
    }

    function patchCategoryRefreshes() {
        ['savePromptCategoryFromModal', 'confirmRenameCategory', 'confirmDeleteCategory'].forEach(name => {
            const original = window[name];
            if (typeof original !== 'function' || original.__libraryPatched) return;
            const wrapped = async function (...args) {
                const result = await original(...args);
                await reloadItems();
                return result;
            };
            wrapped.__libraryPatched = true;
            window[name] = wrapped;
        });
    }

    function setPromptShell() {
        const view = document.getElementById('view-library');
        if (!view) return;
        view.dataset.contentType = 'prompts';
        document.getElementById('library-content-prompts')?.classList.add('is-active');
        document.getElementById('library-content-snippets')?.classList.remove('is-active');
        const title = view.querySelector('.library-title');
        if (title) title.textContent = 'Prompt-Bibliothek';
        setFooterContentType('prompts');
        const search = document.getElementById('library-search');
        if (search) { search.placeholder = 'Prompts durchsuchen …'; search.value = state.search; }
        const type = document.getElementById('library-type');
        if (type) {
            type.classList.remove('hidden');
            type.innerHTML = '<option value="">Alle Prompt-Typen</option><option value="structured">Strukturiert</option><option value="free">Frei</option>';
            type.value = state.promptType;
        }
        const sort = document.getElementById('library-sort');
        if (sort) sort.value = state.sort;
        document.getElementById('library-add-category')?.classList.remove('hidden');
        const sideLabels = view.querySelectorAll('.library-categories .library-side-label');
        if (sideLabels[1]) sideLabels[1].textContent = 'Kategorien';
        renderViewToggle();
        renderSelectionButton();
    }

    async function openPrompts() {
        localStorage.setItem(CONTENT_KEY, 'prompts');
        setPromptShell();
        track('library_open', { content_type: 'prompts' });
        await reloadItems();
    }

    async function openLibrary() {
        if (localStorage.getItem(CONTENT_KEY) === 'snippets' && window.SnippetLibrary?.open) {
            await window.SnippetLibrary.open();
            return;
        }
        await openPrompts();
    }

    function init() {
        if (state.initialized) return;
        state.initialized = true;
        createNavItem();
        createView();
        patchViewSwitching();
        patchEditSession();
        patchCategoryRefreshes();
        bindControls();
        renderViewToggle();
        renderSelectionButton();
        window.addEventListener('auth-state-changed', () => {
            if (!document.getElementById('view-library')?.classList.contains('hidden')) {
                if (isPromptArea()) reloadItems();
                else window.SnippetLibrary?.refreshAll();
            } else loadContext();
        });
        loadContext();
    }

    window.PromptLibrary = {
        open: openLibrary,
        openPrompts,
        refreshAll: reloadItems,
        renderEditDetails,
        setFooterContentType
    };

    init();
})();
