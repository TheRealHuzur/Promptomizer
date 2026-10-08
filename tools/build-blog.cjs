#!/usr/bin/env node
/*
    Erzeugt den Blog als statische Seiten aus tools/blog-artikel.js:
      - blog.html            Übersicht unter /blog
      - blog/<slug>.html     je Artikel unter /blog/<slug>
      - Blog-Block in sitemap.xml zwischen den Markern BLOG:START/BLOG:END

    Aufruf aus dem Repo-Root:  node tools/build-blog.cjs
    Optionen (für Tests):      --data <datei>  --out <verzeichnis>

    Umsetzung des Design-Handoffs „Promptomizer Blog“ (Blog.dc.html + README).
    Layout in blog.css, Header/Footer/Grundklassen aus money-page.css.
    Solange kein Artikel existiert, ist die Übersicht noindex und fehlt in der Sitemap.
    Der Generator löscht keine Dateien; verwaiste blog/*.html meldet er nur.
*/
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://www.promptomizer.de';
const OG_IMAGE = SITE + '/assets/og-image.png';
const UMAMI_ID = '5196fd86-1829-472f-8cf3-c31d420aea9c';

// Texte der Übersicht. metaTitel wird ohne Markenzusatz ausgegeben und ist zugleich og:title.
const UEBERSICHT = {
    metaTitel: 'Blog: KI-Prompts schreiben & wiederverwenden',
    beschreibung: 'Anleitungen und Praxisbeispiele zu KI-Prompts: besser schreiben, sinnvoll ordnen und immer wieder einsetzen. Von Promptomizer, Server in Deutschland.',
    h1: 'Das Wissen hinter',
    h1Akzent: 'dem guten Prompt',
    lead: 'Anleitungen, Praxisbeispiele und Hintergründe zu KI-Prompts: wie du sie aufbaust, sammelst und immer wieder einsetzt.',
    leer: 'Hier erscheinen in Kürze die ersten Artikel.',
    cta: {
        h: 'Der nächste gute Prompt',
        akzent: 'bleibt gespeichert.',
        text: 'Bau deinen Prompt im Editor, leg ihn in deiner Bibliothek ab und finde ihn wieder, wenn du ihn brauchst. Server in Deutschland, kein KI-Modell im Hintergrund.',
        button: 'Kostenlos starten'
    }
};

// Schluss-CTA der Artikelseiten (Handoff-Text, ohne Absatz)
const ARTIKEL_CTA = {
    h: 'Setz es direkt',
    akzent: 'in deinem nächsten Prompt um',
    text: '',
    button: 'Jetzt ausprobieren'
};

// Autoren mit eigener Seite; „Promptomizer“ gilt als Organisation
const AUTOREN = {
    'Patrick Roßkothen': SITE + '/autor/patrick-rosskothen'
};

const ERLAUBTE_TAGS = new Set(['h2', 'h3', 'p', 'ul', 'ol', 'li', 'pre', 'blockquote', 'a', 'strong']);

// ---------- Eingabe ----------

function parseArgs(argv) {
    const args = { data: path.join(ROOT, 'tools', 'blog-artikel.js'), out: ROOT };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--data') args.data = path.resolve(argv[++i]);
        else if (argv[i] === '--out') args.out = path.resolve(argv[++i]);
        else throw new Error('Unbekannte Option: ' + argv[i]);
    }
    return args;
}

function loadData(file) {
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
    return {
        artikel: sandbox.window.BLOG_ARTIKEL || [],
        kategorien: sandbox.window.BLOG_KATEGORIEN || null
    };
}

