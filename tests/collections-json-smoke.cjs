// kollektionen.json (Datenquelle der Chrome-Extension) muss zu kollektionen.js passen und
// mit CORS-Header öffentlich ausgeliefert werden. Nach Kollektionsänderungen:
// node tools/build-kollektionen-json.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const { buildJson, loadCollections } = require(path.join(root, 'tools/build-kollektionen-json.cjs'));

assert.ok(fs.existsSync(path.join(root, 'kollektionen.json')), 'kollektionen.json fehlt: node tools/build-kollektionen-json.cjs');
assert.equal(read('kollektionen.json'), buildJson(), 'kollektionen.json weicht von kollektionen.js ab: node tools/build-kollektionen-json.cjs');

const data = JSON.parse(read('kollektionen.json'));
assert.equal(data.version, 1);
assert.ok(Array.isArray(data.collections) && data.collections.length === loadCollections().length && data.collections.length > 0);
for (const collection of data.collections) {
    assert.equal(typeof collection.id, 'string');
    assert.equal(typeof collection.title, 'string');
    assert.ok(Array.isArray(collection.prompts) && collection.prompts.length > 0, `Kollektion ${collection.id} ohne Prompts`);
    for (const prompt of collection.prompts) {
        assert.equal(typeof prompt.id, 'string');
        assert.equal(typeof prompt.title, 'string');
        assert.ok(prompt.fields && typeof prompt.fields === 'object', `Prompt ${prompt.id} ohne fields`);
    }
}

// Auslieferung: CORS für die Extension, nicht indexieren, nicht durch .vercelignore verdeckt.
const vercel = JSON.parse(read('vercel.json'));
const rule = (vercel.headers || []).find(entry => entry.source === '/kollektionen.json');
assert.ok(rule, 'vercel.json: Header-Regel für /kollektionen.json fehlt');
const header = key => rule.headers.find(entry => entry.key.toLowerCase() === key.toLowerCase())?.value;
assert.equal(header('Access-Control-Allow-Origin'), '*');
assert.equal(header('X-Robots-Tag'), 'noindex');
const ignore = read('.vercelignore').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
for (const pattern of ignore) {
    assert.ok(!['*.json', 'kollektionen.json', '/kollektionen.json', 'kollektionen*'].includes(pattern), `.vercelignore verdeckt kollektionen.json (${pattern})`);
}
assert.ok(read('extension/popup.js').includes("'https://www.promptomizer.de/kollektionen.json'"), 'Extension lädt eine andere Adresse');

console.log('collections json smoke: ok');
