// Blogartikel für promptomizer.de/blog – führende Quelle für tools/build-blog.cjs.
// Nach jeder Änderung ausführen: node tools/build-blog.cjs
// Der Generator schreibt blog.html, blog/<slug>.html und den Blog-Block in sitemap.xml.
//
// Neuen Artikel veröffentlichen: Objekt OBEN in die Liste einfügen (Reihenfolge = Datum absteigend).
// Felder:
//   slug         URL /blog/<slug>, eindeutig, kleingeschrieben mit Bindestrichen
//   titel        weißer Teil der Überschrift
//   titelAkzent  Sky-Teil der Überschrift (optional)
//   kategorie    genau eine
//   datum        JJJJ-MM-TT (Veröffentlichung)
//   aktualisiert JJJJ-MM-TT (optional, nur bei inhaltlicher Überarbeitung; steuert dateModified und Sitemap-lastmod)
//   autor        z. B. 'Patrick Roßkothen' oder 'Promptomizer'
//   auszug       1–2 Sätze, Kachel und Lead im Artikel, zugleich Meta-Description
//   metaTitel    optional, ersetzt „titel titelAkzent“ im <title>
//   inhalt       HTML, erlaubt: h2, h3, p, ul, ol, li, pre, blockquote, a, strong
// Die Lesezeit wird automatisch berechnet. Ein vollständiges Beispiel liegt in
// tests/fixtures/blog-artikel.beispiel.js.
//
// Kategorien: Reihenfolge der Filter. Jeder Artikel nutzt genau einen dieser Namen.
// Auskommentiert = Kategorien werden aus den Artikeln gebildet (Reihenfolge des ersten Auftretens).
// window.BLOG_KATEGORIEN = ['Grundlagen', 'Praxis', 'Hintergrund', 'Funktionen'];

