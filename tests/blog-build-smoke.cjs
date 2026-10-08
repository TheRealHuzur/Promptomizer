// Regression für tools/build-blog.cjs: Drift zwischen tools/blog-artikel.js und den
// ausgelieferten Blogseiten, Aufbau mit Beispielartikeln, leerer Blog, Datenprüfung.
// Aufruf: node tests/blog-build-smoke.cjs
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BUILD = path.join(ROOT, 'tools', 'build-blog.cjs');
const FIXTURE = path.join(__dirname, 'fixtures', 'blog-artikel.beispiel.js');

function build(data, out) {
    return spawnSync(process.execPath, [BUILD, '--data', data, '--out', out], { encoding: 'utf8' });
}

function tmpOut() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-smoke-'));
    fs.copyFileSync(path.join(ROOT, 'sitemap.xml'), path.join(dir, 'sitemap.xml'));
    return dir;
}

function jsonLd(html) {
    return [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m => JSON.parse(m[1]));
}

function sitemapBlock(xml) {
    const m = xml.match(/<!-- BLOG:START[^\n]*-->([\s\S]*?)<!-- BLOG:END -->/);
    assert.ok(m, 'Sitemap-Marker fehlen');
    return [...m[1].matchAll(/<loc>([^<]+)<\/loc>/g)].map(x => x[1]);
}

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const dirs = [];

