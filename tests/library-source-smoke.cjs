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

assert(app.includes('href="library.css"'));
assert(app.includes('src="library.js"'));
assert(app.indexOf('src="db.js"') < app.indexOf('src="library.js"'));
assert(db.includes('window.db.getClient = () => supabaseClient'));
assert(app.includes("window.db.getClient().from('library')"));
assert(!app.includes('window.db.supabase'));

assert(library.includes("history.parentElement.insertBefore(item, history)"));
assert(library.includes("view.id = 'view-library'"));
assert(library.includes("const PAGE_SIZE = 24"));
assert(library.includes("button.innerHTML = '<i class=\"fa-solid fa-file-import\"></i>'"));
assert(library.includes("button.setAttribute('aria-label', 'Im Editor verwenden')"));
assert(library.includes("state.viewMode === 'cards' ? buildCard(prompt) : buildListRow(prompt)"));
assert(!library.includes('fa-ellipsis'));
assert(!library.includes('window.confirm('));
assert(library.includes("modal.setAttribute('aria-modal', 'true')"));

assert(css.includes('.library-grid'));
assert(css.includes('grid-template-columns: repeat(3, minmax(0, 1fr))'));
assert(css.includes('.library-view button:focus-visible'));
assert(!css.includes('@media'));

for (const column of ['category_id', 'description', 'is_favorite', 'last_used_at', 'archived_at', 'search_vector']) {
  assert(migration.includes(column), `migration misses ${column}`);
}
assert(migration.includes('library_search_vector_idx'));
assert(migration.includes('security invoker'));
assert(migration.includes('with check ((select auth.uid()) = user_id)'));

console.log('library source smoke: ok');
