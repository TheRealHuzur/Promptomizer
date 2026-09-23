// Kollektionen: öffentliche Prompt-Sammlungen ansehen, kopieren und einzeln in die eigene Bibliothek übernehmen.
// Daten kommen statisch aus kollektionen.js (window.PROMPTOMIZER_COLLECTIONS), es gibt keine DB-Tabelle dafür.
// Übernahme = unabhängige Kopie über db.saveScenario (Free-Limit greift serverseitig), Kopieren ist frei.
(function () {
    'use strict';

    // Platzhalter: eckige Klammern mit freiem Text auf einer Zeile, z. B. [Angabe] oder [Anrede: du/Sie].
    // Ausgenommen sind Markdown-Links [Text](url) und Checkboxen [ ] / [x].
    const PLACEHOLDER_PATTERN = /\[([^[\]\n]+)\](?!\()/g;

    const state = {
        collectionId: null,
        openPreviews: new Set(),
        adoptedPromptIds: new Set(),
        busyPromptIds: new Set()
    };

    function getCollections() {
        return Array.isArray(window.PROMPTOMIZER_COLLECTIONS) ? window.PROMPTOMIZER_COLLECTIONS : [];
    }

    function findCollection(id) {
        return getCollections().find(collection => collection.id === id) || null;
    }

    function findPlaceholders(text) {
        const value = String(text ?? '');
        const matches = [];
        PLACEHOLDER_PATTERN.lastIndex = 0;
        let match;
        while ((match = PLACEHOLDER_PATTERN.exec(value)) !== null) {
            const inner = match[1].trim();
            if (!inner || /^x$/i.test(inner)) continue;
            matches.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
        }
        return matches;
    }

    function isFreeCollectionPrompt(prompt) {
        return prompt?.fields?.mode === 'free';
    }

    // Speicherformat der Bibliothek: strukturiert [role, context, task, '', format], frei { mode: 'free', text }.
    function toStorageFields(prompt) {
        const fields = prompt?.fields || {};
        if (isFreeCollectionPrompt(prompt)) {
            return { mode: 'free', text: String(fields.text ?? '').replace(/\r\n/g, '\n') };
        }
        return [
            String(fields.role ?? ''),
            String(fields.context ?? ''),
            String(fields.task ?? ''),
            '',
            String(fields.format ?? '')
        ];
    }

    // Derselbe Text für Vorschau, Kopieren und Bibliothek: strukturiert über structuredPromptToText aus app.html.
    function promptText(prompt) {
        const fields = toStorageFields(prompt);
        if (!Array.isArray(fields)) return fields.text;
        if (typeof window.structuredPromptToText === 'function') {
            return window.structuredPromptToText({ fields });
        }
        return '';
    }

    function appendHighlightedText(container, text) {
        const value = String(text ?? '');
        let cursor = 0;
        findPlaceholders(value).forEach(placeholder => {
            if (placeholder.start > cursor) {
                container.append(document.createTextNode(value.slice(cursor, placeholder.start)));
            }
            const mark = document.createElement('span');
            mark.className = 'collections-placeholder';
            mark.textContent = placeholder.text;
            container.append(mark);
            cursor = placeholder.end;
        });
        if (cursor < value.length) container.append(document.createTextNode(value.slice(cursor)));
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function icon(name) {
        const node = document.createElement('i');
        node.className = `fa-solid ${name}`;
        node.setAttribute('aria-hidden', 'true');
        return node;
    }

    function setButtonContent(button, iconName, label) {
        button.replaceChildren(icon(iconName), element('span', '', label));
    }

    function promptCountLabel(count) {
        return count === 1 ? '1 Prompt' : `${count} Prompts`;
    }

    function createNavItem() {
        if (document.getElementById('nav-collections')) return;
        const library = document.getElementById('nav-library');
        if (!library?.parentElement) return;

        const item = document.createElement('div');
        item.id = 'nav-collections';
        item.dataset.appView = 'collections';
        item.className = library.className;
        item.classList.remove('active-nav');
        item.setAttribute('role', 'button');
        item.tabIndex = 0;

        const indicator = element('span', 'nav-indicator absolute left-0 top-0 bottom-0 w-[3px] bg-brand-sky');
        const navIcon = icon('fa-layer-group');
        navIcon.className += ' w-5 text-center group-hover:text-brand-sky transition-colors';
        const label = element('span', 'nav-label text-sm font-medium', 'Kollektionen');
        item.append(indicator, navIcon, label);

        item.addEventListener('click', () => window.switchView('collections'));
        item.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            window.switchView('collections');
        });
        library.after(item);
    }

    function createView() {
        if (document.getElementById('view-collections')) return;
        const main = document.getElementById('main-scroll-area');
        const history = document.getElementById('view-history');
        if (!main || !history) return;

        const view = document.createElement('div');
        view.id = 'view-collections';
        view.className = 'hidden collections-view fade-in';
        main.insertBefore(view, history);
    }

    function patchViewSwitching() {
        if (!window.switchView || window.switchView.__collectionsPatched) return;
        const original = window.switchView;
        const wrapped = function (viewId) {
            if (viewId !== 'collections') document.getElementById('view-collections')?.classList.add('hidden');
            original(viewId);
            if (viewId === 'collections') {
                document.getElementById('mode-toggle-container')?.classList.add('hidden');
                render();
            }
        };
        wrapped.__collectionsPatched = true;
        window.switchView = wrapped;
    }

    function scrollToTop() {
        const main = document.getElementById('main-scroll-area');
        if (main) main.scrollTop = 0;
    }

    function render() {
        const view = document.getElementById('view-collections');
        if (!view) return;
        const collection = state.collectionId ? findCollection(state.collectionId) : null;
        if (collection) renderDetail(view, collection);
        else renderOverview(view);
    }

    function renderHero(title, subtitle) {
        const hero = element('div', 'collections-hero');
        const heading = element('h2', 'library-title', title);
        heading.id = 'collections-heading';
        heading.tabIndex = -1;
        hero.append(heading);
        if (subtitle) hero.append(element('p', 'library-subtitle', subtitle));
        return hero;
    }

    function renderOverview(view) {
        state.collectionId = null;
        const collections = getCollections();
        const hero = renderHero('Kollektionen', 'Fertige Prompts zu einem Thema. Direkt kopieren oder in deine Bibliothek übernehmen und dort an deine Situation anpassen.');

        if (!collections.length) {
            view.replaceChildren(hero, element('p', 'collections-empty', 'Derzeit sind keine Kollektionen verfügbar.'));
            return;
        }

        const grid = element('div', 'collections-grid');
        collections.forEach(collection => {
            const count = Array.isArray(collection.prompts) ? collection.prompts.length : 0;
            const card = element('button', 'collections-card');
            card.type = 'button';
            card.dataset.collectionId = collection.id;
            card.append(
                element('span', 'collections-card-count', promptCountLabel(count)),
                element('span', 'collections-card-title', collection.title),
                element('span', 'collections-card-benefit', collection.benefit || '')
            );
            card.addEventListener('click', () => openCollection(collection.id));
            grid.append(card);
        });
        view.replaceChildren(hero, grid);
    }

    function openCollection(id) {
        state.collectionId = id;
        render();
        scrollToTop();
        document.getElementById('collections-heading')?.focus();
    }

    function closeCollection() {
        const previousId = state.collectionId;
        state.collectionId = null;
        render();
        scrollToTop();
        const card = Array.from(document.querySelectorAll('.collections-card'))
            .find(item => item.dataset.collectionId === previousId);
        card?.focus();
    }

    function renderDetail(view, collection) {
        const back = element('button', 'collections-back');
        back.type = 'button';
        setButtonContent(back, 'fa-arrow-left', 'Alle Kollektionen');
        back.addEventListener('click', closeCollection);

        const hero = renderHero(collection.title, collection.benefit || '');
        const list = element('div', 'collections-prompt-list');
        (collection.prompts || []).forEach(prompt => list.append(buildPromptItem(prompt)));
        view.replaceChildren(back, hero, list);
    }

    function buildPromptItem(prompt) {
        const item = element('article', 'collections-prompt');
        item.dataset.promptId = prompt.id;

        const title = element('h3', 'collections-prompt-title', prompt.title);
        item.append(title);
        if (prompt.purpose) item.append(element('p', 'collections-prompt-purpose', prompt.purpose));

        if (Array.isArray(prompt.inputs) && prompt.inputs.length) {
            const inputs = element('div', 'collections-prompt-inputs');
            inputs.append(element('span', 'collections-prompt-inputs-label', 'Du brauchst:'));
            const inputList = element('ul');
            prompt.inputs.forEach(input => inputList.append(element('li', '', input)));
            inputs.append(inputList);
            item.append(inputs);
        }

        const previewId = `collections-preview-${prompt.id}`;
        const isOpen = state.openPreviews.has(prompt.id);
        const toggle = element('button', 'collections-preview-toggle');
        toggle.type = 'button';
        toggle.setAttribute('aria-expanded', String(isOpen));
        toggle.setAttribute('aria-controls', previewId);
        setButtonContent(toggle, isOpen ? 'fa-chevron-down' : 'fa-chevron-right', isOpen ? 'Vorschau ausblenden' : 'Vorschau anzeigen');

        const preview = element('pre', 'collections-preview');
        preview.id = previewId;
        preview.hidden = !isOpen;
        appendHighlightedText(preview, promptText(prompt));

        toggle.addEventListener('click', () => {
            const open = preview.hidden;
            preview.hidden = !open;
            if (open) state.openPreviews.add(prompt.id);
            else state.openPreviews.delete(prompt.id);
            toggle.setAttribute('aria-expanded', String(open));
            setButtonContent(toggle, open ? 'fa-chevron-down' : 'fa-chevron-right', open ? 'Vorschau ausblenden' : 'Vorschau anzeigen');
        });

        const actions = element('div', 'collections-prompt-actions');
        actions.append(buildAdoptButton(prompt), buildCopyButton(prompt));
        item.append(toggle, preview, actions);
        return item;
    }

    function renderAdoptButtonState(button, prompt) {
        if (state.adoptedPromptIds.has(prompt.id)) {
            button.classList.add('is-adopted');
            setButtonContent(button, 'fa-check', 'Übernommen · Zur Bibliothek');
        } else {
            button.classList.remove('is-adopted');
            setButtonContent(button, 'fa-file-import', 'In meine Bibliothek übernehmen');
        }
    }

    function buildAdoptButton(prompt) {
        const button = element('button', 'ui-btn ui-btn-primary collections-adopt-button');
        button.type = 'button';
        renderAdoptButtonState(button, prompt);
        button.addEventListener('click', () => {
            if (state.adoptedPromptIds.has(prompt.id)) {
                window.switchView?.('library');
                return;
            }
            adoptPrompt(prompt, button);
        });
        return button;
    }

    async function adoptPrompt(prompt, button) {
        if (state.busyPromptIds.has(prompt.id)) return;
        if (!window.currentUser) {
            window.openAuthModal?.();
            return;
        }

        state.busyPromptIds.add(prompt.id);
        button.disabled = true;
        try {
            const tier = await window.db.getUserTier();
            if (tier === 'free') {
                const count = await window.db.getPromptCount();
                if (count >= 10) {
                    window.openUpgradeModal?.('library_full');
                    return;
                }
            }

            const result = await window.db.saveScenario({
                name: prompt.title,
                fields: toStorageFields(prompt),
                category: null
            });

            if (!result.success) {
                if (result.reason === 'FREE_LIMIT_REACHED') window.openUpgradeModal?.('library_full');
                else if (result.reason === 'NOT_LOGGED_IN') window.openAuthModal?.();
                else window.showToast?.('Prompt konnte nicht übernommen werden. Bitte erneut versuchen.', 'error');
                return;
            }

            state.adoptedPromptIds.add(prompt.id);
            renderAdoptButtonState(button, prompt);
            window.showToast?.(`„${prompt.title}“ wurde in deine Bibliothek übernommen.`, 'success');
            try {
                await window.loadLibrary?.();
                await window.updatePromptCounter?.();
            } catch (error) {
                console.warn('Collections: library refresh after adopt failed:', error);
            }
        } catch (error) {
            console.error('Collections: adopt failed:', error);
            window.showToast?.('Prompt konnte nicht übernommen werden. Bitte erneut versuchen.', 'error');
        } finally {
            state.busyPromptIds.delete(prompt.id);
            button.disabled = false;
        }
    }

    function buildCopyButton(prompt) {
        const button = element('button', 'collections-copy-button');
        button.type = 'button';
        setButtonContent(button, 'fa-copy', 'Kopieren');
        button.addEventListener('click', () => copyPrompt(prompt, button));
        return button;
    }

    // Wie der Kopierbutton der Bibliothek (library.js copyPrompt), aber ohne Nutzungsdatum:
    // Kopieren legt nichts an, braucht keine Anmeldung und zählt nicht auf das Free-Limit.
    async function copyPrompt(prompt, button) {
        const text = promptText(prompt);
        if (!text.trim()) {
            window.showToast?.('Dieser Prompt enthält noch keinen kopierbaren Inhalt.', 'info');
            return;
        }

        try {
            await window.copyTextToClipboard(text);
        } catch (error) {
            console.error('Collections: prompt copy failed:', error);
            window.showToast?.('Prompt konnte nicht kopiert werden.', 'error');
            return;
        }

        setButtonContent(button, 'fa-check', 'Kopiert');
        button.classList.add('is-copied');
        setTimeout(() => {
            setButtonContent(button, 'fa-copy', 'Kopieren');
            button.classList.remove('is-copied');
        }, 1600);
        window.showToast?.('Prompt kopiert', 'success');
    }

    function init() {
        createNavItem();
        createView();
        patchViewSwitching();
        window.addEventListener('auth-state-changed', () => {
            state.adoptedPromptIds.clear();
            if (!document.getElementById('view-collections')?.classList.contains('hidden')) render();
        });
    }

    window.PromptCollections = {
        findPlaceholders,
        toStorageFields,
        promptText,
        appendHighlightedText,
        open: () => window.switchView?.('collections')
    };

    init();
})();
