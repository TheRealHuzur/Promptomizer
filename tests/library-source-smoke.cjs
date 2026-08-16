const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const app = read('app.html');
const db = read('db.js');
const library = read('library.js');
const css = read('library.css');
const migration = read('supabase/migrations/20260811190825_library_v2.sql');
const promptCreatePage = read('prompt-erstellen.html');
const promptTemplatesPage = read('prompt-vorlagen.html');
const officeUseCasePage = read('prompt-vorlagen/buero.html');

assert(app.includes('href="library.css"'));
assert(app.includes('src="library.js"'));
assert(app.indexOf('src="db.js"') < app.indexOf('src="library.js"'));
assert(db.includes('window.db.getClient = () => supabaseClient'));
assert(app.includes("window.db.getClient().from('library')"));
assert(!app.includes('window.db.supabase'));

assert(library.includes("history.parentElement.insertBefore(item, history)"));
assert(library.includes("view.id = 'view-library'"));
assert(library.includes("const PAGE_SIZE = 24"));
assert(library.includes("button.innerHTML = '<i class=\"fa-solid fa-copy\"></i>'"));
assert(library.includes("button.setAttribute('aria-label', 'In Zwischenablage kopieren')"));
assert(library.includes('function makeEditorButton(prompt)'));
assert(library.includes("button.setAttribute('aria-label', 'Im Editor öffnen')"));
assert(library.includes('fa-file-import'));
assert(library.includes('footer.append(makeEditorButton(prompt), makeCopyButton(prompt))'));
assert(library.includes("window.showToast?.('Prompt kopiert', 'success')"));
assert(library.includes('await window.copyTextToClipboard(text)'));
assert(library.includes("track('library_prompt_copy')"));
assert(library.includes("console.warn('Library usage update failed:'"));
assert(library.includes("await window.handlePromptClick?.(id, { openEditor: true, markUsed: true })"));
assert(library.includes("track('library_prompt_open_editor')"));
assert(library.includes(".map(term => `${term.toLocaleLowerCase('de-DE')}:*`)"));
assert(library.includes('id="library-create-content"') === false);
assert(library.includes("label.textContent = contentType === 'snippets' ? 'Neuer Baustein' : 'Neuer Prompt'"));
assert(library.includes('function renderCreatePrompt()'));
assert(library.includes("type.innerHTML = '<option value=\"structured\">Strukturiert</option><option value=\"free\">Frei</option>'"));
assert(!library.includes('Dein Prompt-Bestand'));
assert(!library.includes('Finde bewährte Prompts wieder'));
assert(library.includes("state.viewMode === 'cards' ? buildCard(prompt) : buildListRow(prompt)"));
assert(!library.includes('fa-ellipsis'));
assert(!library.includes('window.confirm('));
assert(library.includes("modal.setAttribute('aria-modal', 'true')"));

assert(css.includes('.library-grid'));
assert(!library.includes('Kategorie umbenennen'));
assert(!library.includes('Kategorie löschen'));
assert(!library.includes("editAction('Kopieren'"));
assert(library.includes("editorFooter.classList.toggle('hidden', viewId !== 'editor' && viewId !== 'library')"));
assert(library.includes("handler.includes('openEditorFromNavigation')"));

assert(app.includes('id="editor-footer"'));
assert(app.includes('id="library-create-content"'));
assert(app.includes('onclick="handleFooterCopy()"'));
assert(app.includes('async function copyTextToClipboard(text)'));
assert(app.includes('function copyTextWithLegacySelection(value)'));
assert(app.includes('window.copyTextToClipboard = copyTextToClipboard'));
assert(app.includes("document.execCommand('copy')"));
assert(app.includes('await copyTextToClipboard(finalText)'));
assert(app.includes("'format': '📋 FORMAT'"));
assert(app.includes("format: '📋 FORMAT'"));
assert(!app.includes('ðŸ'));
assert(app.includes("norm.includes('VARIANTEN') || norm.includes('FORMAT')"));
assert(library.includes("format: '📋 FORMAT'"));
assert(promptCreatePage.includes("format:'📋 FORMAT'"));
assert.strictEqual((promptTemplatesPage.match(/\*\*📋 FORMAT\*\*/g) || []).length, 5);
assert.strictEqual((officeUseCasePage.match(/\*\*📋 FORMAT\*\*/g) || []).length, 6);
assert(!promptTemplatesPage.includes('🧪 VARIANTEN'));
assert(!officeUseCasePage.includes('🧪 VARIANTEN'));
assert(app.includes("classList.toggle('hidden', Boolean(promptEditSession))"));
assert(app.includes('onclick="openEditorFromNavigation()"'));
assert(app.includes("switchView('library')"));
assert(!app.includes('>Bearbeitung beenden</button>'));
assert(css.includes('grid-template-columns: repeat(3, minmax(0, 1fr))'));
assert(css.includes('.library-view button:focus-visible'));
assert(css.includes('.library-editor-button'));
assert(css.includes('gap: .5rem'));
assert(css.includes('box-shadow: 0 0 0 1px #38bdf8'));
assert(css.includes('.library-card {\n    display: flex;'));
assert(css.includes('.library-card-body {\n    display: flex;\n    flex: 1;'));
assert(css.includes('justify-content: flex-end;\n    margin-top: auto;'));
assert(app.includes('id="prompt-edit-footer-spacer"'));
assert(css.includes('#view-editor.prompt-edit-active #prompt-edit-footer-spacer'));
assert(css.includes('flex: 0 0 3rem;'));
assert(css.includes('#view-editor.prompt-edit-active #input-free'));
assert(css.includes('resize: vertical'));
assert(!css.includes('radial-gradient'));
assert(!css.includes('linear-gradient'));
assert(!css.includes('@media'));

for (const column of ['category_id', 'description', 'is_favorite', 'last_used_at', 'archived_at', 'search_vector']) {
  assert(migration.includes(column), `migration misses ${column}`);
}
assert(migration.includes('library_search_vector_idx'));
assert(migration.includes('security invoker'));
assert(migration.includes('with check ((select auth.uid()) = user_id)'));

console.log('library source smoke: ok');
