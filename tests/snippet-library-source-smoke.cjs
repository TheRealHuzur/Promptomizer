const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const app = read('app.html');
const db = read('db.js');
const promptLibrary = read('library.js');
const snippets = read('snippet-library.js');
const css = read('snippet-library.css');
const tailwind = read('vendor/tailwind/tailwind.css');
const migration = read('supabase/migrations/20260812125402_snippet_library_integration.sql');

assert(app.includes('href="snippet-library.css"'));
assert(app.includes('src="snippet-library.js"'));
assert(app.indexOf('src="library.js"') < app.indexOf('src="snippet-library.js"'));
assert(app.includes('onclick="handleFooterCopy()"'));
assert(app.includes('window.insertSnippetFromLibrary'));
assert(app.includes("reason: 'TARGET_REQUIRED'"));
assert(app.includes("suggestedTarget: lastStructuredFieldId || 'context'"));
assert(app.includes('window.refreshSnippetSurfaces'));
assert(app.includes("await window.db?.markSnippetUsed?.(snippetId)"));
assert(app.includes('insertSnippetEncoded(\'${encoded}\',\'${cat.id}\', ${snippet.id})'));

assert(promptLibrary.includes('id="library-content-prompts"'));
assert(promptLibrary.includes('id="library-content-snippets"'));
assert(promptLibrary.includes('promptomizer_library_content'));
assert(promptLibrary.includes('window.SnippetLibrary?.open()'));

assert(snippets.includes('const PAGE_SIZE = 24'));
assert(snippets.includes("const VIEW_KEY = 'promptomizer_snippet_library_view'"));
assert(snippets.includes("button.setAttribute('aria-label', 'Im Editor einfügen')"));
assert(snippets.includes("state.viewMode === 'cards' ? buildCard(snippet) : buildListRow(snippet)"));
assert(snippets.includes("db.getLibrarySnippets(currentQuery())"));
assert(snippets.includes("db.bulkManageSnippets(ids, action, fieldId)"));
assert(snippets.includes('renderEditor(null)'));
assert(snippets.includes("openCreate: () => renderEditor(null)"));
assert(snippets.includes("save.id = 'btn-save-snippet-version'"));
assert(snippets.includes('<span>Neue Version speichern</span>'));
assert(snippets.includes('configureEditorFooter(snippet, name, text, field)'));
assert(snippets.includes('await navigator.clipboard.writeText(content)'));
assert(snippets.includes('function restoreLibraryFooter()'));
assert(snippets.includes("window.showToast?.('Baustein wurde gelöscht.', 'success')"));
assert(!snippets.includes("editAction(isNew ? 'Baustein anlegen' : 'Änderungen speichern'"));
assert(!snippets.includes('Deine wiederverwendbaren Inhalte'));
assert(!snippets.includes('Finde Textbausteine schnell wieder'));
assert(db.includes(".map(term => `${term.toLocaleLowerCase('de-DE')}:*`)"));
assert(!snippets.includes('fa-ellipsis'));
assert(!snippets.includes('window.confirm('));
assert(snippets.includes("modal.className = 'ui-backdrop z-[150] hidden'"));
assert(!snippets.includes('z-[145]'));

assert(tailwind.includes('.z-\\[150\\]'));
for (const method of [
    'getLibrarySnippets',
    'getSnippetLibraryCounts',
    'updateSnippetMetadata',
    'markSnippetUsed',
    'duplicateSnippet',
    'bulkManageSnippets'
]) assert(db.includes(`async ${method}`), `db.js misses ${method}`);

for (const column of ['updated_at', 'is_favorite', 'last_used_at', 'archived_at', 'search_vector']) {
    assert(migration.includes(column), `migration misses ${column}`);
}
assert(migration.includes('snippets_search_vector_idx'));
assert(migration.includes('create trigger enforce_snippet_free_limit'));
assert(migration.includes('from public.library where library.user_id = new.user_id'));
assert(migration.includes('from public.snippets where snippets.user_id = new.user_id'));
assert(migration.includes('security invoker'));
assert(migration.includes('with check ((select auth.uid()) = user_id)'));
assert(migration.includes('revoke all on table public.snippets from authenticated'));
assert(migration.includes('grant update ('));

assert(css.includes('.library-content-toggle'));
assert(css.includes('.snippet-editor'));
assert(css.includes('box-shadow: 0 0 0 1px #38bdf8'));
assert(!css.includes('.snippet-editor input:focus-visible'));
assert(css.includes('.snippet-target-button.is-suggested'));
assert(!css.includes('linear-gradient'));
assert(!css.includes('radial-gradient'));

console.log('snippet library source smoke: ok');
