#!/usr/bin/env python3
"""
Pre-Deploy-Check fuer SEO-Basics auf allen indexierbaren Seiten.
Kein Build-System vorhanden -> manuell vor jedem Push mit relevanten HTML-
Aenderungen ausfuehren: python3 tools/check-seo-meta.py

Prueft NUR strukturelle Vollstaendigkeit (vorhanden/valide), nicht inhaltliche
Qualitaet (Textlaenge, Keyword-Wahl etc. bleiben manuelle Redaktionsarbeit).
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# app.html bewusst ausgeschlossen: noindex, braucht kein Title/Description/Canonical-SEO
INDEXABLE_PAGES = [
    "index.html",
    "preise.html",
    "prompt-bibliothek.html",
    "prompt-erstellen.html",
    "prompt-vorlagen.html",
    "impressum.html",
    "datenschutz.html",
    "agb.html",
]

errors = []
warnings = []

for name in INDEXABLE_PAGES:
    path = ROOT / name
    if not path.exists():
        errors.append(f"{name}: Datei fehlt")
        continue
    html = path.read_text(encoding="utf-8")

    if not re.search(r"<title>[^<]{5,}</title>", html):
        errors.append(f"{name}: <title> fehlt oder leer")

    if not re.search(r'<meta\s+name="description"\s+content="[^"]{20,}"', html):
        errors.append(f"{name}: meta description fehlt oder zu kurz")

    if not re.search(r'<link\s+rel="canonical"\s+href="https://www\.promptomizer\.de[^"]*"', html):
        errors.append(f"{name}: canonical-Link fehlt")

    if not re.search(r'<meta\s+property="og:image"', html):
        warnings.append(f"{name}: og:image fehlt")

    # Jeder JSON-LD-Block muss valides JSON sein
    for i, block in enumerate(re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)):
        try:
            json.loads(block)
        except json.JSONDecodeError as e:
            errors.append(f"{name}: JSON-LD-Block {i + 1} ist kein valides JSON ({e})")

# robots.txt / sitemap.xml Grundcheck
if not (ROOT / "robots.txt").exists():
    errors.append("robots.txt fehlt")
if not (ROOT / "sitemap.xml").exists():
    errors.append("sitemap.xml fehlt")
else:
    sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    sitemap_urls = set(re.findall(r"<loc>(https://www\.promptomizer\.de/[^<]*)</loc>", sitemap))
    checked_urls = set()
    for name in INDEXABLE_PAGES:
        slug = "" if name == "index.html" else name.removesuffix(".html")
        url = f"https://www.promptomizer.de/{slug}"
        checked_urls.add(url)
        if url.rstrip("/") not in sitemap and url not in sitemap:
            warnings.append(f"sitemap.xml: {url} nicht gefunden")

    # Verhindert, dass neue Sitemap-Seiten versehentlich vom Meta-Check ausgenommen bleiben.
    for url in sorted(sitemap_urls - checked_urls):
        errors.append(f"sitemap.xml: {url} wird nicht durch INDEXABLE_PAGES geprüft")

print(f"Geprüft: {len(INDEXABLE_PAGES)} Seiten + robots.txt + sitemap.xml\n")

if warnings:
    print("Warnungen:")
    for w in warnings:
        print(f"  - {w}")
    print()

if errors:
    print("Fehler:")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)

print("Alle Checks bestanden.")
