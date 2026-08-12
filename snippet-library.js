(function () {
    'use strict';

    const PAGE_SIZE = 24;
    const VIEW_KEY = 'promptomizer_snippet_library_view';
    const CONTENT_KEY = 'promptomizer_library_content';
    const fieldLabels = {
        role: 'Rolle & Funktion',
        context: 'Kontext',
        task: 'Aufgabe',
        format: 'Format',
        free: 'Freie Bausteine'
    };
    const fieldIcons = {
        role: 'fa-user-tie',
        context: 'fa-align-left',
        task: 'fa-list-check',
        format: 'fa-file-lines',
        free: 'fa-cube'
    };
    const state = {
        initialized: false,
        active: false,
        loading: false,
        items: [],
        counts: { fields: {}, archived: 0, favorites: 0 },
        total: 0,
        hasMore: false,
        offset: 0,
        search: '',
        fieldId: '',
        sort: 'default',
        favoriteOnly: false,
        archived: false,
        activeSection: 'all',
        viewMode: localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'cards',
        tier: 'free',
        selectionMode: false,
        selected: new Set(),
        editingId: null,
        targetSnippet: null
    };
    const db = window.db;

    function track(name, data = {}) {
        try {
            if (window.umami?.track) window.umami.track(name, data);
        } catch (_) { }
    }

    function isActive() {
        return state.active && document.getElementById('view-library')?.dataset.contentType === 'snippets';
    }

    function formatDate(value) {
        if (!value) return 'Noch nicht verwendet';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '–';
        return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    }

    function cleanText(value) {
        return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function safeFilename(name) {
        return cleanText(name).toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-|-$/g, '') || 'baustein';
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

    let confirmationResolver = null;

    function resolveConfirmation(accepted) {
        document.getElementById('snippet-library-confirm')?.classList.add('hidden');
        const resolver = confirmationResolver;
        confirmationResolver = null;
        resolver?.(accepted);
    }

    function askConfirmation(title, message, confirmLabel = 'Löschen') {
        let modal = document.getElementById('snippet-library-confirm');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'snippet-library-confirm';
            modal.className = 'ui-backdrop z-[145] hidden';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.innerHTML = `
                <div class="ui-modal ui-modal-sm">
                    <h3 class="ui-modal-title mb-2" data-confirm-title></h3>
                    <p class="text-sm text-slate-400 mb-5" data-confirm-message></p>
                    <div class="ui-actions">
                        <button type="button" class="ui-btn ui-btn-ghost" data-confirm-cancel>Abbrechen</button>
                        <button type="button" class="ui-btn ui-btn-danger" data-confirm-accept>Löschen</button>
                    </div>
                </div>`;
            modal.querySelector('[data-confirm-cancel]').addEventListener('click', () => resolveConfirmation(false));
            modal.querySelector('[data-confirm-accept]').addEventListener('click', () => resolveConfirmation(true));
            modal.addEventListener('click', event => { if (event.target === modal) resolveConfirmation(false); });
            modal.addEventListener('keydown', event => { if (event.key === 'Escape') resolveConfirmation(false); });
            document.body.append(modal);
        }
        if (confirmationResolver) resolveConfirmation(false);
        modal.querySelector('[data-confirm-title]').textContent = title;
        modal.querySelector('[data-confirm-message]').textContent = message;
        modal.querySelector('[data-confirm-accept]').textContent = confirmLabel;
        modal.classList.remove('hidden');
        return new Promise(resolve => {
            confirmationResolver = resolve;
            requestAnimationFrame(() => modal.querySelector('[data-confirm-cancel]')?.focus());
        });
    }

    function configureShell() {
        const view = document.getElementById('view-library');
        if (!view) return;
        state.active = true;
        view.dataset.contentType = 'snippets';
        document.getElementById('library-content-prompts')?.classList.remove('is-active');
        document.getElementById('library-content-snippets')?.classList.add('is-active');
        document.getElementById('library-create-snippet')?.classList.remove('hidden');
        const kicker = view.querySelector('.library-kicker');
        const title = view.querySelector('.library-title');
        const subtitle = view.querySelector('.library-subtitle');
        if (kicker) kicker.textContent = 'Deine wiederverwendbaren Inhalte';
        if (title) title.textContent = 'Baustein-Bibliothek';
        if (subtitle) subtitle.textContent = 'Finde Textbausteine schnell wieder, füge sie in deinen Entwurf ein und verwalte alle Einsatzbereiche an einem Ort.';
        const search = document.getElementById('library-search');
        if (search) { search.placeholder = 'Bausteine durchsuchen …'; search.value = state.search; }
        const type = document.getElementById('library-type');
        if (type) {
            type.classList.remove('hidden');
            type.innerHTML = '<option value="">Alle Einsatzbereiche</option>';
            Object.entries(fieldLabels).forEach(([value, label]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                type.append(option);
            });
            type.value = state.fieldId;
            type.setAttribute('aria-label', 'Einsatzbereich filtern');
        }
        const sort = document.getElementById('library-sort');
        if (sort) sort.value = state.sort;
        document.getElementById('library-add-category')?.classList.add('hidden');
        const labels = view.querySelectorAll('.library-categories .library-side-label');
        if (labels[1]) labels[1].textContent = 'Einsatzbereiche';
        renderViewToggle();
        renderSelectionButton();
    }

    function bindControls() {
        if (state.initialized) return;
        state.initialized = true;
        let searchTimer = null;
        document.getElementById('library-search')?.addEventListener('input', event => {
            if (!isActive()) return;
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                state.search = event.target.value || '';
                track('snippet_library_search', { active: Boolean(state.search.trim()) });
                reloadItems();
            }, 250);
        });
        document.getElementById('library-type')?.addEventListener('change', event => {
            if (!isActive()) return;
            state.fieldId = event.target.value;
            state.activeSection = state.fieldId ? 'field' : 'all';
            reloadItems();
        });
        document.getElementById('library-sort')?.addEventListener('change', event => {
            if (!isActive()) return;
            state.sort = event.target.value;
            reloadItems();
        });
        document.getElementById('library-view-cards')?.addEventListener('click', () => { if (isActive()) setViewMode('cards'); });
        document.getElementById('library-view-list')?.addEventListener('click', () => { if (isActive()) setViewMode('list'); });
        document.getElementById('library-load-more')?.addEventListener('click', () => { if (isActive()) loadItems(false); });
        document.getElementById('library-selection-toggle')?.addEventListener('click', () => { if (isActive()) toggleSelectionMode(); });
        document.getElementById('library-create-snippet')?.addEventListener('click', () => {
            if (!isActive()) return;
            if (!window.currentUser) return window.openAuthModal?.();
            renderEditor(null);
        });
    }

    function setViewMode(mode) {
        state.viewMode = mode === 'list' ? 'list' : 'cards';
        localStorage.setItem(VIEW_KEY, state.viewMode);
        renderViewToggle();
        renderItems();
        track('snippet_library_view_mode', { mode: state.viewMode });
    }

    function renderViewToggle() {
        if (!isActive()) return;
        document.getElementById('library-view-cards')?.classList.toggle('is-active', state.viewMode === 'cards');
        document.getElementById('library-view-list')?.classList.toggle('is-active', state.viewMode === 'list');
    }

    function resetFilters(section) {
        state.fieldId = '';
        state.favoriteOnly = false;
        state.archived = false;
        state.activeSection = section;
    }

    function chooseSection(section, fieldId = '') {
        resetFilters(section);
        if (section === 'favorites') state.favoriteOnly = true;
        if (section === 'recent') state.sort = 'used';
        if (section === 'field') state.fieldId = fieldId;
        if (section === 'archive') state.archived = true;
        const type = document.getElementById('library-type');
        const sort = document.getElementById('library-sort');
        if (type) type.value = state.fieldId;
        if (sort) sort.value = state.sort;
        renderFilters();
        reloadItems();
    }

    function filterButton(label, icon, count, section, fieldId = '') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'library-category-button';
        button.classList.toggle('is-active', state.activeSection === section && (section !== 'field' || state.fieldId === fieldId));
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
        button.addEventListener('click', () => chooseSection(section, fieldId));
        return button;
    }

    function renderFilters() {
        if (!isActive()) return;
        const staticWrap = document.getElementById('library-static-filters');
        const categoryWrap = document.getElementById('library-category-list');
        if (!staticWrap || !categoryWrap) return;
        staticWrap.replaceChildren();
        categoryWrap.replaceChildren();
        const allCount = Object.values(state.counts.fields).reduce((sum, count) => sum + Number(count || 0), 0);
        staticWrap.append(
            filterButton('Alle Bausteine', 'fa-cubes', allCount, 'all'),
            filterButton('Favoriten', 'fa-star', state.counts.favorites, 'favorites'),
            filterButton('Zuletzt verwendet', 'fa-clock-rotate-left', allCount, 'recent')
        );
        Object.entries(fieldLabels).forEach(([fieldId, label]) => {
            categoryWrap.append(filterButton(label, fieldIcons[fieldId], state.counts.fields[fieldId], 'field', fieldId));
        });
        const divider = document.createElement('div');
        divider.className = 'library-side-divider';
        categoryWrap.append(divider, filterButton('Archiv', 'fa-box-archive', state.counts.archived, 'archive'));
    }

    async function loadContext() {
        if (!window.currentUser) {
            state.counts = { fields: {}, archived: 0, favorites: 0 };
            state.tier = 'free';
        } else {
            const [counts, tier] = await Promise.all([db.getSnippetLibraryCounts(), db.getUserTier?.() || 'free']);
            state.counts = counts || { fields: {}, archived: 0, favorites: 0 };
            state.tier = tier || 'free';
        }
        renderFilters();
        renderSelectionButton();
    }

    function currentQuery() {
        return {
            search: state.search,
            fieldId: state.fieldId,
            sort: state.sort,
            favoriteOnly: state.favoriteOnly,
            archived: state.archived,
            offset: state.offset,
            limit: PAGE_SIZE
        };
    }

    async function loadItems(reset = true) {
        if (!isActive() || state.loading) return;
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
        const result = await db.getLibrarySnippets(currentQuery());
        state.loading = false;
        if (!isActive()) return;
        if (!result.success) return renderError();
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
        if (!isActive()) return;
        const content = document.getElementById('library-content');
        if (content) content.innerHTML = '<div class="library-empty"><div class="library-empty-icon"><i class="fa-solid fa-circle-notch fa-spin"></i></div><div>Bausteine werden geladen …</div></div>';
        document.getElementById('library-load-more')?.classList.add('hidden');
    }

    function renderSignedOut() {
        if (!isActive()) return;
        const content = document.getElementById('library-content');
        if (!content) return;
        content.innerHTML = '<div class="library-empty"><div class="library-empty-icon"><i class="fa-solid fa-lock"></i></div><strong>Deine Bausteine warten auf dich</strong><div>Melde dich an, um gespeicherte Bausteine zu sehen.</div><button class="library-load-more" type="button">Jetzt anmelden</button></div>';
        content.querySelector('button')?.addEventListener('click', () => window.openAuthModal?.());
    }

    function renderError() {
        if (!isActive()) return;
        const content = document.getElementById('library-content');
        if (!content) return;
        content.innerHTML = '<div class="library-empty"><div class="library-empty-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><strong>Bausteine konnten nicht geladen werden</strong><div>Bitte versuche es erneut.</div><button class="library-load-more" type="button">Erneut laden</button></div>';
        content.querySelector('button')?.addEventListener('click', reloadItems);
    }

    function emptyCopy() {
        if (state.search.trim()) return ['Keine passenden Bausteine', 'Versuche einen anderen Suchbegriff oder entferne Filter.', 'fa-magnifying-glass'];
        if (state.archived) return ['Das Archiv ist leer', 'Archivierte Bausteine erscheinen an dieser Stelle.', 'fa-box-archive'];
        if (state.favoriteOnly) return ['Noch keine Favoriten', 'Markiere wichtige Bausteine über den Stern.', 'fa-star'];
        return ['Noch keine Bausteine', 'Lege deinen ersten wiederverwendbaren Textbaustein an.', 'fa-cube'];
    }

    function renderItems() {
        if (!isActive()) return;
        state.editingId = null;
        const content = document.getElementById('library-content');
        const count = document.getElementById('library-result-count');
        const more = document.getElementById('library-load-more');
        if (!content || !count || !more) return;
        renderViewToggle();
        renderBulkBar();
        content.classList.toggle('library-selection-mode', state.selectionMode);
        count.textContent = `${state.total} ${state.total === 1 ? 'Baustein' : 'Bausteine'}`;
        more.classList.toggle('hidden', !state.hasMore);
        if (!state.items.length) {
            const [title, description, icon] = emptyCopy();
            content.innerHTML = `<div class="library-empty"><div class="library-empty-icon"><i class="fa-solid ${icon}"></i></div><strong></strong><div></div></div>`;
            content.querySelector('strong').textContent = title;
            content.querySelector('.library-empty > div:last-child').textContent = description;
            return;
        }
        content.replaceChildren();
        const wrap = document.createElement('div');
        wrap.className = state.viewMode === 'cards' ? 'library-grid' : 'library-list snippet-library-list';
        state.items.forEach(snippet => wrap.append(state.viewMode === 'cards' ? buildCard(snippet) : buildListRow(snippet)));
        content.append(wrap);
    }

    function makeFavoriteButton(snippet) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'library-card-star';
        button.classList.toggle('is-favorite', Boolean(snippet.is_favorite));
        button.title = snippet.is_favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen';
        button.setAttribute('aria-label', button.title);
        button.setAttribute('aria-pressed', String(Boolean(snippet.is_favorite)));
        button.innerHTML = `<i class="${snippet.is_favorite ? 'fa-solid' : 'fa-regular'} fa-star"></i>`;
        button.addEventListener('click', event => toggleFavorite(event, snippet.id));
        return button;
    }

    function makeInsertButton(snippet) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'library-use-button';
        button.title = 'Im Editor einfügen';
        button.setAttribute('aria-label', 'Im Editor einfügen');
        button.innerHTML = '<i class="fa-solid fa-paste"></i>';
        button.addEventListener('click', event => insertSnippet(event, snippet));
        return button;
    }

    function attachOpenBehavior(element, snippet) {
        element.addEventListener('click', () => state.selectionMode ? toggleSelected(snippet.id) : renderEditor(snippet));
        element.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                state.selectionMode ? toggleSelected(snippet.id) : renderEditor(snippet);
            }
        });
    }

    function buildCard(snippet) {
        const card = document.createElement('article');
        card.className = 'library-card';
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `${snippet.name} bearbeiten`);
        card.classList.toggle('is-selected', state.selected.has(Number(snippet.id)));
        const selection = document.createElement('span');
        selection.className = 'library-card-selection';
        selection.innerHTML = '<i class="fa-solid fa-check"></i>';
        const body = document.createElement('div');
        body.className = 'library-card-body';
        const badges = document.createElement('div');
        badges.className = 'library-card-badges';
        const field = document.createElement('span');
        field.className = 'library-badge library-badge-type';
        field.textContent = fieldLabels[snippet.field_id] || 'Baustein';
        const title = document.createElement('h3');
        title.className = 'library-card-title';
        title.textContent = snippet.name || 'Unbenannter Baustein';
        const preview = document.createElement('p');
        preview.className = 'library-card-preview';
        preview.textContent = cleanText(snippet.content) || 'Noch kein Inhalt vorhanden.';
        const footer = document.createElement('div');
        footer.className = 'library-card-footer';
        footer.append(makeInsertButton(snippet));
        badges.append(field);
        body.append(badges, title, preview, footer);
        card.append(makeFavoriteButton(snippet), selection, body);
        attachOpenBehavior(card, snippet);
        return card;
    }

    function buildListRow(snippet) {
        const row = document.createElement('div');
        row.className = 'library-list-row snippet-library-row';
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', `${snippet.name} bearbeiten`);
        row.classList.toggle('is-selected', state.selected.has(Number(snippet.id)));
        const first = document.createElement('div');
        first.style.display = 'grid';
        first.style.placeItems = 'center';
        const selection = document.createElement('span');
        selection.className = 'library-list-selection';
        selection.innerHTML = '<i class="fa-solid fa-check"></i>';
        first.append(state.selectionMode ? selection : makeFavoriteButton(snippet));
        first.querySelector('.library-card-star')?.style.setProperty('position', 'static');
        const title = document.createElement('div');
        title.className = 'library-list-title';
        title.textContent = snippet.name || 'Unbenannter Baustein';
        const preview = document.createElement('div');
        preview.className = 'library-list-preview';
        preview.textContent = cleanText(snippet.content);
        const field = document.createElement('span');
        field.className = 'library-badge library-badge-type';
        field.textContent = fieldLabels[snippet.field_id] || 'Baustein';
        row.append(first, title, preview, field, makeInsertButton(snippet));
        attachOpenBehavior(row, snippet);
        return row;
    }

    async function toggleFavorite(event, id) {
        event.stopPropagation();
        if (state.selectionMode) return toggleSelected(id);
        const snippet = state.items.find(item => Number(item.id) === Number(id));
        if (!snippet) return;
        const previous = Boolean(snippet.is_favorite);
        snippet.is_favorite = !previous;
        renderItems();
        const result = await db.updateSnippetMetadata(id, { isFavorite: !previous });
        if (!result.success) {
            snippet.is_favorite = previous;
            renderItems();
            window.showToast?.('Favorit konnte nicht gespeichert werden.', 'error');
            return;
        }
        track('snippet_library_favorite', { favorite: !previous });
        await loadContext();
    }

    async function insertSnippet(event, snippet) {
        event.stopPropagation();
        if (state.selectionMode) return toggleSelected(snippet.id);
        const result = await window.insertSnippetFromLibrary?.(snippet);
        if (result?.reason === 'TARGET_REQUIRED') {
            openTargetDialog(snippet, result.suggestedTarget);
            return;
        }
        if (!result?.success) {
            window.showToast?.('Baustein konnte nicht eingefügt werden.', 'error');
            return;
        }
        snippet.last_used_at = new Date().toISOString();
        track('snippet_library_insert', { field_id: snippet.field_id });
        window.switchView?.('editor');
    }

    function ensureTargetDialog() {
        let modal = document.getElementById('snippet-target-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'snippet-target-modal';
        modal.className = 'ui-backdrop z-[145] hidden';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML = `
            <div class="ui-modal ui-modal-sm">
                <h3 class="ui-modal-title mb-2">Ziel im Editor wählen</h3>
                <p class="text-sm text-slate-400 mb-4">In welches strukturierte Feld soll der freie Baustein eingefügt werden?</p>
                <div class="snippet-target-options"></div>
                <div class="ui-actions mt-5"><button type="button" class="ui-btn ui-btn-ghost" data-target-cancel>Abbrechen</button></div>
            </div>`;
        modal.querySelector('[data-target-cancel]').addEventListener('click', closeTargetDialog);
        modal.addEventListener('click', event => { if (event.target === modal) closeTargetDialog(); });
        document.body.append(modal);
        return modal;
    }

    function openTargetDialog(snippet, suggestedTarget) {
        state.targetSnippet = snippet;
        const modal = ensureTargetDialog();
        const options = modal.querySelector('.snippet-target-options');
        options.replaceChildren();
        ['role', 'context', 'task', 'format'].forEach(fieldId => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'snippet-target-button';
            button.classList.toggle('is-suggested', fieldId === suggestedTarget);
            button.innerHTML = `<i class="fa-solid ${fieldIcons[fieldId]}"></i><span>${fieldLabels[fieldId]}</span>`;
            button.addEventListener('click', () => insertAtTarget(fieldId));
            options.append(button);
        });
        modal.classList.remove('hidden');
        requestAnimationFrame(() => options.querySelector('.is-suggested')?.focus());
    }

    function closeTargetDialog() {
        document.getElementById('snippet-target-modal')?.classList.add('hidden');
        state.targetSnippet = null;
    }

    async function insertAtTarget(fieldId) {
        const snippet = state.targetSnippet;
        if (!snippet) return;
        const result = await window.insertSnippetFromLibrary?.(snippet, fieldId);
        if (!result?.success) return window.showToast?.('Baustein konnte nicht eingefügt werden.', 'error');
        closeTargetDialog();
        track('snippet_library_insert', { field_id: snippet.field_id, target_field: fieldId });
        window.switchView?.('editor');
    }

    function renderSelectionButton() {
        if (!isActive()) return;
        const button = document.getElementById('library-selection-toggle');
        if (!button) return;
        button.classList.toggle('is-active', state.selectionMode);
        button.innerHTML = state.selectionMode
            ? '<i class="fa-solid fa-xmark"></i><span>Auswahl beenden</span>'
            : `<i class="fa-solid ${state.tier === 'pro' ? 'fa-check-double' : 'fa-lock'}"></i><span>${state.tier === 'pro' ? 'Auswählen' : 'Mehrfachauswahl mit Pro'}</span>`;
    }

    function toggleSelectionMode() {
        if (state.tier !== 'pro') return window.openUpgradeModal?.('library_full');
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

    function bulkButton(label, icon, handler, danger = false) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `library-bulk-action${danger ? ' library-bulk-danger' : ''}`;
        button.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
        button.addEventListener('click', handler);
        return button;
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
        move.innerHTML = '<option value="">Einsatzbereich ändern …</option>';
        Object.entries(fieldLabels).forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            move.append(option);
        });
        move.addEventListener('change', () => { if (move.value) bulkAction('move', move.value); });
        const archive = bulkButton(state.archived ? 'Wiederherstellen' : 'Archivieren', state.archived ? 'fa-rotate-left' : 'fa-box-archive', () => bulkAction(state.archived ? 'restore' : 'archive'));
        const exportMarkdown = bulkButton('Markdown', 'fa-file-arrow-down', () => exportSelected('markdown'));
        const exportJson = bulkButton('JSON', 'fa-file-code', () => exportSelected('json'));
        const remove = bulkButton('Löschen', 'fa-trash', () => bulkAction('delete'), true);
        bar.append(count, move, archive, exportMarkdown, exportJson, remove);
        wrap.append(bar);
    }

    async function bulkAction(action, fieldId = null) {
        const ids = [...state.selected];
        if (!ids.length) return window.showToast?.('Bitte mindestens einen Baustein auswählen.', 'info');
        if (action === 'delete') {
            const confirmed = await askConfirmation('Bausteine endgültig löschen?', `${ids.length} ausgewählte Bausteine werden endgültig gelöscht.`);
            if (!confirmed) return;
        }
        const result = await db.bulkManageSnippets(ids, action, fieldId);
        if (!result.success) {
            if (result.reason === 'PRO_REQUIRED') window.openUpgradeModal?.('library_full');
            else window.showToast?.('Mehrfachaktion konnte nicht ausgeführt werden.', 'error');
            return;
        }
        track('snippet_library_bulk_action', { action, count: result.count });
        await refreshAll();
        window.refreshSnippetSurfaces?.();
        window.showToast?.(`${result.count} Bausteine aktualisiert.`, 'success');
    }

    function exportSelected(format) {
        const selected = state.items.filter(item => state.selected.has(Number(item.id)));
        if (!selected.length) return window.showToast?.('Bitte mindestens einen Baustein auswählen.', 'info');
        if (format === 'markdown') {
            const markdown = selected.map(snippet => [
                `# ${snippet.name}`,
                `Einsatzbereich: ${fieldLabels[snippet.field_id] || 'Baustein'}`,
                '',
                snippet.content
            ].join('\n')).join('\n\n---\n\n');
            downloadFile('promptomizer-bausteine.md', markdown + '\n', 'text/markdown');
        } else {
            const payload = selected.map(snippet => ({
                name: snippet.name,
                content: snippet.content,
                fieldId: snippet.field_id,
                createdAt: snippet.created_at,
                updatedAt: snippet.updated_at
            }));
            downloadFile('promptomizer-bausteine.json', JSON.stringify(payload, null, 2), 'application/json');
        }
        track('snippet_library_export', { format, multiple: true });
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

    function renderEditor(snippet) {
        if (!isActive()) return;
        const isNew = !snippet;
        state.editingId = snippet ? Number(snippet.id) : null;
        document.getElementById('library-bulk-bar')?.replaceChildren();
        document.getElementById('library-load-more')?.classList.add('hidden');
        const content = document.getElementById('library-content');
        const count = document.getElementById('library-result-count');
        if (!content || !count) return;
        count.textContent = isNew ? 'Neuer Baustein' : 'Baustein bearbeiten';
        content.replaceChildren();
        const editor = document.createElement('div');
        editor.className = 'snippet-editor';
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'snippet-editor-back';
        back.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Zur Baustein-Bibliothek';
        back.addEventListener('click', renderItems);
        const title = document.createElement('h3');
        title.className = 'snippet-editor-title';
        title.textContent = isNew ? 'Neuen Baustein anlegen' : 'Baustein bearbeiten';
        const form = document.createElement('div');
        form.className = 'snippet-editor-grid';
        const main = document.createElement('div');
        const nameLabel = document.createElement('label');
        nameLabel.className = 'ui-label';
        nameLabel.textContent = 'Name';
        const name = document.createElement('input');
        name.className = 'library-input snippet-editor-input';
        name.maxLength = 200;
        name.value = snippet?.name || '';
        const contentLabel = document.createElement('label');
        contentLabel.className = 'ui-label snippet-editor-content-label';
        contentLabel.textContent = 'Baustein-Text';
        const text = document.createElement('textarea');
        text.className = 'snippet-editor-textarea';
        text.maxLength = 50000;
        text.value = snippet?.content || '';
        main.append(nameLabel, name, contentLabel, text);
        const side = document.createElement('div');
        const fieldLabel = document.createElement('label');
        fieldLabel.className = 'ui-label';
        fieldLabel.textContent = 'Einsatzbereich';
        const field = document.createElement('select');
        field.className = 'library-edit-category';
        Object.entries(fieldLabels).forEach(([value, label]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            field.append(option);
        });
        field.value = snippet?.field_id || 'context';
        const meta = document.createElement('div');
        meta.className = 'library-edit-meta snippet-editor-meta';
        meta.append(
            metaBox('Letzte Änderung', isNew ? 'Noch nicht gespeichert' : formatDate(snippet.updated_at)),
            metaBox('Letzte Verwendung', isNew ? 'Noch nicht verwendet' : formatDate(snippet.last_used_at))
        );
        side.append(fieldLabel, field, meta);
        form.append(main, side);
        const actions = document.createElement('div');
        actions.className = 'library-edit-actions';
        const save = editAction(isNew ? 'Baustein anlegen' : 'Änderungen speichern', 'fa-floppy-disk', () => saveEditor(snippet, name, text, field));
        save.classList.add('snippet-editor-save');
        actions.append(save);
        if (!isNew) {
            actions.append(
                editAction('Duplizieren', 'fa-clone', () => duplicateSnippet(snippet.id)),
                editAction(snippet.archived_at ? 'Wiederherstellen' : 'Archivieren', snippet.archived_at ? 'fa-rotate-left' : 'fa-box-archive', () => archiveSnippet(snippet.id, Boolean(snippet.archived_at))),
                editAction('Markdown', 'fa-file-arrow-down', () => exportSnippet(snippet, 'markdown')),
                editAction('JSON', 'fa-file-code', () => exportSnippet(snippet, 'json')),
                editAction('Löschen', 'fa-trash', () => deleteSnippet(snippet.id), true)
            );
        }
        editor.append(back, title, form, actions);
        content.append(editor);
        requestAnimationFrame(() => name.focus());
        track('snippet_library_edit', { creating: isNew });
    }

    async function saveEditor(existing, nameInput, contentInput, fieldSelect) {
        const name = nameInput.value.trim();
        const content = contentInput.value.trim();
        const fieldId = fieldSelect.value;
        if (!name || !content) return window.showToast?.('Name und Baustein-Text sind Pflichtfelder.', 'info');
        const mode = fieldId === 'free' ? 'free' : 'structured';
        if (!existing) {
            const result = await db.saveSnippet({ name, content, mode, field_id: fieldId });
            if (!result.success) {
                if (result.reason === 'FREE_LIMIT_REACHED') window.openUpgradeModal?.('library_full');
                else window.showToast?.('Baustein konnte nicht angelegt werden.', 'error');
                return;
            }
            track('snippet_library_create', { field_id: fieldId });
        } else {
            const success = await db.updateSnippet(existing.id, { name, content, mode, field_id: fieldId });
            if (!success) return window.showToast?.('Baustein konnte nicht gespeichert werden.', 'error');
            track('snippet_library_update', { field_id: fieldId });
        }
        window.showToast?.(existing ? 'Baustein wurde gespeichert.' : 'Baustein wurde angelegt.', 'success');
        await refreshAll();
        window.refreshSnippetSurfaces?.();
    }

    async function duplicateSnippet(id) {
        const result = await db.duplicateSnippet(id);
        if (!result.success) {
            if (result.reason === 'FREE_LIMIT_REACHED') window.openUpgradeModal?.('library_full');
            else window.showToast?.('Baustein konnte nicht dupliziert werden.', 'error');
            return;
        }
        track('snippet_library_duplicate');
        await refreshAll();
        window.refreshSnippetSurfaces?.();
        renderEditor(result.snippet);
    }

    async function archiveSnippet(id, restore) {
        const result = await db.updateSnippetMetadata(id, { archivedAt: restore ? null : new Date().toISOString() });
        if (!result.success) return window.showToast?.('Archivstatus konnte nicht geändert werden.', 'error');
        track('snippet_library_archive', { restore });
        await refreshAll();
        window.refreshSnippetSurfaces?.();
    }

    async function deleteSnippet(id) {
        const confirmed = await askConfirmation('Baustein endgültig löschen?', 'Der Baustein wird unwiderruflich aus deiner Bibliothek gelöscht.');
        if (!confirmed) return;
        const success = await db.deleteSnippet(id);
        if (!success) return window.showToast?.('Baustein konnte nicht gelöscht werden.', 'error');
        track('snippet_library_delete');
        await refreshAll();
        window.refreshSnippetSurfaces?.();
    }

    function exportSnippet(snippet, format) {
        if (format === 'markdown') {
            const markdown = [
                `# ${snippet.name}`,
                `Einsatzbereich: ${fieldLabels[snippet.field_id] || 'Baustein'}`,
                '',
                snippet.content
            ].join('\n') + '\n';
            downloadFile(`${safeFilename(snippet.name)}.md`, markdown, 'text/markdown');
        } else {
            const payload = {
                name: snippet.name,
                content: snippet.content,
                fieldId: snippet.field_id,
                createdAt: snippet.created_at,
                updatedAt: snippet.updated_at
            };
            downloadFile(`${safeFilename(snippet.name)}.json`, JSON.stringify(payload, null, 2), 'application/json');
        }
        track('snippet_library_export', { format, multiple: false });
    }

    async function open() {
        localStorage.setItem(CONTENT_KEY, 'snippets');
        configureShell();
        bindControls();
        track('library_open', { content_type: 'snippets' });
        await reloadItems();
    }

    async function refreshAll() {
        if (!isActive()) return;
        configureShell();
        await reloadItems();
    }

    window.SnippetLibrary = { open, refreshAll };
})();
