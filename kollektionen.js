// Kollektionen: redaktionelle, öffentliche Prompt-Sammlungen (keine Nutzerdaten, keine DB).
// Pflege per Git. Jede Kollektion und jeder Prompt braucht eine stabile, eindeutige id
// (Grundlage für spätere Dublettenerkennung und Deep-Links, ids nach Veröffentlichung nicht ändern).
//
// Aufbau:
// { id, title, benefit, prompts: [
//     { id, title, purpose, inputs: ['…'],
//       fields: { role, context, task, format }   // strukturierter Prompt
//       // oder fields: { mode: 'free', text }     // freier Prompt (Markdown)
//     } ] }
//
// Platzhalter stehen in eckigen Klammern, z. B. [Angabe]. Sie werden in der Vorschau
// hervorgehoben und beim Kopieren/Übernehmen unverändert weitergegeben.
//
// ACHTUNG: Die folgende Testkollektion (id 'testkollektion') ist bewusst live, bis die erste
// echte Kollektion veröffentlicht wird, und wird dabei vollständig entfernt. Die Texte stammen
// aus den öffentlichen Vorlagen (prompt-vorlagen.html).
window.PROMPTOMIZER_COLLECTIONS = [
    {
        id: 'testkollektion',
        title: 'Testkollektion (vor Release ersetzen)',
        benefit: 'Nur zum Testen der Kollektionsansicht. Enthält Beispielprompts aus den öffentlichen Vorlagen.',
        prompts: [
            {
                id: 'testkollektion-kundenanfrage',
                title: 'Antwort auf eine schwierige Kundenanfrage',
                purpose: 'Sachliche Antwort auf Kritik, ohne mehr zu versprechen als möglich.',
                inputs: ['Die Anfrage', 'Was tatsächlich passiert ist', 'Was angeboten werden kann und was nicht'],
                fields: {
                    role: 'Du bist erfahrene Mitarbeiterin im Kundenservice. Du bleibst sachlich, nimmst Kritik ernst und versprichst nichts, was nicht ausdrücklich im Kontext steht.',
                    context: 'Anfrage: [Text einfügen]. Was tatsächlich passiert ist: [Sachverhalt]. Was wir anbieten können: [Angebot]. Was wir nicht anbieten können: [Grenze].',
                    task: 'Formuliere eine Antwort auf die unten stehende Anfrage.',
                    format: 'E-Mail mit Anrede und Grußformel, höchstens 150 Wörter, ein konkreter nächster Schritt am Ende.'
                }
            },
            {
                id: 'testkollektion-zusammenfassung',
                title: 'Langes Dokument zusammenfassen',
                purpose: 'Entscheidungsreife Zusammenfassung für Menschen, die den Text nicht lesen.',
                inputs: ['Das Dokument', 'Wer die Zusammenfassung liest', 'Wofür sie gebraucht wird'],
                fields: {
                    role: 'Du bist Analystin und fasst Fachtexte für Menschen zusammen, die den Text nicht lesen werden, aber Entscheidungen daraus ableiten müssen.',
                    context: 'Dokument: [Text einfügen]. Wer die Zusammenfassung liest: [Rolle]. Wofür sie gebraucht wird: [Entscheidung].',
                    task: 'Fasse das unten stehende Dokument zusammen.',
                    format: 'Erst drei Sätze Kernaussage, dann höchstens fünf Stichpunkte mit Details, zuletzt eine Zeile „Offene Fragen“. Keine Wiederholung der Kernaussage in den Stichpunkten.'
                }
            },
            {
                id: 'testkollektion-freitext',
                title: 'Text verständlicher machen (freier Prompt)',
                purpose: 'Testet einen freien Prompt mit Markdown und Platzhaltern.',
                inputs: ['Der Text', 'Die Zielgruppe'],
                fields: {
                    mode: 'free',
                    text: '# Text vereinfachen\n\nSchreibe den folgenden Text für [Zielgruppe] verständlicher.\n\n- Kurze Sätze\n- Keine Fachbegriffe ohne Erklärung\n- Die Leserin soll danach wissen: [eine Aussage]\n\nText: [einfügen]'
                }
            }
        ]
    }
];