window.BLOG_ARTIKEL = [
  {
    slug: 'prompt-bauplan-beispiel',
    titel: 'Der Bauplan durchgespielt:',
    titelAkzent: 'Vom vagen Gedanken zum präzisen Prompt',
    metaTitel: 'Prompt-Bauplan an einem Beispiel durchgespielt',
    kategorie: 'Praxis',
    datum: '2026-10-08',
    autor: 'Patrick Roßkothen',
    auszug: 'Der Bauplan an einem echten Beispiel: von der Zielklärung bis zum fertigen Prompt aus Rolle, Kontext, Aufgabe und Format.',
    inhalt: `
<p>Du kennst das: Du setzt dich hin, willst einen Prompt schreiben, und nach drei Korrekturrunden ist das Ergebnis immer noch nicht das, was du brauchst. Liegt es am Modell? An der Formulierung? Oder daran, dass du losgeschrieben hast, bevor klar war, was du eigentlich willst?</p>
<p>Der <a href="/wissen/prompt-engineering">Promptomizer-Bauplan</a> hilft dir, diesen Kreislauf zu durchbrechen. Nicht, indem er dir vorschreibt, wie ein Prompt auszusehen hat. Sondern indem er deine Gedanken sortiert, bevor die KI sie bekommt.</p>
<p>Und das Beste: Du musst nicht jedes Mal alle Schritte durchgehen. Der Bauplan ist ein Qualitätsrahmen, kein Pflichtformular. So wenige Anweisungen wie möglich, so viele wie nötig.</p>
<h2>Worum es geht</h2>
<p>Der Bauplan besteht aus zwei Phasen:</p>
<ol>
<li><strong>Ziel definieren</strong> – bevor du auch nur eine Zeile Prompt schreibst</li>
<li><strong>Prompt formulieren</strong> – mit den vier Bausteinen Rolle, Kontext, Aufgabe, Format</li>
</ol>
<p>Klingt abstrakt? Dann lass es uns an einem echten Beispiel durchspielen.</p>
<h2>Die Ausgangssituation</h2>
<p>Stell dir vor, du arbeitest in einem kleinen Unternehmen und sollst eine E-Mail an alle Mitarbeitenden schreiben. Es geht um die neue Regelung für Homeoffice-Tage. Du hast die Eckpunkte im Kopf, aber der erste Entwurf klingt hölzern, unvollständig und irgendwie nach Behörde.</p>
<p>Bevor du jetzt „Schreib mir eine E-Mail zum Homeoffice“ in den Prompt tippst – stopp. Das Ziel ist nicht klar.</p>
<h2>Phase 1: Ziel definieren</h2>
<p>Die Zielklärung ist der Schritt, den die meisten überspringen. Dabei entscheidet sie über alles, was danach kommt.</p>
<p>Für unser Beispiel:</p>
<ul>
<li><strong>Ich will:</strong> eine klare, freundliche E-Mail an alle Mitarbeitenden zur neuen Homeoffice-Regelung</li>
<li><strong>Für:</strong> die gesamte Belegschaft, inklusive Teammitglieder, die selten im Büro sind</li>
<li><strong>Damit:</strong> jeder versteht, was sich ändert, ab wann es gilt und was er tun muss</li>
<li><strong>Erfolg ist, wenn:</strong>
<ul>
<li>Die drei wichtigsten Änderungen auf einen Blick erkennbar sind</li>
<li>Der Ton verbindlich wirkt, aber nicht abschreckt</li>
<li>Niemand nach dem Lesen fragen muss, was jetzt von ihm erwartet wird</li>
</ul>
</li>
</ul>
<p>Das ist kein Prompt. Das ist dein Maßstab. Alles, was jetzt kommt, wird an diesen drei Kriterien gemessen.</p>
<h2>Phase 2: Den Prompt bauen</h2>
<p>Jetzt übersetzt du das Ziel in einen Arbeitsauftrag an die KI. Der Bauplan schlägt vier Bausteine vor – aber nicht jeder ist immer nötig.</p>
<h3>Rolle – wer antwortet?</h3>
<p>Die Rolle gibt der KI eine Perspektive. Für unsere E-Mail ist das simpel:</p>
<pre>Du bist interne Kommunikationsverantwortliche in einem mittelständischen Unternehmen. Du schreibst klar, wertschätzend und ohne Floskeln.</pre>
<p>Warum das hilft? Ohne Rollenangabe liefert die KI oft einen neutralen Standardtext. Mit der Rolle bekommst du einen Text, der zur Unternehmensrealität passt.</p>
<h3>Kontext – was muss die KI wissen?</h3>
<p>Hier wird das Briefing konkret. Die KI kennt weder dein Unternehmen noch die neue Regelung. Sag ihr, was sie braucht:</p>
<pre>Das Unternehmen führt ab dem 1. Oktober eine neue Homeoffice-Regelung ein. Bisher konnten Mitarbeitende bis zu drei Tage pro Woche im Homeoffice arbeiten, künftig sind es maximal zwei Tage. Ausnahmen für bestimmte Abteilungen gibt es nicht. Die Regelung gilt für alle Vollzeitkräfte; Teilzeitkräfte regeln die Tage individuell mit ihrer Führungskraft. Die E-Mail geht an alle Mitarbeitenden, auch an die, die fast immer im Büro sind.</pre>
<p>Das ist der relevante Kontext. Nicht die gesamte Personalakte, nicht die Geschichte der Homeoffice-Debatte – nur das, was die KI braucht, um die Aufgabe richtig zu verstehen.</p>
<h3>Aufgabe – was soll die KI tun?</h3>
<p>Jetzt kommt der Kern. Die Aufgabe übersetzt dein Ziel in eine konkrete Anweisung:</p>
<pre>Schreibe eine E-Mail an alle Mitarbeitenden, die die neue Homeoffice-Regelung bekannt gibt. Erkläre die drei wichtigsten Änderungen im Vergleich zur alten Regelung. Nenne das Datum des Inkrafttretens. Beschreibe kurz, was Mitarbeitende jetzt tun müssen (muss nichts beantragt werden, läuft es automatisch?). Der Ton soll verbindlich, aber wertschätzend sein – die neue Regelung ist eine Vorgabe, keine Drohung.</pre>
<p>Aktionsverb: „Schreibe“. Umfang: eine E-Mail. Qualität: verbindlich, wertschätzend, die drei Änderungen erkennbar.</p>
<h3>Format – wie soll es aussehen?</h3>
<p>Das Format legt die Lieferform fest. Für eine E-Mail ist das schnell gesagt, aber die Details machen den Unterschied:</p>
<pre>Gib den Text als fertige E-Mail aus. Betreffzeile, Anrede, Fließtext, Schlussgruppe und Absender. Maximal 250 Wörter. Verwende kurze Absätze von maximal drei Sätzen. Wichtige Änderungen können als Bulletpoints formuliert sein.</pre>
<p>Ohne Formatvorgabe bekommst du oft einen Fließtext, den du noch umbauen musst. Mit Vorgabe sparst du dir diese Runde.</p>
<h2>Der fertige Prompt</h2>
<p>Alles zusammengesetzt:</p>
<pre>Rolle: Du bist interne Kommunikationsverantwortliche in einem mittelständischen Unternehmen. Du schreibst klar, wertschätzend und ohne Floskeln.

Kontext: Das Unternehmen führt ab dem 1. Oktober eine neue Homeoffice-Regelung ein. Bisher konnten Mitarbeitende bis zu drei Tage pro Woche im Homeoffice arbeiten, künftig sind es maximal zwei Tage. Ausnahmen für bestimmte Abteilungen gibt es nicht. Die Regelung gilt für alle Vollzeitkräfte; Teilzeitkräfte regeln die Tage individuell mit ihrer Führungskraft. Die E-Mail geht an alle Mitarbeitenden, auch an die, die fast immer im Büro sind.

Aufgabe: Schreibe eine E-Mail an alle Mitarbeitenden, die die neue Homeoffice-Regelung bekannt gibt. Erkläre die drei wichtigsten Änderungen im Vergleich zur alten Regelung. Nenne das Datum des Inkrafttretens. Beschreibe kurz, was Mitarbeitende jetzt tun müssen. Der Ton soll verbindlich, aber wertschätzend sein.

Format: Gib den Text als fertige E-Mail aus. Betreffzeile, Anrede, Fließtext, Schlussgruppe und Absender. Maximal 250 Wörter. Kurze Absätze von maximal drei Sätzen. Wichtige Änderungen als Bulletpoints.</pre>
<p>Das ist ein Prompt, der funktioniert. Nicht, weil er besonders lang oder clever formuliert ist. Sondern weil er vorher geklärt hat, was rauskommen soll.</p>
<h2>Wann du Bausteine weglassen darfst</h2>
<p>Der Bauplan ist kein Pflichtformular. Bei einer einfachen Frage wie „Wie viele Einwohner hat Duisburg?“ brauchst du weder Rolle noch Kontext noch Format. Die Antwort ist eindeutig, das Ziel ist klar.</p>
<p>Je offener, wichtiger oder wiederkehrender eine Aufgabe ist, desto mehr Bausteine lohnen sich. Die Faustregel: Wenn du beim ersten Ergebnis merkst, dass du nachbessern musst, hat dir vorher ein Baustein gefehlt.</p>
<p>Typische Anzeichen:</p>
<ul>
<li>Die Antwort ist fachlich richtig, aber unbrauchbar formatiert → Format fehlt</li>
<li>Die Antwort ist allgemein, obwohl du etwas Spezifisches brauchst → Kontext fehlt</li>
<li>Die Antwort ist hölzern oder unpassend → Rolle fehlt</li>
<li>Die Antwort geht am Ziel vorbei → Ziel war nicht klar</li>
</ul>
<h2>Was du mit dem Ergebnis machst</h2>
<p>Der Prompt aus diesem Beispiel ist kein Wegwerfprodukt. Wenn du ihn einmal gebaut hast, kannst du ihn für jede ähnliche interne Kommunikation wiederverwenden – du tauschst nur Kontext und Aufgabe aus.</p>
<p>Genau dafür ist der Promptomizer da: aus guten Prompts eine <a href="/prompt-bibliothek">persönliche Bibliothek</a> machen, die dir bei jedem neuen Thema Arbeit spart.</p>
<p>Zum Mitnehmen: Alle fünf Schritte mit der Promptvorlage zum Ausfüllen gibt es kompakt als PDF: <a href="https://www.promptomizer.de/downloads/praezise-prompten-bauplan.pdf">Präzise Prompten: Dein Bauplan in 5 Schritten</a> (PDF, 450 KB).</p>
<blockquote>Der Bauplan ist der erste Schritt. Die Bibliothek ist das Ziel.</blockquote>
`
  }
];
