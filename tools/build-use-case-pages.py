#!/usr/bin/env python3
"""Erzeugt die drei statischen Use-Case-Seiten aus den redaktionellen Entwürfen."""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = Path("/srv/wuw-storage/53_promptomizer/01_roadmaps/seo_geo")

PAGES = [
    {
        "key": "buero",
        "source": "Phase-03-Use-Case-Bueroalltag-Entwurf.md",
        "file": ROOT / "prompt-vorlagen" / "buero.html",
        "name": "Büroalltag",
        "h1": "Prompt-Vorlagen für den Büroalltag",
        "title": "Prompt-Vorlagen für den Büroalltag",
        "description": "Sechs Prompts für Protokoll, Mailkette, Präsentation und Ideensammlung mit wiederverwendbaren Bausteinen. Direkt kopieren, ohne Anmeldung.",
        "same_heading": "Was im Büroalltag immer gleich bleibt",
        "blocks_heading": "Dein Baustein-Set für den Büroalltag",
        "prompts_heading": "Sechs Prompts für den Büroalltag",
        "bridge_heading": "Warum du diese Prompts in vier Wochen neu schreibst",
    },
    {
        "key": "verwaltung",
        "source": "Phase-03-Use-Case-Verwaltung-Entwurf.md",
        "file": ROOT / "prompt-vorlagen" / "verwaltung.html",
        "name": "Öffentliche Verwaltung",
        "h1": "Prompt-Vorlagen für die öffentliche Verwaltung",
        "title": "Prompt-Vorlagen für die öffentliche Verwaltung",
        "description": "Sechs Prompt-Vorlagen für Vermerk, Bürgeranschreiben, Sitzungsvorlage und Arbeitsanleitung mit wiederverwendbaren Bausteinen.",
        "same_heading": "Was in Verwaltungstexten immer gleich bleibt",
        "blocks_heading": "Dein Baustein-Set für die Verwaltung",
        "prompts_heading": "Sechs Vorlagen für Verwaltungsaufgaben",
        "bridge_heading": "Wo diese Vorlagen liegen sollten",
    },
    {
        "key": "marketing",
        "source": "Phase-03-Use-Case-Marketing-Entwurf.md",
        "file": ROOT / "prompt-vorlagen" / "marketing.html",
        "name": "Marketing",
        "h1": "Prompt-Vorlagen für Marketing",
        "title": "Prompt-Vorlagen für Marketing: 6 Vorlagen",
        "description": "Sechs Marketing-Prompts für Blog, Newsletter, Social Media, Anzeigen und Content-Aufbereitung mit wiederverwendbaren Bausteinen.",
        "same_heading": "Was an Marketing-Prompts immer gleich bleibt",
        "blocks_heading": "Dein Baustein-Set für Marketing",
        "prompts_heading": "Sechs Prompts für Marketing",
        "bridge_heading": "Warum gute Marketing-Prompts trotzdem verloren gehen",
    },
]


def section(markdown: str, number: str) -> str:
    pattern = rf"^### {re.escape(number)}\b.*?\n(.*?)(?=^### \d+\.\d+\b|^## Schritt|\Z)"
    match = re.search(pattern, markdown, re.M | re.S)
    return match.group(1).strip() if match else ""


def quote_text(raw: str) -> str:
    lines = []
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped.startswith(">"):
            continue
        value = stripped[1:].strip()
        if not value or value.startswith("[!"):
            continue
        lines.append(value)
    value = " ".join(lines)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def visible_paragraphs(raw: str) -> list[str]:
    value = quote_text(raw)
    if not value:
        return []
    value = value.replace("**", "")
    return [part.strip() for part in re.split(r"(?<=\.)\s+(?=[A-ZÄÖÜ])", value) if part.strip()]


def parse_blocks(raw: str) -> list[dict[str, str]]:
    result = []
    pattern = r"^#### Baustein (\d+):\s*(.+?)\n(.*?)(?=^---$|^#### |^### |\Z)"
    for match in re.finditer(pattern, raw, re.M | re.S):
        text = quote_text(match.group(3))
        text = re.split(r"\*\*Praktischer Hinweis", text, maxsplit=1)[0].strip()
        text = text.replace("**", "")
        result.append({"number": match.group(1), "name": match.group(2).strip(), "text": text})
    return result


def prompt_text(raw: str) -> str:
    quoted = quote_text(raw)
    quoted = re.sub(r"\*\*(Rolle|Aufgabe|Kontext|Format):\*\*\s*", r"\n\1: ", quoted)
    quoted = quoted.replace("**", "")
    quoted = re.sub(r"\s+\.", ".", quoted)
    quoted = re.sub(r"\.{2,}", ".", quoted)
    return quoted.strip()