function isDate(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(v + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === v;
}

function validate(data) {
    const errors = [];
    const slugs = new Set();
    if (!Array.isArray(data.artikel)) return ['window.BLOG_ARTIKEL ist keine Liste'];
    if (data.kategorien !== null && !Array.isArray(data.kategorien)) errors.push('window.BLOG_KATEGORIEN ist keine Liste');
    data.artikel.forEach((a, i) => {
        const id = `Artikel ${i + 1} (${a && a.slug || 'ohne slug'})`;
        if (!a || typeof a !== 'object') { errors.push(`${id}: kein Objekt`); return; }
        if (typeof a.slug !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug)) errors.push(`${id}: slug fehlt oder ist ungültig (nur a-z, 0-9, Bindestriche)`);
        else if (slugs.has(a.slug)) errors.push(`${id}: slug doppelt`);
        else slugs.add(a.slug);
        ['titel', 'kategorie', 'autor', 'auszug', 'inhalt'].forEach(f => {
            if (typeof a[f] !== 'string' || !a[f].trim()) errors.push(`${id}: ${f} fehlt`);
        });
        ['titelAkzent', 'metaTitel'].forEach(f => {
            if (a[f] !== undefined && typeof a[f] !== 'string') errors.push(`${id}: ${f} muss Text sein`);
        });
        if (!isDate(a.datum)) errors.push(`${id}: datum fehlt oder ist kein gültiges JJJJ-MM-TT`);
        if (a.aktualisiert !== undefined && !isDate(a.aktualisiert)) errors.push(`${id}: aktualisiert ist kein gültiges JJJJ-MM-TT`);
        if (Array.isArray(data.kategorien) && typeof a.kategorie === 'string' && !data.kategorien.includes(a.kategorie)) {
            errors.push(`${id}: Kategorie „${a.kategorie}“ steht nicht in BLOG_KATEGORIEN`);
        }
        if (typeof a.inhalt === 'string') {
            const fremd = new Set();
            for (const m of a.inhalt.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g)) {
                if (!ERLAUBTE_TAGS.has(m[1].toLowerCase())) fremd.add(m[1]);
            }
            if (fremd.size) errors.push(`${id}: nicht erlaubte Tags im Inhalt: ${[...fremd].join(', ')}`);
        }
    });
    return errors;
}

// ---------- Aufbereitung ----------

