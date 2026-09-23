const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const app = read('app.html');
const data = read('kollektionen.js');
const collections = read('collections.js');
const css = read('collections.css');

// Einbindung: Daten vor Modul, beides nach library.js (switchView-Wrapper-Kette), CSS eigenständig.
assert(app.includes('href="collections.css"'));
assert(app.indexOf('src="library.js"') < app.indexOf('src="kollektionen.js"'));
assert(app.indexOf('src="snippet-library.js"') < app.indexOf('src="kollektionen.js"'));
assert(app.indexOf('src="kollektionen.js"') < app.indexOf('src="collections.js"'));

// Minimaler DOM-Ersatz für die Sandbox.
class FakeNode {
    constructor(tag, text) {
        this.tagName = tag;
        this.nodeValue = text ?? null;
        this.children = [];
        this.className = '';
        this._text = text ?? '';
    }
    append(...nodes) { this.children.push(...nodes); }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() {
        if (this.tagName === '#text') return this.nodeValue;
        return this.children.length ? this.children.map(child => child.textContent).join('') : this._text;
    }
}

const sandbox = {
    console,
    window: { addEventListener() {} },
    document: {
        getElementById: () => null,
        querySelectorAll: () => [],
        createElement: tag => new FakeNode(tag),
        createTextNode: text => new FakeNode('#text', text)
    }
};
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(data, sandbox);
vm.runInContext(`window.structuredPromptToText = s => s.fields.filter(Boolean).join('\\n\\n');`, sandbox);
vm.runInContext(collections, sandbox);

const list = sandbox.window.PROMPTOMIZER_COLLECTIONS;
assert(Array.isArray(list) && list.length > 0, 'Mindestens eine Kollektion');

const collectionIds = new Set();
const promptIds = new Set();
list.forEach(collection => {
    assert(typeof collection.id === 'string' && collection.id, 'Kollektion braucht id');
    assert(!collectionIds.has(collection.id), `Doppelte Kollektions-id ${collection.id}`);
    collectionIds.add(collection.id);
    assert(typeof collection.title === 'string' && collection.title.trim(), 'Kollektion braucht title');
    assert(Array.isArray(collection.prompts) && collection.prompts.length > 0, 'Kollektion braucht Prompts');
    collection.prompts.forEach(prompt => {
        assert(typeof prompt.id === 'string' && prompt.id, 'Prompt braucht id');
        assert(!promptIds.has(prompt.id), `Doppelte Prompt-id ${prompt.id}`);
        promptIds.add(prompt.id);
        assert(typeof prompt.title === 'string' && prompt.title.trim(), 'Prompt braucht title');
        assert(prompt.title.length <= 200, 'Prompttitel zu lang');
        const fields = prompt.fields || {};
        if (fields.mode === 'free') {
            assert(typeof fields.text === 'string' && fields.text.trim(), `Freier Prompt ${prompt.id} ohne Text`);
        } else {
            const values = ['role', 'context', 'task', 'format'].map(key => fields[key]);
            assert(values.every(value => value === undefined || typeof value === 'string'), `Ungültige Felder in ${prompt.id}`);
            assert(values.some(value => typeof value === 'string' && value.trim()), `Strukturierter Prompt ${prompt.id} ohne Inhalt`);
        }
    });
});

const api = sandbox.window.PromptCollections;
assert(api, 'window.PromptCollections fehlt');

// Speicherformat wie in der Bibliothek.
const structured = api.toStorageFields({ fields: { role: 'R', context: 'K', task: 'A', format: 'F' } });
assert.deepEqual(Array.from(structured), ['R', 'K', 'A', '', 'F']);
const free = api.toStorageFields({ fields: { mode: 'free', text: 'Zeile 1\r\nZeile 2 [Angabe]' } });
assert.deepEqual({ ...free }, { mode: 'free', text: 'Zeile 1\nZeile 2 [Angabe]' });

// Platzhalter-Erkennung.
const sample = 'Anrede: [Anrede: du/Sie]-Form, [viel/wenig], [Handlung oder „nichts“]. Link [Text](https://x.de), Checkbox [ ] und [x], [Person A].';
assert.deepEqual(
    Array.from(api.findPlaceholders(sample), item => item.text),
    ['[Anrede: du/Sie]', '[viel/wenig]', '[Handlung oder „nichts“]', '[Person A]']
);
assert.equal(api.findPlaceholders('Ohne Platzhalter.').length, 0);
assert.equal(api.findPlaceholders('[a\nb]').length, 0);

// Hervorhebung per DOM-API, Text bleibt vollständig und unverändert.
const container = new FakeNode('pre');
api.appendHighlightedText(container, 'Für [Zielgruppe] schreiben: [einfügen]');
assert.equal(container.textContent, 'Für [Zielgruppe] schreiben: [einfügen]');
const marks = container.children.filter(child => child.tagName === 'span');
assert.equal(marks.length, 2);
assert(marks.every(mark => mark.className === 'collections-placeholder'));

// Kopiertext = Vorschautext, frei unverändert.
assert.equal(api.promptText({ fields: { mode: 'free', text: 'A [B]' } }), 'A [B]');

// Übernahme: vorhandene Wege, Limit-Vorprüfung, Upgrade-Modal, Anmeldung.
assert(collections.includes('window.db.saveScenario('));
assert(collections.includes("window.openUpgradeModal?.('library_full')"));
assert(collections.includes('window.openAuthModal?.()'));
assert(collections.includes('await window.db.getPromptCount()'));
assert(collections.includes("result.reason === 'FREE_LIMIT_REACHED'"));

// Kopieren: vorhandene Kopierlogik, ohne Speichern, Anmeldung oder Upgrade.
const copyStart = collections.indexOf('async function copyPrompt(');
const copyEnd = collections.indexOf('\n    function init()', copyStart);
assert(copyStart > 0 && copyEnd > copyStart);
const copyBody = collections.slice(copyStart, copyEnd);
assert(copyBody.includes('await window.copyTextToClipboard(text)'));
assert(copyBody.includes("window.showToast?.('Prompt kopiert', 'success')"));
assert(!copyBody.includes('saveScenario'));
assert(!copyBody.includes('openAuthModal'));
assert(!copyBody.includes('openUpgradeModal'));
assert(!copyBody.includes('markScenarioUsed'));

// XSS: kein innerHTML im Modul.
assert(!collections.includes('innerHTML'));

// View-Integration.
assert(collections.includes("item.dataset.appView = 'collections'"));
assert(collections.includes("view.id = 'view-collections'"));
assert(collections.includes('__collectionsPatched'));
assert(collections.includes("'In meine Bibliothek übernehmen'"));
assert(collections.includes("'ui-btn ui-btn-primary collections-adopt-button'"));

// CSS: eigene Klassen inkl. Platzhalter mit Hintergrund und Rahmen.
assert(css.includes('.collections-placeholder'));
assert(/\.collections-placeholder\s*\{[^}]*border:[^}]*background:/s.test(css));
assert(css.includes('@media (max-width: 1023px)'));

console.log('collections-source-smoke: ok');
