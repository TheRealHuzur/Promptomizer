#!/usr/bin/env node
// Schreibt die Prompt-Texte aus kollektionen.js als statischen Fallback in die Seiten,
// die Kollektions-Prompts zeigen (<pre data-collection-prompt="<prompt-id>">).
//
// Im Browser ersetzt die Seite diesen Text beim Laden ohnehin durch den aktuellen
// Kollektionstext. Der Fallback ist für Suchmaschinen, KI-Crawler und Besucher ohne
// JavaScript da und sollte nach jeder Kollektionsänderung nachgezogen werden:
//
//   node tools/sync-collection-pages.cjs          Fallback aktualisieren
//   node tools/sync-collection-pages.cjs --check  nur prüfen (Exit 1 bei Abweichung)
//
// tests/collection-pages-smoke.cjs prüft dasselbe ohne zu schreiben.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PAGES = ['prompt-vorlagen/verwaltung.html'];
const PRE_PATTERN = /(<pre\b[^>]*\bdata-collection-prompt="([^"]+)"[^>]*>)([\s\S]*?)(<\/pre>)/g;

function loadCollections() {
    const sandbox = {};
    const source = fs.readFileSync(path.join(ROOT, 'kollektionen.js'), 'utf8');
    new Function('window', source)(sandbox);
    return Array.isArray(sandbox.PROMPTOMIZER_COLLECTIONS) ? sandbox.PROMPTOMIZER_COLLECTIONS : [];
}

// Dieselbe Regel wie im Seitenskript: nur freie Prompts haben einen fertigen Text.
function collectionPromptText(collections, promptId) {
    for (const collection of collections) {
        const prompt = (collection.prompts || []).find(item => item.id === promptId);
        if (!prompt) continue;
        if (prompt.fields?.mode !== 'free' || typeof prompt.fields.text !== 'string') {
            throw new Error(`Kollektions-Prompt "${promptId}" ist kein freier Prompt; die Seite kann ihn nicht anzeigen.`);
        }
        return prompt.fields.text.replace(/\r\n/g, '\n');
    }
    throw new Error(`Kollektions-Prompt "${promptId}" existiert nicht in kollektionen.js.`);
}

const escapeHtml = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unescapeHtml = value => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// Liefert für jede Seite den aktualisierten Inhalt und die abweichenden Prompt-ids.
function syncPages() {
    const collections = loadCollections();
    return PAGES.map(page => {
        const file = path.join(ROOT, page);
        const html = fs.readFileSync(file, 'utf8');
        // Zeilenende der Datei beibehalten (Windows-Checkout: CRLF); der Browser liest beides als \n.
        const eol = html.includes('\r\n') ? '\r\n' : '\n';
        const stale = [];
        let count = 0;
        const updated = html.replace(PRE_PATTERN, (match, open, promptId, current, close) => {
            count++;
            const text = collectionPromptText(collections, promptId);
            if (unescapeHtml(current).replace(/\r\n/g, '\n') !== text) stale.push(promptId);
            return open + escapeHtml(text).replace(/\n/g, eol) + close;
        });
        return { page, file, html, updated, stale, count };
    });
}

module.exports = { syncPages };

if (require.main === module) {
    const checkOnly = process.argv.includes('--check');
    let failed = false;
    for (const result of syncPages()) {
        if (!result.stale.length) {
            console.log(`${result.page}: ${result.count} Prompts aktuell`);
            continue;
        }
        if (checkOnly) {
            failed = true;
            console.log(`${result.page}: veraltet: ${result.stale.join(', ')}`);
        } else {
            fs.writeFileSync(result.file, result.updated, 'utf8');
            console.log(`${result.page}: aktualisiert: ${result.stale.join(', ')}`);
        }
    }
    if (failed) {
        console.log('\nAktualisieren mit: node tools/sync-collection-pages.cjs');
        process.exit(1);
    }
}
