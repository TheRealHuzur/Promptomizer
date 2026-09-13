const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const contract = require(path.join(root, 'extension/contract.js'));

// --- promptToText: dieselben drei Speicherformen wie extractStructuredFields/promptToText in der App.

const structuredArray = { prompt_type: 'structured', fields: ['Du bist Redakteur', 'Firma X', 'Schreibe eine Mail', '', 'Kurz und knapp'] };
assert.equal(
    contract.promptToText(structuredArray),
    '**🎭 ROLLE**\nDu bist Redakteur\n\n**🌍 KONTEXT**\nFirma X\n\n**🎯 AUFGABE**\nSchreibe eine Mail\n\n**📋 FORMAT**\nKurz und knapp'
);

// Index 3 ist das historische, leere style-Feld und darf nie im Text landen.
const withStyle = { prompt_type: 'structured', fields: ['R', 'K', 'A', 'STIL-TEXT', 'F'] };
assert.ok(!contract.promptToText(withStyle).includes('STIL-TEXT'));
assert.equal(contract.promptToText(withStyle), '**🎭 ROLLE**\nR\n\n**🌍 KONTEXT**\nK\n\n**🎯 AUFGABE**\nA\n\n**📋 FORMAT**\nF');

const structuredObject = { prompt_type: 'structured', fields: { mode: 'structured', fields: { role: '  R  ', context: '', task: 'T', format: '   ' } } };
assert.equal(contract.promptToText(structuredObject), '**🎭 ROLLE**\nR\n\n**🎯 AUFGABE**\nT');

const structuredObjectArray = { prompt_type: 'structured', fields: { mode: 'structured', fields: ['R', '', 'A', '', ''] } };
assert.equal(contract.promptToText(structuredObjectArray), '**🎭 ROLLE**\nR\n\n**🎯 AUFGABE**\nA');

const flatObject = { fields: { role: '', context: 'K', task: '', format: 'F' } };
assert.equal(contract.promptToText(flatObject), '**🌍 KONTEXT**\nK\n\n**📋 FORMAT**\nF');

assert.equal(contract.promptToText({ prompt_type: 'free', fields: { mode: 'free', text: 'Hallo Welt' } }), 'Hallo Welt');
assert.equal(contract.promptToText({ fields: { text: 'X' } }), 'X');
assert.equal(contract.promptToText({ prompt_type: 'free', fields: null }), '');
assert.equal(contract.promptToText({ prompt_type: 'structured', fields: null }), '');
assert.equal(contract.promptToText(null), '');
assert.equal(contract.promptToText(undefined), '');

assert.equal(contract.snippetToText({ content: 'abc' }), 'abc');
assert.equal(contract.snippetToText({}), '');
assert.equal(contract.snippetToText(null), '');

// --- Präfixsuche: Tokenizer wie prefixSearchQuery, Semantik "a:* & b:*".

assert.equal(contract.prefixSearchQuery('E-Mail Vorlage 2'), 'e:* & mail:* & vorlage:* & 2:*');
assert.equal(contract.prefixSearchQuery('  '), '');
assert.equal(contract.prefixSearchQuery(null), '');
assert.equal(contract.prefixSearchQuery('Straße ÄÖ'), 'straße:* & äö:*');

assert.deepEqual(contract.searchTerms('E-Mail Vorlage 2'), ['e', 'mail', 'vorlage', '2']);
assert.deepEqual(contract.searchTerms(''), []);

const tokens = contract.searchTerms('Betreff E-Mail Vorlage');
assert.equal(contract.matchesSearch(tokens, 'ma'), true);
assert.equal(contract.matchesSearch(tokens, 'e-mail vor'), true);
assert.equal(contract.matchesSearch(tokens, 'mail x'), false);
assert.equal(contract.matchesSearch(tokens, 'ail'), false, 'nur Präfixtreffer, kein Infix');
assert.equal(contract.matchesSearch(tokens, ''), true);
assert.equal(contract.matchesSearch([], 'a'), false);

const promptTokens = contract.promptSearchTokens({ name: 'Newsletter', description: 'Monatlich', category: 'Marketing', fields: { mode: 'free', text: 'Schreibe Texte' } });
for (const term of ['newsletter', 'monatlich', 'marketing', 'schreibe', 'texte']) assert.ok(promptTokens.includes(term), term);
assert.deepEqual(contract.snippetSearchTokens({ name: 'Ton', content: 'Freundlich, klar' }), ['ton', 'freundlich', 'klar']);

// --- Sortierung wie getLibraryPrompts / getLibrarySnippets.

const unsorted = [
    { id: 1, is_favorite: false, last_used_at: null, updated_at: '2026-09-01T00:00:00Z' },
    { id: 2, is_favorite: true, last_used_at: null, updated_at: '2026-08-01T00:00:00Z' },
    { id: 3, is_favorite: false, last_used_at: '2026-09-10T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 4, is_favorite: false, last_used_at: '2026-09-12T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 5, is_favorite: false, last_used_at: null, updated_at: '2026-09-01T00:00:00Z' },
    { id: 6, is_favorite: true, last_used_at: '2026-09-11T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
];
assert.deepEqual([...unsorted].sort(contract.compareLibraryOrder).map(item => item.id), [6, 2, 4, 3, 5, 1]);

// --- Drift-Guard: Die drei Vertragsfunktionen müssen zeichengleich mit library.js sein.

function extractFunction(source, name) {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `Funktion ${name} nicht gefunden`);
    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, index + 1);
        }
    }
    throw new Error(`Funktion ${name} unvollständig`);
}

function normalize(snippet) {
    return snippet.split(/\r?\n/).map(line => line.trim()).join('\n');
}

const libraryJs = fs.readFileSync(path.join(root, 'library.js'), 'utf8');
const contractJs = fs.readFileSync(path.join(root, 'extension/contract.js'), 'utf8');
for (const name of ['prefixSearchQuery', 'structuredValues', 'promptToText']) {
    assert.equal(
        normalize(extractFunction(contractJs, name)),
        normalize(extractFunction(libraryJs, name)),
        `extension/contract.js: ${name} weicht von library.js ab – nachziehen (CLAUDE.md §7a)`
    );
}

console.log('extension contract smoke: ok');
