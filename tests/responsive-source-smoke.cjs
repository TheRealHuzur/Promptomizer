const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const app = read('app.html');
const styles = read('styles.css');
const libraryStyles = read('library.css');
const snippetStyles = read('snippet-library.css');

const viewportTags = app.match(/<meta\s+name=["']viewport["'][^>]*>/gi) || [];
assert.equal(viewportTags.length, 1, 'app.html needs exactly one viewport meta tag');
assert.match(viewportTags[0], /width=device-width/i);
assert.match(viewportTags[0], /initial-scale=1(?:\.0)?/i);
assert.match(viewportTags[0], /viewport-fit=cover/i);
assert.doesNotMatch(viewportTags[0], /maximum-scale/i);
assert.doesNotMatch(viewportTags[0], /user-scalable\s*=\s*no/i);

for (const id of [
    'app-header',
    'header-bg',
    'header-spacer-left',
    'app-body',
    'mobile-nav-toggle',
    'mobile-nav-backdrop',
    'header-main-controls',
    'header-content',
    'app-logo',
    'sidebar-left',
    'main-scroll-area',
    'editor-footer',
    'editor-actions-container',
    'footer-primary-actions',
    'free-format-toolbar',
    'free-format-actions',
    'btn-free-save-snippet'
]) {
    assert(app.includes(`id="${id}"`), `app.html misses responsive hook #${id}`);
}

assert(app.includes('style="left: var(--sidebar-current-w);"'));
assert(styles.includes('--sidebar-w: 16rem;'));
assert(styles.includes('--sidebar-w-collapsed: 4rem;'));
assert(styles.includes('body.sidebar-collapsed {\n    --sidebar-current-w: var(--sidebar-w-collapsed);'));
assert(styles.includes('#sidebar-left {\n    position: fixed;'));
assert(styles.includes('#header-spacer-left {\n    width: var(--sidebar-current-w);'));
assert(styles.includes('#app-body {\n    margin-left: var(--sidebar-current-w);'));
assert(app.includes("document.body.classList.add('sidebar-collapsed')"));
assert(app.includes("document.body.classList.remove('sidebar-collapsed')"));
assert(styles.includes('@media (max-width: 1023px)'));
assert(styles.includes('--safe-area-top: env(safe-area-inset-top, 0px);'));
assert(styles.includes('--safe-area-bottom: env(safe-area-inset-bottom, 0px);'));
assert(styles.includes('height: 100vh;\n        height: 100dvh;'));
assert(styles.includes('#header-bg {\n        left: 0 !important;'));
assert(styles.includes('#header-spacer-left {\n        width: 0;'));
assert(styles.includes('#app-body {\n        width: 100%;'));
assert(styles.includes('margin-left: 0;'));
assert(styles.includes('overscroll-behavior: contain;'));
assert(app.includes('aria-controls="sidebar-left" aria-expanded="false"'));
assert(app.includes('class="mobile-nav-backdrop hidden"'));
assert(app.includes("const mobileNavMedia = window.matchMedia('(max-width: 1023px)')"));
assert(app.includes("document.body.classList.add('mobile-nav-open')"));
assert(app.includes("document.body.classList.remove('mobile-nav-open')"));
assert(app.includes("sidebar.inert = !isOpen"));
assert(app.includes("if (ev.key === 'Escape' && document.body.classList.contains('mobile-nav-open'))"));
assert(app.includes("if (isMobileNavViewport()) closeMobileNav();"));
assert(app.includes("if (inserted && isMobileNavViewport()) closeMobileNav();"));
assert(styles.includes('body.mobile-nav-open #sidebar-left'));
assert(styles.includes('transform: translateX(-100%);'));
assert(styles.includes('transform: translateX(0);'));
assert(styles.includes('.mobile-nav-backdrop:not(.hidden)'));
assert(styles.includes('height: 2.75rem;\n        pointer-events: auto;'));
assert(app.includes('class="editor-field group relative"'));
assert(app.includes('class="editor-field-action group'));
assert(app.includes('window.visualViewport?.height || window.innerHeight'));
assert(styles.includes('#header-main-controls {'));
assert(styles.includes('#mode-toggle-container button {\n        min-height: 2.75rem;'));
assert(styles.includes('#main-scroll-area {\n        padding: clamp(1rem, 3vw, 1.5rem);'));
assert(styles.includes('#free-format-actions {'));
assert(styles.includes('overflow-x: auto;'));
assert(styles.includes('.editor-field-action,\n    #btn-free-save-snippet,\n    .free-format-btn'));
assert(styles.includes('@media (max-width: 359px)'));
assert(styles.includes('#editor-footer {\n        box-sizing: border-box;\n        height: auto;'));
assert(styles.includes('calc(.625rem + var(--safe-area-bottom))'));
assert(styles.includes('#editor-actions-container {\n        display: grid;'));
assert(styles.includes('#footer-primary-actions {\n        display: contents;'));
assert(styles.includes('#btn-reset {\n        grid-column: 1 / -1;'));
assert(styles.includes('#library-create-content {\n        grid-column: 1 / -1;'));
assert(!app.includes("localStorage.setItem('promptomizer_mobile"));

const projectStylesheets = {
    'styles.css': styles,
    'library.css': libraryStyles,
    'snippet-library.css': snippetStyles
};

for (const [file, css] of Object.entries(projectStylesheets)) {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const queries = [...withoutComments.matchAll(/@media\s*([^\{]+)\{/gi)]
        .map(match => match[1].trim());

    for (const query of queries) {
        const maxWidths = [...query.matchAll(/max-width\s*:\s*(\d+(?:\.\d+)?)px/gi)]
            .map(match => Number(match[1]));
        assert(maxWidths.length > 0, `${file} has an unbounded media query: ${query}`);
        assert(
            maxWidths.every(width => width <= 1023),
            `${file} media query crosses the desktop boundary: ${query}`
        );
    }
}

assert(libraryStyles.includes('.library-grid'));
assert(libraryStyles.includes('.library-edit-grid'));
assert(snippetStyles.includes('.snippet-editor-grid'));
assert(libraryStyles.includes('@media (max-width: 1023px)'));
assert(libraryStyles.includes('@media (max-width: 639px)'));
assert(libraryStyles.includes('.library-toolbar {\n        grid-template-columns: repeat(2, minmax(0, 1fr));'));
assert(libraryStyles.includes('.library-categories {\n        display: flex;'));
assert(libraryStyles.includes('.library-list-row {\n        grid-template-columns: 2rem minmax(0, 1fr) 2.75rem;'));
assert(snippetStyles.includes('.snippet-library-row > :nth-child(5)'));
assert(!app.includes("localStorage.setItem('promptomizer_mobile_library"));
assert(libraryStyles.includes('.library-edit-grid {\n        grid-template-columns: minmax(0, 1fr);'));
assert(libraryStyles.includes('.library-edit-description,\n    .library-edit-category {\n        font-size: 1rem;'));
assert(snippetStyles.includes('.snippet-editor-grid {\n        grid-template-columns: minmax(0, 1fr);'));
assert(snippetStyles.includes('.snippet-editor-input,\n    .snippet-editor-textarea {\n        font-size: 1rem;'));
assert(snippetStyles.includes('.snippet-target-options {\n        grid-template-columns: minmax(0, 1fr);'));
assert(styles.includes('/* Mobile Phase 7: Dialoge, Menüs, Versionsverlauf und Nebenansichten. */'));
assert(styles.includes('#modal-prompt-versions > .ui-modal {'));
assert(styles.includes('#prompt-versions-content > .grid {\n        grid-template-columns: minmax(0, 1fr) !important;'));
assert(styles.includes('#snippet-item-menu,\n    #prompt-item-menu,'));
assert(styles.includes('#view-history,\n    #view-settings,\n    #view-konto,'));
assert(styles.includes('.driver-popover {\n        box-sizing: border-box !important;'));
assert(app.includes('const appModalCloseHandlers = Object.freeze({'));
assert(app.includes('function initAppModalAccessibility()'));
assert(app.includes("element.inert = hasOpenModal"));
assert(app.includes("event.stopImmediatePropagation();"));
assert(app.includes('function initAppPopupAccessibility()'));
assert(app.includes("const mobileTour = isMobileNavViewport();"));
assert(app.includes("element: '#mobile-nav-toggle'"));
assert(app.includes("element: '#sidebar-prompts-btn'"));
assert(app.includes('onclick="openPromptCategorySubmenu(); return false;"'));
assert(app.includes('onclick="openManageSnippetTargetSubmenu(); return false;"'));
assert(app.includes('class="history-card '));

console.log('responsive source smoke: ok');
