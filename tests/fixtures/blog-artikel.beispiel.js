// Beispieldaten aus dem Design-Handoff „Promptomizer Blog“ (Platzhalterinhalte).
// Nur für tests/blog-build-smoke.cjs und die lokale Vorschau, nicht veröffentlichen.

window.BLOG_ARTIKEL = [
  {
    slug: 'prompts-strukturieren',
    titel: 'Vier Felder,',
    titelAkzent: 'die jeden Prompt besser machen',
    kategorie: 'Grundlagen',
    datum: '2026-10-06',
    autor: 'Promptomizer',
    auszug: 'Rolle, Kontext, Aufgabe, Format: Warum diese Aufteilung funktioniert und wie du sie im strukturierten Editor nutzt.',
    inhalt: `
<p>Die meisten schwachen Prompts scheitern nicht an der Formulierung, sondern an fehlenden Angaben. Die KI weiß nicht, wer sie sein soll, für wen sie schreibt und wie das Ergebnis aussehen soll.</p>
<h2>Rolle und Funktion</h2>
<p>Die Rolle legt Fachwissen und Tonfall fest. „Du bist Senior SEO Experte" liefert andere Antworten als „Du bist Pressesprecherin einer Kommune".</p>
<h2>Kontext</h2>
<p>Zielgruppe, Kanal, Produkt, Vorwissen. Je konkreter der Kontext, desto weniger muss die KI raten.</p>
<h2>Aufgabe</h2>
<p>Ein Verb, ein Gegenstand, ein Umfang. Fasse zusammen, schreibe um, vergleiche.</p>
<h2>Format</h2>
<p>Tabelle, Markdown, Liste oder Fließtext. Wer das Format vorgibt, spart die zweite Runde.</p>
<pre>ROLLE     Du bist erfahrener Fachredakteur.
KONTEXT   Zielgruppe: Verwaltung, Vorkenntnisse gering.
AUFGABE   Fasse die Vorlage auf eine Seite zusammen.
FORMAT    Überschrift, drei Absätze, keine Aufzählung.</pre>
<p>Im strukturierten Modus des Promptomizer entspricht jedes dieser Felder einem eigenen Eingabefeld. Du kannst jedes Feld als <a href="/prompt-bibliothek">Baustein speichern</a> und später wiederverwenden.</p>
`
  },
  {
    slug: 'bausteine-wiederverwenden',
    titel: 'Bausteine:',
    titelAkzent: 'einmal schreiben, oft verwenden',
    kategorie: 'Praxis',
    datum: '2026-09-22',
    autor: 'Patrick Roßkothen',
    auszug: 'Wiederkehrende Rollen, Vorgaben und Formate gehören nicht in jeden Prompt neu. So legst du dir eine Sammlung an.',
    inhalt: `
<p>Wer regelmäßig mit KI arbeitet, schreibt dieselben Sätze immer wieder: die gleiche Rolle, die gleichen Stilvorgaben, das gleiche Ausgabeformat.</p>
<h2>Was sich als Baustein eignet</h2>
<ul><li>Rollen, die du in mehreren Projekten brauchst</li><li>Stil- und Tonvorgaben deines Unternehmens</li><li>Ausgabeformate wie Tabellen oder Gliederungen</li></ul>
<h2>Bausteine einsetzen</h2>
<p>Im strukturierten Modus landet ein Baustein im passenden Feld. Im freien Modus wird er an der Cursorposition in deinen Text eingefügt.</p>
<blockquote>Ein guter Baustein ist kurz, eindeutig und ohne Bezug auf ein einzelnes Projekt formuliert.</blockquote>
`
  },
  {
    slug: 'prompt-generator-vs-editor',
    titel: 'Warum Promptomizer',
    titelAkzent: 'kein Prompt-Generator ist',
    kategorie: 'Hintergrund',
    datum: '2026-09-08',
    autor: 'Promptomizer',
    auszug: 'Generatoren liefern fertige Texte. Ein Editor hilft dir, deine eigenen Prompts zu bauen und zu verbessern.',
    inhalt: `
<p>Prompt-Generatoren versprechen den perfekten Prompt auf Knopfdruck. Das Ergebnis ist oft allgemein, weil der Generator deinen Kontext nicht kennt.</p>
<h2>Der Unterschied</h2>
<p>Promptomizer schreibt keine Prompts für dich. Er gibt dir eine Struktur, in der du deine Angaben vollständig und wiederverwendbar ablegst.</p>
<h2>Keine Übermittlung an KI-Dienste</h2>
<p>Gespeicherte Inhalte werden nicht automatisch an generative KI-Anbieter gesendet. Du entscheidest selbst, wo du einen Prompt verwendest.</p>
`
  },
  {
    slug: 'bibliothek-ordnen',
    titel: 'Ordnung in der',
    titelAkzent: 'Prompt-Bibliothek',
    kategorie: 'Praxis',
    datum: '2026-08-25',
    autor: 'Promptomizer',
    auszug: 'Kategorien, Favoriten und Archiv: ein einfaches System, mit dem du auch nach Monaten noch findest, was du suchst.',
    inhalt: `
<p>Eine Bibliothek ist nur so gut wie ihre Ordnung. Drei Werkzeuge reichen in den meisten Fällen.</p>
<h2>Kategorien nach Einsatzbereich</h2>
<p>Lege Kategorien nach Aufgaben an, nicht nach Tools: Texten, Recherche, Auswertung.</p>
<h2>Favoriten für den Alltag</h2>
<p>Markiere die fünf bis zehn Prompts, die du jede Woche brauchst.</p>
<h2>Archiv statt Löschen</h2>
<p>Was du gerade nicht brauchst, verschiebst du ins Archiv. Die Suche findet es trotzdem.</p>
`
  },
  {
    slug: 'ausgabeformat-festlegen',
    titel: 'Das Ausgabeformat',
    titelAkzent: 'zuerst festlegen',
    kategorie: 'Grundlagen',
    datum: '2026-08-11',
    autor: 'Promptomizer',
    auszug: 'Wer der KI sagt, wie das Ergebnis aussehen soll, bekommt brauchbare Antworten im ersten Anlauf.',
    inhalt: `
<p>Das Format ist das am häufigsten vergessene Feld. Dabei entscheidet es, ob du das Ergebnis direkt weiterverwenden kannst.</p>
<h2>Beispiele</h2>
<ol><li>Tabelle mit drei Spalten: Begriff, Erklärung, Beispiel</li><li>Markdown mit H2-Überschriften</li><li>Fließtext, maximal 150 Wörter</li></ol>
`
  },
  {
    slug: 'versionen-vergleichen',
    titel: 'Prompts in Versionen',
    titelAkzent: 'weiterentwickeln',
    kategorie: 'Funktionen',
    datum: '2026-07-28',
    aktualisiert: '2026-09-30',
    autor: 'Promptomizer',
    auszug: 'Mit Pro speicherst du Fassungen eines Prompts, vergleichst sie und stellst frühere Stände wieder her.',
    inhalt: `
<p>Gute Prompts entstehen selten im ersten Versuch. Versionen halten fest, was du geändert hast.</p>
<h2>Neue Version anlegen</h2>
<p>Beim Speichern eines bearbeiteten Prompts kannst du eine neue Version anlegen, statt die alte zu überschreiben.</p>
<h2>Vergleichen und wiederherstellen</h2>
<p>Mit Pro siehst du frühere Fassungen nebeneinander und stellst sie mit einem Klick wieder her.</p>
`
  }
];
