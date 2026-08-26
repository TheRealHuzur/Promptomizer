const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const app = read('app.html');
const styles = read('styles.css');

const functionSource = name => {
    const start = app.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `app.html misses ${name}()`);
    const next = app.indexOf('\n        function ', start + 1);
    return app.slice(start, next === -1 ? app.length : next);
};

const inlineScripts = [...app.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(script => script.trim());

assert(inlineScripts.length >= 2, 'expected the inline app scripts');
inlineScripts.forEach((script, index) => {
    new vm.Script(script, { filename: `app-inline-${index + 1}.js` });
});

for (const level of ['h1', 'h2', 'h3']) {
    assert(app.includes(`data-format="${level}"`), `free editor misses ${level.toUpperCase()}`);
}

assert(app.includes("const match = /^H([1-3])$/.exec(element?.tagName || '');"));
assert(app.includes("const headings = Array.from(editor.querySelectorAll('h1, h2, h3'));"));
assert(app.includes('if (siblingLevel && siblingLevel <= level) break;'));
assert(app.includes("editor.querySelectorAll('.free-heading-toggle').forEach(toggle => {"));
assert(app.includes("heading.classList.toggle('free-heading-collapsed');"));
assert(app.includes("toggle.setAttribute('contenteditable', 'false');"));
assert(app.includes("toggle.setAttribute('aria-expanded', String(!collapsed));"));
assert(app.includes("if (node.classList.contains('free-heading-toggle')) return '';"));
assert(app.includes("if (/^#{1,3}\\s+/m.test(text)) {"));
assert(app.includes('insertFreeMarkdownAtCursor(editor, text, range);'));
assert(!app.includes('insertFreeMarkdownAtCursor(editor, `# ${text}`'));

const shortcut = functionSource('handleFreeHeadingMarkdownShortcut');
assert(shortcut.includes("ev.key !== ' '"));
assert(shortcut.includes("!['DIV', 'P'].includes(block.tagName)"));
assert(shortcut.includes('getFreeHeadingShortcutLevel(prefixRange.toString())'));
assert(shortcut.includes('document.createElement(`h${level}`)'));
assert(shortcut.includes("editor.dispatchEvent(new Event('input', { bubbles: true }))"));

const paste = functionSource('handleFreePaste');
assert(paste.includes('insertFreeMarkdownAtCursor(editor, text, range);'));
assert(!paste.includes('insertTextAtCursor('));

assert(styles.includes('#input-free .free-collapsible-heading {'));
assert(styles.includes('#input-free .free-heading-toggle:focus-visible {'));
assert(styles.includes('#input-free .free-heading-hidden {\n    display: none !important;'));

console.log('free editor folding source smoke: ok');
