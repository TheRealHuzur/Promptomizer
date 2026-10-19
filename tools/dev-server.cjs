#!/usr/bin/env node
// Lokale Vorschau, die vercel.json nachbildet: cleanUrls, trailingSlash false, Redirects,
// interne Rewrites (z. B. /app/kollektionen/<id> → app.html) und Header. Ohne Abhängigkeiten.
// Externe Rewrites (Blog) beantwortet sie mit 502, weil sie nichts weiterleitet.
// Nur für Entwicklung; ersetzt nicht die Abnahme im Vercel-Preview.
//
// Aufruf: node tools/dev-server.cjs [port]   (Standard 4173)
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2]) || 4173;
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
    '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf'
};

// Vercel-Quellmuster in einen regulären Ausdruck: ":name" = ein Segment, ":name*" = beliebig viele,
// "(.*)" bleibt Regex. Liefert die benannten Treffer für die Ziel-Ersetzung.
function compile(source) {
    const names = [];
    let pattern = '';
    for (let i = 0; i < source.length;) {
        const named = source.slice(i).match(/^:([A-Za-z_]\w*)([*+]?)/);
        if (named) {
            names.push(named[1]);
            pattern += named[2] === '*' ? '(.*)' : named[2] === '+' ? '(.+)' : '([^/]+)';
            i += named[0].length;
        } else if (source.startsWith('(.*)', i)) {
            names.push(String(names.length));
            pattern += '(.*)';
            i += 4;
        } else {
            pattern += source[i].replace(/[.?+^$[\]\\{}|]/g, '\\$&');
            i += 1;
        }
    }
    const regex = new RegExp(`^${pattern}$`);
    return pathname => {
        const match = pathname.match(regex);
        if (!match) return null;
        const params = {};
        names.forEach((name, index) => { params[name] = match[index + 1] || ''; });
        return params;
    };
}

function fill(destination, params) {
    return destination.replace(/:([A-Za-z_]\w*)\*?/g, (_, name) => params[name] ?? '');
}

const redirects = (config.redirects || []).map(rule => ({ ...rule, match: compile(rule.source) }));
const rewrites = (config.rewrites || []).map(rule => ({ ...rule, match: compile(rule.source) }));
const headerRules = (config.headers || []).map(rule => ({ ...rule, match: compile(rule.source) }));

function fileFor(pathname) {
    const candidate = path.join(root, decodeURIComponent(pathname));
    if (!candidate.startsWith(root)) return null;
    const options = [candidate, `${candidate}.html`, path.join(candidate, 'index.html')];
    return options.find(file => fs.existsSync(file) && fs.statSync(file).isFile()) || null;
}

function send(res, status, headers, body) {
    res.writeHead(status, headers);
    res.end(body);
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    const headers = {};
    headerRules.forEach(rule => {
        if (rule.match(pathname)) rule.headers.forEach(({ key, value }) => { headers[key] = value; });
    });

    if (config.trailingSlash === false && pathname.length > 1 && pathname.endsWith('/')) {
        return send(res, 308, { ...headers, Location: `${pathname.replace(/\/+$/, '')}${url.search}` }, '');
    }
    if (config.cleanUrls && pathname.endsWith('.html')) {
        const clean = pathname.replace(/(\/index)?\.html$/, '') || '/';
        return send(res, 308, { ...headers, Location: `${clean}${url.search}` }, '');
    }
    for (const rule of redirects) {
        const params = rule.match(pathname);
        if (params) return send(res, rule.permanent ? 308 : 307, { ...headers, Location: fill(rule.destination, params) }, '');
    }

    let file = fileFor(pathname);
    if (!file) {
        for (const rule of rewrites) {
            const params = rule.match(pathname);
            if (!params) continue;
            const destination = fill(rule.destination, params);
            if (/^https?:/.test(destination)) return send(res, 502, headers, `Externer Rewrite nicht nachgebildet: ${destination}`);
            file = fileFor(destination);
            break;
        }
    }
    if (!file) return send(res, 404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }, 'Not Found');

    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    if (req.method === 'HEAD') return send(res, 200, { ...headers, 'Content-Type': type }, '');
    send(res, 200, { ...headers, 'Content-Type': type, 'Cache-Control': 'no-store' }, fs.readFileSync(file));
});

server.listen(port, () => console.log(`Promptomizer-Vorschau: http://localhost:${port}/app`));