function esc(v) {
    return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function jsonLd(obj) {
    return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function prep(a) {
    const words = a.inhalt.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    const [y, m, d] = a.datum.split('-');
    const akzent = (a.titelAkzent || '').trim();
    return {
        ...a,
        titelAkzent: akzent,
        titelVoll: akzent ? `${a.titel.trim()} ${akzent}` : a.titel.trim(),
        url: `${SITE}/blog/${a.slug}`,
        href: `/blog/${a.slug}`,
        datumText: `${d}.${m}.${y}`,
        geaendert: a.aktualisiert || a.datum,
        woerter: words,
        lesezeit: Math.max(1, Math.round(words / 200)) + ' Min. Lesezeit'
    };
}

function titleHtml(a) {
    return esc(a.titel.trim()) + (a.titelAkzent ? ` <span class="mp-sky">${esc(a.titelAkzent)}</span>` : '');
}

function authorLd(name) {
    if (name === 'Promptomizer') return { '@type': 'Organization', name: 'Promptomizer', url: SITE + '/' };
    return AUTOREN[name] ? { '@type': 'Person', name, url: AUTOREN[name] } : { '@type': 'Person', name };
}

// ---------- Bausteine ----------

function head({ title, description, canonical, robots, ogType, ogTitle, extraMeta, ld }) {
    return `<!DOCTYPE html>
<html lang="de" class="dark antialiased">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
${robots ? `  <meta name="robots" content="${robots}">\n` : ''}  <meta name="theme-color" content="#020617"><link rel="canonical" href="${canonical}">
  <meta property="og:type" content="${ogType}"><meta property="og:site_name" content="Promptomizer"><meta property="og:locale" content="de_DE">
  <meta property="og:url" content="${canonical}"><meta property="og:title" content="${esc(ogTitle)}">
  <meta property="og:description" content="${esc(description)}"><meta property="og:image" content="${OG_IMAGE}">${extraMeta || ''}
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(ogTitle)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${OG_IMAGE}">
  <link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"><link rel="manifest" href="/manifest.json">
  <link rel="stylesheet" href="/vendor/tailwind/tailwind.css"><link rel="stylesheet" href="/vendor/fontawesome/css/all.min.css"><link rel="stylesheet" href="/vendor/fonts/inter/inter.css"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/money-page.css"><link rel="stylesheet" href="/blog.css">
  <script type="application/ld+json">${jsonLd(ld)}</script>
  <script defer src="https://cloud.umami.is/script.js" data-website-id="${UMAMI_ID}" data-exclude-hash="true"></script>
</head>
<body>
`;
}

function header(isOverview) {
    return `
<header class="mp-header">
<div class="mp-sec mp-header-row">
<a href="/blog" class="mp-brand" aria-label="Promptomizer Blog"><span>Prompt</span><span class="mp-sky">omizer</span></a>
<button type="button" class="mp-menu-btn" id="mp-menu-btn" aria-label="Menü öffnen" aria-controls="mp-main-nav" aria-expanded="false"><i class="fa-solid fa-bars" aria-hidden="true"></i></button>
<nav class="mp-nav" id="mp-main-nav" aria-label="Hauptnavigation">
<a href="/">Startseite</a>
<a href="/preise">Preise</a>
<a href="/blog" class="bl-nav-active"${isOverview ? ' aria-current="page"' : ''}>Blog</a>
<a href="/app?intent=register" class="ui-btn ui-btn-primary">Kostenlos registrieren</a>
</nav>
</div>
</header>
`;
}

function cta(c) {
    return `
<section class="mp-sec bl-section">
<hr class="mp-rule bl-cta-rule">
<h2 class="mp-h bl-h bl-h-cta mp-w34">${esc(c.h)} <span class="mp-sky mp-sky-block">${esc(c.akzent)}</span></h2>
${c.text ? `<p class="mp-lead mp-w36 mp-mt-175">${esc(c.text)}</p>\n` : ''}<div class="mp-cta-row">
<a href="/app" class="ui-btn ui-btn-primary mp-btn">${esc(c.button)}</a>
</div>
</section>
`;
}

function footer(jahr, withFilter) {
    return `
<footer class="mp-footer bl-footer">
<div class="mp-sec mp-footer-row">
<span class="mp-footer-copy">© ${jahr} Promptomizer</span>
<nav class="mp-nav" aria-label="Fußnavigation">
<a href="/preise">Preise</a>
<a href="/app">Zur App</a>
<a href="/impressum">Impressum</a>
<a href="/datenschutz">Datenschutz</a>
</nav>
</div>
</footer>

<script>
(function () {
    // Mobiles Menü wie auf den Money-Pages
    var btn = document.getElementById('mp-menu-btn');
    var nav = document.getElementById('mp-main-nav');
    if (btn && nav) {
        var setOpen = function (open) {
            nav.classList.toggle('is-open', open);
            btn.setAttribute('aria-expanded', String(open));
            btn.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
            btn.querySelector('i').className = open ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
        };
        btn.addEventListener('click', function () { setOpen(!nav.classList.contains('is-open')); });
        nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    }
${withFilter ? `
    // Kategoriefilter: blendet Kacheln ein/aus, hervorgehoben ist immer der neueste sichtbare Artikel
    var seg = document.getElementById('bl-filter');
    var grid = document.getElementById('bl-grid');
    if (seg && grid) {
        var cards = Array.prototype.slice.call(grid.querySelectorAll('.bl-card'));
        var buttons = Array.prototype.slice.call(seg.querySelectorAll('button[data-filter]'));
        seg.addEventListener('click', function (e) {
            var b = e.target.closest('button[data-filter]');
            if (!b) return;
            var f = b.getAttribute('data-filter');
            buttons.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
            var first = true;
            cards.forEach(function (c) {
                var show = !f || c.getAttribute('data-kategorie') === f;
                c.hidden = !show;
                c.classList.toggle('bl-feat', show && first);
                if (show) first = false;
            });
        });
    }
` : ''}})();
</script>
</body>
</html>
`;
}

function card(a, featured) {
    return `<a class="bl-card${featured ? ' bl-feat' : ''}" href="${a.href}" data-kategorie="${esc(a.kategorie)}">
<div class="bl-card-main">
<div class="bl-card-head">
<span class="bl-badges"><span class="bl-badge bl-badge-type bl-feat-only">Neu</span><span class="bl-badge">${esc(a.kategorie)}</span></span>
<span class="bl-date bl-std-only">${a.datumText}</span>
</div>
<h2 class="bl-card-title">${titleHtml(a)}</h2>
</div>
<div class="bl-card-side">
<p class="bl-card-excerpt">${esc(a.auszug)}</p>
<div class="bl-card-foot">
<span><i class="fa-regular fa-clock bl-std-only" aria-hidden="true"></i><span class="bl-feat-only">${a.datumText} · </span>${a.lesezeit}</span>
<span class="bl-more"><span class="bl-std-only">Lesen</span><span class="bl-feat-only">Weiterlesen</span> <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
</div>
</div>
</a>`;
}

// ---------- Seiten ----------

function overviewPage(all, kategorien, jahr) {
    const canonical = SITE + '/blog';
    const ld = {
        '@context': 'https://schema.org',
        '@graph': [
            { '@type': 'BreadcrumbList', itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Promptomizer', item: SITE + '/' },
                { '@type': 'ListItem', position: 2, name: 'Blog', item: canonical }
            ] },
            { '@type': 'Blog', name: 'Promptomizer Blog', url: canonical, description: UEBERSICHT.beschreibung, inLanguage: 'de-DE',
              publisher: { '@type': 'Organization', name: 'Promptomizer', url: SITE + '/' },
              blogPost: all.map(a => ({ '@type': 'BlogPosting', headline: a.titelVoll, url: a.url, datePublished: a.datum, dateModified: a.geaendert })) }
        ]
    };

    let list;
    if (!all.length) {
        list = `<p class="mp-lead bl-empty">${esc(UEBERSICHT.leer)}</p>`;
    } else {
        const filter = kategorien.length > 1 ? `<div class="bl-filter-row">
<div class="mp-seg bl-filter" id="bl-filter" role="group" aria-label="Artikel nach Kategorie filtern">
<button type="button" data-filter="" aria-pressed="true">Alle</button>
${kategorien.map(k => `<button type="button" data-filter="${esc(k)}" aria-pressed="false">${esc(k)}</button>`).join('\n')}
</div>
</div>
` : '';
        list = `${filter}<div class="bl-grid" id="bl-grid">
${all.map((a, i) => card(a, i === 0)).join('\n')}
</div>`;
    }

    return head({
        title: UEBERSICHT.metaTitel,
        description: UEBERSICHT.beschreibung,
        canonical,
        robots: all.length ? '' : 'noindex, follow',
        ogType: 'website',
        ogTitle: UEBERSICHT.metaTitel,
        ld
    }) + header(true) + `
<main>

<section class="mp-sec bl-hero">
<h1 class="mp-h mp-h1 mp-w42 bl-h">${esc(UEBERSICHT.h1)} <span class="mp-sky mp-sky-block">${esc(UEBERSICHT.h1Akzent)}</span></h1>
<p class="mp-lead mp-w36 mp-mt-25">${esc(UEBERSICHT.lead)}</p>
<p class="bl-byline">Aus der Praxis von <a href="/autor/patrick-rosskothen">Patrick Roßkothen</a>, Entwickler von Promptomizer.</p>
</section>

<div class="mp-sec"><hr class="mp-rule"></div>

<section class="mp-sec bl-list" aria-label="Artikel">
${list}
</section>
${cta(UEBERSICHT.cta)}
</main>
` + footer(jahr, all.length > 0 && kategorien.length > 1);
}

function articlePage(a, all, jahr) {
    const weitere = all.filter(x => x.slug !== a.slug).slice(0, 3);
    const ld = {
        '@context': 'https://schema.org',
        '@graph': [
            { '@type': 'BreadcrumbList', itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Promptomizer', item: SITE + '/' },
                { '@type': 'ListItem', position: 2, name: 'Blog', item: SITE + '/blog' },
                { '@type': 'ListItem', position: 3, name: a.titelVoll, item: a.url }
            ] },
            { '@type': 'BlogPosting', headline: a.titelVoll, description: a.auszug, url: a.url, mainEntityOfPage: a.url,
              datePublished: a.datum, dateModified: a.geaendert, inLanguage: 'de-DE', articleSection: a.kategorie,
              wordCount: a.woerter, image: OG_IMAGE, author: authorLd(a.autor),
              publisher: { '@type': 'Organization', name: 'Promptomizer', url: SITE + '/' } }
        ]
    };
    const extraMeta = `\n  <meta property="article:published_time" content="${a.datum}"><meta property="article:modified_time" content="${a.geaendert}"><meta property="article:section" content="${esc(a.kategorie)}">`;

    const more = weitere.length ? `
<section class="mp-sec bl-section">
<h2 class="mp-h mp-h2 bl-h bl-more-h">Weiterlesen</h2>
<div class="bl-rows">
${weitere.map(w => `<a class="bl-row" href="${w.href}">
<div>
<div class="bl-row-meta">${esc(w.kategorie)} · ${w.datumText}</div>
<h3 class="bl-row-title">${esc(w.titelVoll)}</h3>
</div>
<i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
</a>`).join('\n')}
</div>
</section>
` : '';

    return head({
        title: (a.metaTitel || a.titelVoll) + ' | Promptomizer',
        description: a.auszug,
        canonical: a.url,
        robots: '',
        ogType: 'article',
        ogTitle: a.metaTitel || a.titelVoll,
        extraMeta,
        ld
    }) + header(false) + `
<main>

<article class="bl-article">
<div class="mp-sec bl-art-hero">
<a href="/blog" class="bl-back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i>Alle Artikel</a>
<p class="mp-num bl-kicker">${esc(a.kategorie)}</p>
<h1 class="mp-h mp-h1 mp-w42 bl-h">${esc(a.titel.trim())}${a.titelAkzent ? ` <span class="mp-sky mp-sky-block">${esc(a.titelAkzent)}</span>` : ''}</h1>
<p class="mp-lead mp-w36 mp-mt-25">${esc(a.auszug)}</p>
<div class="bl-art-meta">
<span><i class="fa-regular fa-calendar" aria-hidden="true"></i><time datetime="${a.datum}">${a.datumText}</time></span>
<span><i class="fa-regular fa-clock" aria-hidden="true"></i>${a.lesezeit}</span>
<span><i class="fa-regular fa-user" aria-hidden="true"></i>${esc(a.autor)}</span>
</div>
</div>
<div class="mp-sec"><hr class="mp-rule"></div>
<div class="mp-sec bl-art-body">
<div class="bl-body">
${a.inhalt.trim()}
</div>
</div>
</article>
${more}${cta(ARTIKEL_CTA)}
</main>
` + footer(jahr, false);
}

