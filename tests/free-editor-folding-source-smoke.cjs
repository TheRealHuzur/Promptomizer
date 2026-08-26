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
    const candidates = [
        app.indexOf('\n        function ', start + 1),
        app.indexOf('\n        async function ', start + 1)
    ].filter(index => index !== -1);
    const next = candidates.length ? Math.min(...candidates) : -1;
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
for (const level of ['h4', 'h5', 'h6']) {
    assert(!app.includes(`data-format="${level}"`), `live toolbar must stay limited to H1-H3`);
}

assert(app.includes("const match = /^H([1-6])$/.exec(element?.tagName || '');"));
assert(app.includes("const headings = Array.from(editor.querySelectorAll('h1, h2, h3, h4, h5, h6'));"));
assert(app.includes('if (siblingLevel && siblingLevel <= level) break;'));
assert(app.includes("editor.querySelectorAll('.free-heading-toggle').forEach(toggle => {"));
assert(app.includes('function ensureFreeHeadingEditableContent(heading)'));
assert(app.includes("heading.appendChild(document.createElement('br'));"));
assert(app.includes("heading.classList.toggle('free-heading-collapsed');"));
assert(app.includes("toggle.setAttribute('contenteditable', 'false');"));
assert(app.includes("toggle.setAttribute('aria-expanded', String(!collapsed));"));
assert(app.includes("if (node.classList.contains('free-heading-toggle')) return '';"));
assert(app.includes("if (/^#{1,6}\\s+/m.test(normalizedText)) {"));
assert(app.includes('insertFreeMarkdownAtCursor(editor, text, range);'));
assert(!app.includes('insertFreeMarkdownAtCursor(editor, `# ${text}`'));

const shortcut = functionSource('handleFreeHeadingMarkdownShortcut');
assert(shortcut.includes("ev.key !== ' '"));
assert(shortcut.includes("!['DIV', 'P'].includes(block.tagName)"));
assert(shortcut.includes('getFreeHeadingShortcutLevel(prefixRange.toString())'));
assert(shortcut.includes('document.createElement(`h${level}`)'));
assert(shortcut.includes('ensureFreeHeadingEditableContent(heading)'));
assert(shortcut.includes("editor.dispatchEvent(new Event('input', { bubbles: true }))"));

const keydown = functionSource('handleFreeEditorKeydown');
assert(keydown.includes("collapsedHeading?.classList.contains('free-heading-collapsed') && !ev.shiftKey"));
assert(keydown.includes("collapsedHeading.classList.remove('free-heading-collapsed');"));
assert(keydown.includes('insertFreeParagraphAfterHeading(collapsedHeading);'));
assert(keydown.includes("const emptyHeading = getClosestTag(anchor, ['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);"));
assert(keydown.includes('!getFreeHeadingText(emptyHeading).trim()'));
assert(keydown.includes('insertFreeParagraphAfterHeading(emptyHeading);'));

const paragraphAfterHeading = functionSource('insertFreeParagraphAfterHeading');
assert(paragraphAfterHeading.includes('heading.parentNode.insertBefore(nextBlock, heading.nextSibling);'));
assert(paragraphAfterHeading.includes('placeCaretAtStart(nextBlock);'));

const paste = functionSource('handleFreePaste');
assert(paste.includes('insertFreeMarkdownAtCursor(editor, text, range);'));
assert(!paste.includes('insertTextAtCursor('));

const normalizeSnippetHeadings = vm.runInNewContext(`(${functionSource('normalizeFreeSnippetHeadings')})`);
assert.equal(
    normalizeSnippetHeadings('# Persona Power User\n## Eigenschaften', 2),
    '### Persona Power User\n#### Eigenschaften'
);
assert.equal(normalizeSnippetHeadings('# Dokumenttitel', 0), '# Dokumenttitel');
assert.equal(
    normalizeSnippetHeadings('```\n# Code bleibt Code\n```\n# Persona', 2),
    '```\n# Code bleibt Code\n```\n### Persona'
);
assert.equal(
    normalizeSnippetHeadings('# Tief\n#### Sehr tief', 4),
    '##### Tief\n###### Sehr tief'
);

const snippetInsert = functionSource('insertSnippetText');
assert(snippetInsert.includes('getFreeInsertionContextHeadingLevel(editor, range)'));
assert(snippetInsert.includes('normalizeFreeSnippetHeadings(text, contextLevel)'));
assert(snippetInsert.includes("showToast('Bausteinüberschriften wurden an die Gliederung angepasst.'"));
assert(snippetInsert.includes('insertFreeMarkdownAtCursor(editor, normalizedText, range);'));

const markdownToHtml = vm.runInNewContext(`(${functionSource('freeMarkdownToHtml')})`, {
    escapeHtml: value => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
});
assert.equal(markdownToHtml('#### Ebene 4\n\n###### Ebene 6'), '<h4>Ebene 4</h4><h6>Ebene 6</h6>');

assert(styles.includes('#input-free .free-collapsible-heading {'));
assert(styles.includes('min-height: 1.5em;'));
assert(styles.includes('#input-free .free-heading-toggle:focus-visible {'));
assert(styles.includes('#input-free .free-heading-hidden {\n    display: none !important;'));
for (const level of ['h4', 'h5', 'h6']) {
    assert(styles.includes(`#input-free ${level} {`), `styles.css misses ${level.toUpperCase()}`);
}

console.log('free editor folding source smoke: ok');
