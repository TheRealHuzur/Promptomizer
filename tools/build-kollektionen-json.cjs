#!/usr/bin/env node
// Erzeugt kollektionen.json aus kollektionen.js für die Chrome-Extension.
//
// Die Seitenleiste lädt die Kollektionen als reine Daten von
// https://www.promptomizer.de/kollektionen.json (CORS-Header in vercel.json) und
// zwischenspeichert sie. So erscheinen neue Kollektionen ohne neues Store-Release,
// und die Extension lädt keinen Code nach. Führend bleibt kollektionen.js:
// nach jeder Kollektionsänderung dieses Skript ausführen und beide Dateien committen.
//
//   node tools/build-kollektionen-json.cjs          kollektionen.json schreiben
//   node tools/build-kollektionen-json.cjs --check  nur prüfen (Exit 1 bei Abweichung)
//
// tests/collections-json-smoke.cjs prüft dasselbe ohne zu schreiben.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TARGET = path.join(ROOT, 'kollektionen.json');

function loadCollections() {
    const sandbox = {};
    const source = fs.readFileSync(path.join(ROOT, 'kollektionen.js'), 'utf8');
    new Function('window', source)(sandbox);
    return Array.isArray(sandbox.PROMPTOMIZER_COLLECTIONS) ? sandbox.PROMPTOMIZER_COLLECTIONS : [];
}

// Feste Form ohne Zeitstempel, damit der Inhalt nur von kollektionen.js abhängt.
function buildJson() {
    return `${JSON.stringify({ version: 1, source: 'kollektionen.js', collections: loadCollections() }, null, 2)}\n`;
}

if (require.main === module) {
    const expected = buildJson();
    const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : null;
    if (process.argv.includes('--check')) {
        if (current !== expected) {
            console.error('kollektionen.json weicht von kollektionen.js ab: node tools/build-kollektionen-json.cjs ausführen.');
            process.exit(1);
        }
        console.log('kollektionen.json ist aktuell.');
    } else if (current === expected) {
        console.log('kollektionen.json ist bereits aktuell.');
    } else {
        fs.writeFileSync(TARGET, expected);
        console.log('kollektionen.json geschrieben.');
    }
}

module.exports = { loadCollections, buildJson };
