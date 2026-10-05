const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { syncPages } = require('../tools/sync-collection-pages.cjs');

const root = path.join(__dirname, '..');

// Statischer Fallback entspricht der Kollektion (sonst: node tools/sync-collection-pages.cjs).
for (const result of syncPages()) {
    assert.ok(result.count > 0, `${result.page}: keine Kollektions-Prompts gefunden`);
    assert.deepEqual(result.stale, [], `${result.page}: Fallback veraltet, node tools/sync-collection-pages.cjs ausführen`);
}

// Verwaltungsseite: acht Vorlagen aus „Öffentlicher Dienst“, kollektionen.js vor dem Seitenskript geladen.
const html = fs.readFileSync(path.join(root, 'prompt-vorlagen/verwaltung.html'), 'utf8');
const ids = [...html.matchAll(/data-collection-prompt="([^"]+)"/g)].map(match => match[1]);
assert.equal(ids.length, 8);
assert.equal(new Set(ids).size, 8, 'jede Vorlage nur einmal');
assert.ok(ids.every(id => id.startsWith('oeffentlicher-dienst-')));
const dataScript = html.indexOf('<script src="/kollektionen.js"></script>');
const pageScript = html.indexOf('PROMPTOMIZER_COLLECTIONS');
assert.ok(dataScript > 0 && pageScript > dataScript, 'kollektionen.js muss vor dem Seitenskript geladen werden');

console.log('collection pages smoke ok');