def structured_prompt_text(value: str) -> str:
    matches = list(re.finditer(r"^(Rolle|Kontext|Aufgabe|Format):\s*", value, re.M))
    fields: dict[str, str] = {}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(value)
        fields[match.group(1)] = value[match.end():end].strip()

    labels = (
        ("Rolle", "🎭 ROLLE"),
        ("Kontext", "🌍 KONTEXT"),
        ("Aufgabe", "🎯 AUFGABE"),
        ("Format", "🧪 VARIANTEN"),
    )
    return "\n\n".join(
        f"**{label}**\n{fields[key]}"
        for key, label in labels
        if fields.get(key)
    )


def parse_prompts(raw: str, blocks: list[dict[str, str]]) -> list[dict[str, str]]:
    result = []
    pattern = r"^#### (\d+)\.\s*(.+?)\n(.*?)(?=^---$|^#### |^### |\Z)"
    block_map = {item["number"]: item["text"] for item in blocks}
    for match in re.finditer(pattern, raw, re.M | re.S):
        body = match.group(3)
        text = prompt_text(body)
        for number, block in block_map.items():
            text = text.replace(f"[Baustein {number}]", block)
        text = re.sub(r"\s+\.", ".", text)
        text = re.sub(r"\.{2,}", ".", text)
        text = "\n".join(line.rstrip() for line in text.splitlines())
        description_lines = []
        for line in body.splitlines():
            stripped = line.strip()
            if stripped.startswith(">") or stripped.startswith("Als Baustein"):
                break
            if stripped:
                description_lines.append(stripped)
        description = " ".join(description_lines)
        reusable = re.search(r"Als Baustein:\s*(.+)", body)
        result.append({
            "number": match.group(1),
            "name": match.group(2).strip(),
            "description": description,
            "text": text,
            "reusable": reusable.group(1).strip() if reusable else "wiederkehrende Rolle und Formatvorgaben",
        })
    return result


def parse_faq(raw: str) -> list[dict[str, str]]:
    result = []
    matches = list(re.finditer(r"^\s*\d+\.\s+\*\*(.+?)\*\*\s*$", raw, re.M))
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(raw)
        answer = quote_text(raw[match.end():end])
        answer = re.sub(r"\s*\[AUDIT:.*?\]\s*", " ", answer).strip()
        answer = answer.replace(
            "Die Speicherung erfolgt auf Servern in Deutschland.",
            "Die produktive Datenbank für gespeicherte Inhalte liegt in Frankfurt.",
        )
        answer = answer.replace("**", "")
        if answer:
            result.append({"question": match.group(1).strip(), "answer": answer})
    return result


def p_tags(values: list[str]) -> str:
    return "".join(f'<p class="mb-4">{html.escape(value)}</p>' for value in values)