try {
    // 1. Drift: Repo-Stand entspricht exakt dem, was der Generator aus tools/blog-artikel.js erzeugt
    {
        const out = tmpOut(); dirs.push(out);
        const r = build(path.join(ROOT, 'tools', 'blog-artikel.js'), out);
        ok(r.status === 0, 'Build aus tools/blog-artikel.js fehlgeschlagen: ' + r.stderr);
        const files = ['blog.html', ...(fs.existsSync(path.join(out, 'blog')) ? fs.readdirSync(path.join(out, 'blog')).map(f => 'blog/' + f) : [])];
        files.forEach(f => ok(fs.existsSync(path.join(ROOT, f)) && fs.readFileSync(path.join(ROOT, f), 'utf8') === fs.readFileSync(path.join(out, f), 'utf8'),
            f + ' weicht vom Generator ab, bitte node tools/build-blog.cjs ausführen'));
        ok(sitemapBlock(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8')).join() === sitemapBlock(fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8')).join(),
            'Blog-Block in sitemap.xml veraltet');
        const repoBlog = path.join(ROOT, 'blog');
        const extra = fs.existsSync(repoBlog) ? fs.readdirSync(repoBlog).filter(f => !files.includes('blog/' + f)) : [];
        ok(extra.length === 0, 'Verwaiste Dateien in blog/: ' + extra.join(', '));
    }

    // 2. Beispielartikel aus dem Handoff
    {
        const out = tmpOut(); dirs.push(out);
        const r = build(FIXTURE, out);
        ok(r.status === 0, 'Build mit Beispielartikeln fehlgeschlagen: ' + r.stderr);
        const ov = fs.readFileSync(path.join(out, 'blog.html'), 'utf8');
        ok(!/name="robots"/.test(ov), 'Übersicht mit Artikeln darf kein noindex tragen');
        ok(ov.includes('<link rel="canonical" href="https://www.promptomizer.de/blog">'), 'Canonical der Übersicht');
        const cards = [...ov.matchAll(/<a class="bl-card( bl-feat)?" href="([^"]+)"/g)];
        ok(cards.length === 6, 'Sechs Kacheln erwartet');
        ok(cards[0][1] && cards.slice(1).every(c => !c[1]), 'Nur die erste Kachel ist hervorgehoben');
        ok(cards.map(c => c[2]).join() === ['prompts-strukturieren', 'bausteine-wiederverwenden', 'prompt-generator-vs-editor', 'bibliothek-ordnen', 'ausgabeformat-festlegen', 'versionen-vergleichen'].map(s => '/blog/' + s).join(),
            'Kacheln nach Datum absteigend');
        const filters = [...ov.matchAll(/data-filter="([^"]*)"/g)].map(m => m[1]);
        ok(filters.join() === ',Grundlagen,Praxis,Hintergrund,Funktionen', 'Filter: Alle + Kategorien in Reihenfolge des Auftretens');
        ok(ov.includes('06.10.2026 · </span>1 Min. Lesezeit'), 'Datum und Lesezeit in der hervorgehobenen Kachel');
        const ovLd = jsonLd(ov);
        ok(ovLd.length === 1 && ovLd[0]['@graph'][1].blogPost.length === 6, 'Blog-JSON-LD mit sechs Beiträgen');

        const art = fs.readFileSync(path.join(out, 'blog', 'bausteine-wiederverwenden.html'), 'utf8');
        ok(art.includes('<title>Bausteine: einmal schreiben, oft verwenden | Promptomizer</title>'), 'Artikel-Titel');
        ok(art.includes('<link rel="canonical" href="https://www.promptomizer.de/blog/bausteine-wiederverwenden">'), 'Artikel-Canonical');
        ok(art.includes('<blockquote>Ein guter Baustein'), 'Inhalt wird unverändert übernommen');
        ok((art.match(/class="bl-row"/g) || []).length === 3, 'Drei Weiterlesen-Zeilen');
        ok(!art.includes('href="/blog/bausteine-wiederverwenden"></a>') && !/class="bl-row" href="\/blog\/bausteine-wiederverwenden"/.test(art), 'Weiterlesen ohne den eigenen Artikel');
        const post = jsonLd(art)[0]['@graph'][1];
        ok(post['@type'] === 'BlogPosting' && post.author.url === 'https://www.promptomizer.de/autor/patrick-rosskothen', 'BlogPosting mit Autorenseite');

        const ver = fs.readFileSync(path.join(out, 'blog', 'versionen-vergleichen.html'), 'utf8');
        ok(jsonLd(ver)[0]['@graph'][1].dateModified === '2026-09-30', 'aktualisiert wird zu dateModified');

        const urls = sitemapBlock(fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8'));
        ok(urls.length === 7 && urls[0] === 'https://www.promptomizer.de/blog', 'Sitemap: Übersicht + sechs Artikel');
        ok(fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8').includes('<lastmod>2026-10-06</lastmod>\n        <changefreq>weekly</changefreq>'), 'Sitemap-lastmod der Übersicht = neuester Stand');

        // Zweiter Lauf ändert nichts
        const r2 = build(FIXTURE, out);
        ok(r2.status === 0 && !/neu |aktualisiert /.test(r2.stdout), 'Zweiter Lauf ist idempotent');
    }

    // 3. Leerer Blog
    {
        const out = tmpOut(); dirs.push(out);
        const data = path.join(out, 'leer.js');
        fs.writeFileSync(data, 'window.BLOG_ARTIKEL = [];\n');
        const r = build(data, out);
        ok(r.status === 0, 'Build ohne Artikel fehlgeschlagen');
        const ov = fs.readFileSync(path.join(out, 'blog.html'), 'utf8');
        ok(ov.includes('<meta name="robots" content="noindex, follow">'), 'Leere Übersicht ist noindex');
        ok(!ov.includes('bl-grid') && !ov.includes('bl-filter') && ov.includes('bl-empty'), 'Leere Übersicht zeigt Hinweis statt Raster/Filter');
        ok(sitemapBlock(fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8')).length === 0, 'Leere Übersicht fehlt in der Sitemap');
    }

    // 4. Datenprüfung bricht ohne Schreiben ab
    {
        const out = tmpOut(); dirs.push(out);
        const data = path.join(out, 'kaputt.js');
        fs.writeFileSync(data, `window.BLOG_KATEGORIEN = ['Praxis'];
window.BLOG_ARTIKEL = [
  { slug: 'Gross', titel: 'T', kategorie: 'Praxis', datum: '2026-02-30', autor: 'A', auszug: 'x', inhalt: '<p>a</p>' },
  { slug: 'ok', titel: 'T', kategorie: 'Andere', datum: '2026-01-01', autor: 'A', auszug: 'x', inhalt: '<p>a<img src=x></p><script>x</script>' },
  { slug: 'ok', titel: 'T', kategorie: 'Praxis', datum: '2026-01-01', autor: 'A', auszug: 'x', inhalt: '<p>a</p>' }
];
`);
        const r = build(data, out);
        ok(r.status === 1, 'Ungültige Daten müssen mit Fehler enden');
        ['slug fehlt oder ist ungültig', 'datum fehlt', 'steht nicht in BLOG_KATEGORIEN', 'nicht erlaubte Tags im Inhalt: img, script', 'slug doppelt']
            .forEach(t => ok(r.stderr.includes(t), 'Fehlermeldung fehlt: ' + t));
        ok(!fs.existsSync(path.join(out, 'blog.html')), 'Bei Fehlern wird nichts geschrieben');
    }
} finally {
    dirs.forEach(d => fs.rmSync(d, { recursive: true, force: true }));
}

console.log(`blog-build-smoke: ${checks} Prüfungen bestanden.`);