// ---------- Sitemap ----------

const SITEMAP_START = '<!-- BLOG:START – automatisch von tools/build-blog.cjs gepflegt, nicht von Hand ändern -->';
const SITEMAP_END = '<!-- BLOG:END -->';

function sitemapBlock(all) {
    const entry = (loc, lastmod, freq, prio) => `    <url>
        <loc>${loc}</loc>
        <lastmod>${lastmod}</lastmod>
        <changefreq>${freq}</changefreq>
        <priority>${prio}</priority>
    </url>
`;
    let body = '';
    if (all.length) {
        const newest = all.map(a => a.geaendert).sort().pop();
        body += entry(SITE + '/blog', newest, 'weekly', '0.7');
        all.forEach(a => { body += entry(a.url, a.geaendert, 'monthly', '0.6'); });
    }
    return `    ${SITEMAP_START}\n${body}    ${SITEMAP_END}`;
}

function updateSitemap(xml, all) {
    const block = sitemapBlock(all);
    const re = /^[ \t]*<!-- BLOG:START[^\n]*-->[\s\S]*?<!-- BLOG:END -->/m;
    if (re.test(xml)) return xml.replace(re, block);
    if (!xml.includes('</urlset>')) throw new Error('sitemap.xml ohne </urlset>');
    return xml.replace('</urlset>', block + '\n</urlset>');
}