def schema(page: dict, prompts: list[dict[str, str]], faq: list[dict[str, str]]) -> str:
    slug = page["key"]
    data = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Promptomizer", "item": "https://www.promptomizer.de/"},
                    {"@type": "ListItem", "position": 2, "name": "Prompt-Vorlagen", "item": "https://www.promptomizer.de/prompt-vorlagen"},
                    {"@type": "ListItem", "position": 3, "name": page["name"], "item": f"https://www.promptomizer.de/prompt-vorlagen/{slug}"},
                ],
            },
            {
                "@type": "ItemList",
                "name": page["prompts_heading"],
                "itemListElement": [
                    {"@type": "ListItem", "position": index, "name": item["name"], "description": item["description"]}
                    for index, item in enumerate(prompts, 1)
                ],
            },
            {
                "@type": "FAQPage",
                "mainEntity": [
                    {"@type": "Question", "name": item["question"], "acceptedAnswer": {"@type": "Answer", "text": item["answer"]}}
                    for item in faq
                ],
            },
        ],
    }
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def render(page: dict) -> str:
    markdown = (DOCS / page["source"]).read_text(encoding="utf-8")
    intro = visible_paragraphs(section(markdown, "2.1"))
    same = visible_paragraphs(section(markdown, "2.3"))
    block_section = section(markdown, "2.4")
    blocks = parse_blocks(block_section)
    prompts = parse_prompts(section(markdown, "2.5"), blocks)
    bridge = visible_paragraphs(section(markdown, "2.6"))
    bridge = [
        paragraph for paragraph in bridge
        if not paragraph.startswith("Er darf nur so ausgeliefert werden")
        and not paragraph.startswith("Bitte nicht kürzen")
        and not paragraph.startswith("Wenn es dir weniger um das Werkzeug")
        and not paragraph.startswith("Beide Angebote stammen von mir")
    ]
    faq = parse_faq(section(markdown, "2.7"))
    cta = quote_text(section(markdown, "2.9"))
    slug = page["key"]
    if slug == "buero":
        prompts = [
            {**item, "text": structured_prompt_text(item["text"])}
            for item in prompts
        ]

    block_button_class = (
        "ui-btn ui-btn-primary text-sm mt-4"
        if slug == "buero"
        else "ui-btn ui-btn-ghost border border-navy-border text-sm mt-4"
    )
    block_success_attr = (
        " data-copy-success=\"Baustein kopiert\""
        if slug == "buero"
        else ""
    )
    prompt_success_attr = (
        " data-copy-success=\"Prompt kopiert\""
        if slug == "buero"
        else ""
    )

    block_cards = "".join(
        f'''<article class="content-card"><h3 class="text-lg font-bold text-white mb-3">Baustein {item["number"]}: {html.escape(item["name"])}</h3>
        <div id="{slug}-block-{item["number"]}" class="prompt-block reusable-part">{html.escape(item["text"])}</div>
        <button type="button" class="{block_button_class}" data-copy-target="{slug}-block-{item["number"]}"{block_success_attr} aria-describedby="{slug}-block-status-{item["number"]}">Baustein kopieren</button>
        <p id="{slug}-block-status-{item["number"]}" class="copy-status" aria-live="polite"></p></article>'''
        for item in blocks
    )
    prompt_cards = "".join(
        f'''<details class="content-details"><summary>{item["number"]}. {html.escape(item["name"])}</summary><div class="content-details-body">
        <p class="mb-4">{html.escape(item["description"])}</p><pre id="{slug}-prompt-{item["number"]}" class="prompt-block">{html.escape(item["text"])}</pre>
        <p class="text-xs text-slate-500 mt-3">Als Baustein: {html.escape(item["reusable"])}</p>
        <button type="button" class="ui-btn ui-btn-primary text-sm mt-4" data-copy-target="{slug}-prompt-{item["number"]}"{prompt_success_attr} aria-describedby="{slug}-prompt-status-{item["number"]}">Prompt kopieren</button>
        <p id="{slug}-prompt-status-{item["number"]}" class="copy-status" aria-live="polite"></p></div></details>'''
        for item in prompts
    )
    faq_cards = "".join(
        f'<details class="content-details"><summary>{html.escape(item["question"])}</summary><div class="content-details-body">{html.escape(item["answer"])}</div></details>'
        for item in faq
    )
    extra = ""
    block_note = ""
    if slug == "buero":
        block_note = '''<p class="mt-5 text-sm">Praktischer Hinweis: Ersetze Namen vor dem Einfügen durch Platzhalter wie [Person A], [Person B] und [Firma X]. Ob und in welchem Umfang du dienstliche Inhalte in ein KI-Tool geben darfst, steht in der Regelung deines Arbeitgebers.</p>'''
    if slug == "verwaltung":
        extra = '''<p class="mt-5">Wenn es dir weniger um das Werkzeug und mehr um das Vorgehen geht: Auf <a href="https://wissen-und-werkzeug.de/" class="text-brand-sky hover:underline">Wissen und Werkzeug</a> schreibe ich über Prozessmanagement und KI in der Verwaltung, aus der Verwaltung heraus. Beide Angebote stammen von mir.</p>'''

    entity_sentence = (
        ""
        if slug == "buero"
        else """<p class="text-slate-300 font-medium mt-6">Promptomizer ist ein deutsches Web-Tool zum Erstellen, Optimieren und Verwalten von KI-Prompts.</p>"""
    )
    block_reuse_sentence = (
        "Diese Blöcke stehen in den Prompts unten immer wieder. Lege sie einmal als Bausteine ab und setze sie danach immer wieder ein."
        if slug == "buero"
        else "Diese Blöcke stehen in den Prompts unten immer wieder. Lege sie einmal als Bausteine ab und setze sie danach erneut ein."
    )
    bridge_section = (
        ""
        if slug == "buero"
        else f"""<section class="mb-16"><h2 class="text-2xl font-bold text-white mb-4">{html.escape(page["bridge_heading"])}</h2>{p_tags(bridge)}{extra}<p class="mt-5">Mehr dazu: <a href="/prompt-vorlagen" class="text-brand-sky hover:underline">Prompt-Vorlagen</a>, <a href="/prompt-bibliothek" class="text-brand-sky hover:underline">Prompt-Bibliothek</a> und <a href="/prompt-erstellen" class="text-brand-sky hover:underline">Prompt strukturiert erstellen</a>.</p></section>"""
    )

    return f'''<!DOCTYPE html><html lang="de" class="dark antialiased"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{html.escape(page["title"])}</title><meta name="description" content="{html.escape(page["description"])}"><meta name="theme-color" content="#020617">
<link rel="canonical" href="https://www.promptomizer.de/prompt-vorlagen/{slug}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Promptomizer"><meta property="og:locale" content="de_DE"><meta property="og:url" content="https://www.promptomizer.de/prompt-vorlagen/{slug}"><meta property="og:title" content="{html.escape(page["title"])}"><meta property="og:description" content="{html.escape(page["description"])}"><meta property="og:image" content="https://www.promptomizer.de/assets/og-image.png">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{html.escape(page["title"])}"><meta name="twitter:description" content="{html.escape(page["description"])}"><meta name="twitter:image" content="https://www.promptomizer.de/assets/og-image.png">
<link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"><link rel="manifest" href="/manifest.json">
<link rel="stylesheet" href="/vendor/tailwind/tailwind.css"><link rel="stylesheet" href="/vendor/fontawesome/css/all.min.css"><link rel="stylesheet" href="/vendor/fonts/inter/inter.css"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/content-pages.css">
<script type="application/ld+json">{schema(page, prompts, faq)}</script>
<!-- FAQPage dient der Extrahierbarkeit; ein Google-Rich-Result wird nicht erwartet. -->
<script defer src="https://cloud.umami.is/script.js" data-website-id="5196fd86-1829-472f-8cf3-c31d420aea9c" data-exclude-hash="true"></script></head>
<body class="content-shell bg-navy-deep text-slate-400 min-h-screen">
<header class="border-b border-navy-border"><div class="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between"><a href="/" class="flex items-center leading-none" aria-label="Promptomizer Startseite"><span class="text-xl font-bold text-white">Prompt</span><span class="text-xl font-bold text-brand-sky">omizer</span></a><a href="/app?intent=register" class="ui-btn ui-btn-primary text-sm">Kostenlos registrieren</a></div></header>
<main class="max-w-3xl mx-auto px-6 py-12 md:py-16">
<nav class="content-breadcrumb mb-8" aria-label="Breadcrumb"><a href="/">Startseite</a><span>›</span><a href="/prompt-vorlagen">Prompt-Vorlagen</a><span>›</span><span aria-current="page">{html.escape(page["name"])}</span></nav>
<section class="mb-14"><h1 class="text-3xl md:text-4xl font-bold text-white mb-5">{html.escape(page["h1"])}</h1>{p_tags(intro)}{entity_sentence}</section>
<section class="mb-16"><h2 class="text-2xl font-bold text-white mb-4">{html.escape(page["same_heading"])}</h2>{p_tags(same)}</section>
<section class="mb-16"><h2 class="text-2xl font-bold text-white mb-6">{html.escape(page["blocks_heading"])}</h2><div class="content-grid-2">{block_cards}</div>{block_note}<p class="mt-5">{block_reuse_sentence}</p></section>
<section class="mb-16"><h2 class="text-2xl font-bold text-white mb-6">{html.escape(page["prompts_heading"])}</h2><div class="space-y-4">{prompt_cards}</div></section>
{bridge_section}
<section class="content-card content-card-accent mb-16"><h2 class="text-lg font-bold text-white mb-3">Kostenlos anfangen</h2><p>Mit Free kannst du bis zu zehn Prompts und Bausteine insgesamt speichern. Die produktive Datenbank für gespeicherte Inhalte liegt in Frankfurt. Promptomizer übermittelt gespeicherte Prompts nicht automatisch an generative KI-Anbieter.</p><p class="mt-3"><a href="/preise" class="text-brand-sky hover:underline">Pläne und Preise vergleichen</a></p></section>
<section class="mb-16"><h2 class="text-xl font-bold text-white mb-6">Häufige Fragen</h2><div class="space-y-3">{faq_cards}</div></section>
<section class="text-center rounded-xl border-2 border-brand-sky bg-slate-800/40 p-8 md:p-12 shadow-glow"><h2 class="text-2xl font-bold text-white mb-3">{html.escape(cta or "Bausteine dauerhaft griffbereit haben")}</h2><p class="mb-6">Lege die wiederkehrenden Teile einmal an und verwende sie bei der nächsten Aufgabe erneut.</p><a href="/app?intent=register" class="ui-btn ui-btn-primary px-8">Kostenlos registrieren</a></section>
</main>
<div class="border-t border-navy-border mt-16"><div class="max-w-5xl mx-auto px-6 py-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-slate-500"><span>Deutschland</span><span>DSGVO</span><span>Kein KI-Training</span><span>Jederzeit kündbar</span></div></div>
<footer class="border-t border-navy-border"><div class="max-w-5xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-600"><span>&copy; 2026 Promptomizer</span><div class="flex items-center gap-4"><a href="/prompt-vorlagen">Vorlagen</a><a href="/preise">Preise</a><a href="/app">Zur App</a><a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a></div></div></footer>
<script src="/content-pages.js"></script></body></html>'''


def main() -> None:
    (ROOT / "prompt-vorlagen").mkdir(exist_ok=True)
    for page in PAGES:
        page["file"].write_text(render(page), encoding="utf-8")
        print(f"erstellt: {page['file'].relative_to(ROOT)}")


if __name__ == "__main__":
    main()