// ---------- Ablauf ----------

function writeIfChanged(file, content, log) {
    const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (old === content) { log.push('unverändert  ' + file); return; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    log.push((old === null ? 'neu          ' : 'aktualisiert ') + file);
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const data = loadData(args.data);
    const errors = validate(data);
    if (errors.length) {
        console.error('Blog nicht erzeugt, Fehler in ' + args.data + ':');
        errors.forEach(e => console.error('  - ' + e));
        process.exit(1);
    }

    // Datum absteigend, bei gleichem Datum Reihenfolge der Datei
    const all = data.artikel
        .map((a, i) => ({ a: prep(a), i }))
        .sort((x, y) => y.a.datum.localeCompare(x.a.datum) || x.i - y.i)
        .map(x => x.a);
    const used = [...new Set(all.map(a => a.kategorie))];
    const kategorien = Array.isArray(data.kategorien) ? data.kategorien.filter(k => used.includes(k)) : used;
    const jahr = Math.max(2026, ...all.map(a => Number(a.datum.slice(0, 4))));

    const log = [];
    const rel = f => path.relative(args.out, f);
    writeIfChanged(path.join(args.out, 'blog.html'), overviewPage(all, kategorien, jahr), log);
    all.forEach(a => writeIfChanged(path.join(args.out, 'blog', a.slug + '.html'), articlePage(a, all, jahr), log));

    const sitemap = path.join(args.out, 'sitemap.xml');
    if (fs.existsSync(sitemap)) writeIfChanged(sitemap, updateSitemap(fs.readFileSync(sitemap, 'utf8'), all), log);
    else log.push('übersprungen ' + sitemap + ' (nicht vorhanden)');

    log.forEach(l => console.log(l.replace(args.out + path.sep, '')));

    const dir = path.join(args.out, 'blog');
    const known = new Set(all.map(a => a.slug + '.html'));
    const orphans = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.html') && !known.has(f)) : [];
    orphans.forEach(f => console.warn('Warnung: ' + rel(path.join(dir, f)) + ' gehört zu keinem Artikel mehr (nicht automatisch gelöscht)'));

    console.log(`\n${all.length} Artikel, Übersicht ${all.length ? 'indexierbar' : 'noindex (noch keine Artikel)'}.`);
}

main();
