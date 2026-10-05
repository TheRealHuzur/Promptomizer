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
window.PROMPTOMIZER_COLLECTIONS = [
    {
        "id": "prozessmanagement",
        "title": "Prozessmanagement",
        "benefit": "Vom Ist-Prozess zum Verbesserungsvorschlag: modellieren, analysieren, bewerten.",
        "prompts": [
            {
                "id": "prozessmanagement-prozessmodell",
                "title": "Prozessmodell erstellen",
                "purpose": "Macht aus einer Prozessbeschreibung ein BPMN-2.0-Modell, das du direkt in BPMNDesk oder einem beliebigen Modellierungstool öffnen kannst.",
                "inputs": [
                    "Den Namen des Prozesses",
                    "Eine Beschreibung des Ablaufs in eigenen Worten"
                ],
                "fields": {
                    "role": "Du bist Prozessmanager mit langjähriger Erfahrung in der Modellierung nach BPMN 2.0. Du übersetzt fachliche Beschreibungen so in Modelle, dass Fachanwender sie verstehen und Modellierungswerkzeuge sie fehlerfrei öffnen.",
                    "context": "Ich habe einen Prozess als Text beschrieben und möchte ihn als BPMN-2.0-Modell. Das Modell bildet die Beschreibung inhaltlich exakt ab: Du fügst keine Schritte, Beteiligten oder Entscheidungen hinzu und lässt nichts weg.\n\nDu arbeitest nach den BPMN-Modellierungsregeln aus diesem Wiki:\nhttps://wissen-und-werkzeug.de/wiki/bpmn/\n\nRufe die Seite auf, bevor du modellierst. Wenn du sie nicht abrufen kannst, sag mir das ausdrücklich, bevor du mit allgemeinen BPMN-Konventionen weiterarbeitest.\n\nProzessname: [Prozessname]\n\nProzessbeschreibung:\n[Prozessbeschreibung]",
                    "task": "Gehe in dieser Reihenfolge vor:\n\n1. Analyse: Ermittle aus der Beschreibung die Beteiligten, das Startereignis, die Aktivitäten, die Entscheidungen und die Endereignisse.\n\n2. Lücken prüfen: Suche nach Unklarheiten, z. B. eine Entscheidung ohne zweiten Ausgang, eine unklare Zuständigkeit oder ein fehlendes Prozessende. Triff dazu keine Annahmen. Wenn eine Lücke das Modellieren unmöglich macht, stelle zuerst deine Fragen und warte auf meine Antwort.\n\n3. Modellieren: Wende die Regeln aus dem Wiki an. Verwende nur Elemente, die die Beschreibung trägt.\n\n4. Abgleich: Prüfe, ob sich jede Aussage der Beschreibung im Modell wiederfindet und ob jedes Element im Modell eine Grundlage in der Beschreibung hat.",
                    "format": "Erstelle das Modell als Datei mit dem Namen [Prozessname].bpmn zum Herunterladen. Die Datei ist vollständiges BPMN-2.0-XML mit Diagrammteil (bpmndi mit Koordinaten für alle Elemente und Verbindungen), damit sie in BPMNDesk direkt als Diagramm erscheint. Deutsche Beschriftungen, UTF-8.\n\nGib das XML nicht im Chat aus. Im Chat schreibst du nur:\n- offene Fragen und Unklarheiten als kurze Liste (oder \"keine\")\n- zwei bis drei Sätze zum Modell: Beteiligte, Anzahl der Aktivitäten, wichtigste Entscheidungen\n- den Hinweis, dass ich die Datei in BPMNDesk öffnen und dort weiterbearbeiten oder als Bild exportieren kann\n\nWenn du keine Datei erstellen kannst, sag mir das und frage, ob du das XML stattdessen im Chat ausgeben sollst."
                }
            },
            {
                "id": "prozessmanagement-prozessanalyse",
                "title": "Prozess analysieren",
                "purpose": "Findet in einem kurzen Interview die Schwachstellen eines Ist-Prozesses und hält sie mit Beleg und Gewichtung in einem Word-Dokument fest.",
                "inputs": [
                    "Den Namen des Prozesses",
                    "Den Anlass der Analyse",
                    "Eine Prozessbeschreibung oder das BPMN-Modell als Datei"
                ],
                "fields": {
                    "role": "Du bist Prozessberater mit langjähriger Erfahrung in der Ist-Analyse von Verwaltungs- und Dienstleistungsprozessen. Du führst Analysegespräche so, dass konkrete Beobachtungen statt allgemeiner Meinungen herauskommen, und du trennst sauber zwischen belegten Schwachstellen und Vermutungen.",
                    "context": "Ich möchte die Schwachstellen eines Ist-Prozesses systematisch erfassen, bevor wir über Lösungen sprechen. Ich kenne den Prozess aus der Praxis und beantworte deine Fragen.\n\nProzess: [Prozessname]\nAnlass der Analyse: [Analyseanlass]\n\nProzessbeschreibung (alternativ: Hänge das BPMN-Modell als Datei an und schreibe hier \"siehe Anhang\"):\n[Prozessbeschreibung]\n\nDu untersuchst den Prozess in vier Kategorien:\n1. Ablauf: Schleifen, Rücksprünge, Wartezeiten, Doppelarbeit, Engpässe, Schritte ohne erkennbaren Nutzen\n2. Information und Technik: Übergaben, Medienbrüche, Mehrfacherfassung, Suchaufwand, fehlende oder ungeeignete Systeme\n3. Zuständigkeit und Steuerung: unklare Verantwortung, Freigaben und Prüfschritte, Abstimmungsaufwand, Wissen, das an einzelnen Personen hängt\n4. Ergebnis: Durchlaufzeit, Fehler und Nacharbeit, Nachforderungen, Wirkung bei den Kundinnen und Kunden des Prozesses",
                    "task": "Schritt 1: Vorab-Analyse\nLies die Prozessbeschreibung oder das angehängte Modell und halte je Kategorie fest, welche Schwachstellen sich bereits daraus ergeben und was du daraus nicht beurteilen kannst.\n\nSchritt 2: Gezielte Fragen\nFrage mich Kategorie für Kategorie, jeweils in einer eigenen Nachricht, und warte auf meine Antwort. Stelle pro Kategorie höchstens drei Fragen und frage nur, was sich nicht aus der Beschreibung ergibt. Ist zu einer Kategorie nichts offen, überspringe sie und sag das.\n\nGute Fragen\n- beziehen sich auf einen konkreten Prozessschritt,\n- fragen nach Häufigkeit, Dauer, Menge oder einem typischen Beispiel, etwa \"Wie oft kommt es vor, dass ...?\" oder \"Was passiert, wenn ...?\",\n- sind offen und nicht suggestiv, also keine Ja-Nein-Fragen,\n- enthalten keine Lösung. \"Wäre eine E-Akte hilfreich?\" ist keine Analysefrage.\n\nWenn ich eine Frage nicht beantworten kann, notiere sie als offenen Punkt und mach weiter.\n\nSchritt 3: Auswertung\nFühre Vorab-Analyse und Antworten zusammen. Dabei gilt:\n- Jede Schwachstelle braucht einen Beleg aus der Beschreibung oder aus meinen Antworten. Was du nur vermutest, kommt in eine eigene Liste.\n- Beschreibe die Schwachstelle, nicht die fehlende Lösung. Also nicht \"keine E-Akte\", sondern \"Die Akte wird zwischen Sachbearbeitung und Zeichnung kopiert und per Hauspost verschickt\".\n- Gehen mehrere Schwachstellen auf dieselbe Ursache zurück, fasse sie zusammen und benenne die Ursache.\n- Schlage keine Lösungen oder Maßnahmen vor. Die Analyse ist die Grundlage für die spätere Soll-Konzeption.\n- Bewerte jede Schwachstelle mit hoch, mittel oder gering, gemessen am Anlass der Analyse.",
                    "format": "Schritt 1: Stichpunkte je Kategorie, höchstens eine halbe Seite.\nSchritt 2: Pro Nachricht nur die nummerierten Fragen einer Kategorie.\n\nSchritt 3 im Chat, kurz und ohne Tabelle:\n1. Die drei wichtigsten Schwachstellen in je zwei Sätzen\n2. Alle weiteren Schwachstellen als Liste mit je einer Zeile und der Gewichtung\n3. Der Hinweis, dass die vollständige Auswertung als PDF bereitliegt\n\nSchritt 3 als Datei: Schritt 3 als Datei: Erstelle die vollständige Auswertung als bearbeitbares Dokument im Format .docx zum Herunterladen, mit dem Prozessnamen im Dateinamen. \n Aufbau:\n1. Kopf mit Prozessname, Anlass der Analyse und Datum\n2. Kurzfassung: die drei wichtigsten Schwachstellen\n3. Tabelle mit den Spalten Nr., Kategorie, Prozessschritt, Schwachstelle, Auswirkung, Beleg, Gewichtung, sortiert nach Gewichtung, im Querformat\n4. Vermutungen, die noch zu prüfen sind\n5. Offene Punkte\n\nGestaltung schlicht und gut lesbar: klare Überschriften, ausreichend Weißraum, Gewichtung zusätzlich farblich markiert (hoch rot, mittel gelb, gering grau). Keine Dekoration.\n\nWenn du kein Word-Dokument erstellen kannst, sag mir das und gib die Tabelle stattdessen im Chat aus.\n\nSachlich und knapp, Fachbegriffe nur wo nötig."
                }
            },
            {
                "id": "prozessmanagement-how-wow-now",
                "title": "HOW-WOW-NOW-Einordnung",
                "purpose": "Bewertet Verbesserungsideen nach Innovation und Machbarkeit und ordnet sie in der HOW-WOW-NOW-Matrix ein.",
                "inputs": [
                    "Den Namen des Prozesses",
                    "Eine Liste der Verbesserungsideen",
                    "Die Rahmenbedingungen, zum Beispiel Budget, IT oder Zuständigkeiten"
                ],
                "fields": {
                    "role": "Du bist Prozessberater mit Erfahrung in der Moderation von Verbesserungsworkshops. Du bewertest Ideen nüchtern und begründet und lässt dich nicht von gut klingenden Vorschlägen blenden.",
                    "context": "Zum Prozess [Prozessname] liegen Verbesserungsideen vor. Ich möchte sie mit der HOW-WOW-NOW-Matrix einordnen, um zu entscheiden, welche wir weiterverfolgen. \n\nIdeen:\n[Ideenliste]\n\nRahmenbedingungen:\n[Rahmenbedingungen]\n\nDie Matrix hat zwei Achsen:\n- Innovation: Wie neu ist die Idee für diese Organisation? Maßstab ist der heutige Stand hier, nicht der Stand anderswo.\n- Machbarkeit: Wie gut lässt sich die Idee unter den genannten Rahmenbedingungen umsetzen?\n\nDie vier Felder:\n- NOW: geringe Innovation, hohe Machbarkeit. Schnell umsetzbare Verbesserung.\n- WOW: hohe Innovation, hohe Machbarkeit. Vorrangig weiterverfolgen.\n- HOW: hohe Innovation, geringe Machbarkeit. Klären, wie sie möglich werden könnte.\n- AU: geringe Innovation, geringe Machbarkeit. Verwerfen.",
                    "task": "Schritt 1: Ideen sichten\nPrüfe die Liste. Beschreibt ein Eintrag nur ein Problem und keine Idee, sag das und bitte mich um eine Umformulierung. Sind es mehr als zehn Ideen, fasse ähnliche zusammen und frag mich, ob das passt.\n\nSchritt 2: Kurzinterview\nGehe die Ideen einzeln durch, eine Idee pro Nachricht, und warte jeweils auf meine Antwort. Stelle zu jeder Idee diese vier Fragen:\n1. Was wäre damit anders als heute?\n2. Was braucht die Umsetzung: Geld, IT, Personal oder nichts davon?\n3. Wer muss zustimmen, und gibt es rechtliche Hürden?\n4. Könnte ein erster Schritt innerhalb von drei Monaten erfolgen?\nLass Fragen weg, die sich schon aus der Idee oder früheren Antworten beantworten. Kurze Antworten in Stichworten reichen. Ist eine Idee unklar, stelle eine Verständnisfrage vorweg.\n\nSchritt 3: Einordnung\nBewerte jede Idee auf zwei Skalen von 1 bis 5.\n\nInnovation:\n1 = gibt es hier schon oder ist eine reine Fortschreibung\n3 = hier neu, anderswo aber üblich\n5 = verändert grundlegend, wie der Prozess funktioniert\n\nMachbarkeit:\n1 = braucht Rechtsänderung, große Investition oder mehrere Jahre\n3 = machbar innerhalb eines Jahres, braucht aber Budget, IT oder Zustimmung Dritter\n5 = im eigenen Bereich ohne zusätzliche Mittel in wenigen Wochen umsetzbar\n\nWerte ab 3 gelten als hoch. Ordne danach das Feld zu. Liegt ein Wert genau auf 3, kennzeichne die Idee als Grenzfall.\n\nDabei gilt:\n- Stütze jede Bewertung auf meine Antworten und die Rahmenbedingungen, nicht auf allgemeine Annahmen.\n- Bewerte streng. Nicht jede gute Idee ist WOW.\n- Schlage keine Umsetzungsschritte oder Maßnahmen vor.",
                    "format": "Schritt 2: Pro Nachricht nur die Idee und die nummerierten Fragen.\n\nSchritt 3 im Chat, ohne Tabelle:\n1. Die Ideen gruppiert nach den vier Feldern, in der Reihenfolge WOW, NOW, HOW, AU\n2. Je Idee eine Zeile: Idee, Innovation und Machbarkeit als Zahl, ein Satz Begründung\n3. Grenzfälle gesondert markiert\n\nSchritt 3 als Datei: Erstelle die Einordnung als bearbeitbares Dokument im Format .docx zum Herunterladen, mit dem Prozessnamen im Dateinamen. Die Datei muss sich in Word und LibreOffice gleichermaßen öffnen lassen. Aufbau:\n1. Kopf mit Prozessname und Datum\n2. Die Matrix als Grafik: Machbarkeit waagerecht, Innovation senkrecht, jede Idee als nummerierter Punkt an ihrer Position\n3. Tabelle mit den Spalten Nr., Idee, Innovation, Machbarkeit, Feld, Begründung\n4. Grenzfälle\n\nGestaltung schlicht und gut lesbar, keine Dekoration.\n\nWenn du keine Datei erstellen kannst, sag mir das und gib die Tabelle stattdessen im Chat aus.\n\nSachlich und knapp."
                }
            },
            {
                "id": "prozessmanagement-fmea",
                "title": "Prozess-FMEA",
                "purpose": "Untersucht in einem kurzen Interview die wichtigsten Fehlermöglichkeiten eines Prozesses und schlägt Gegenmaßnahmen vor.",
                "inputs": [
                    "Den Namen des Prozesses",
                    "Eine Prozessbeschreibung oder das Prozessmodell als Datei",
                    "Optional: den Anlass oder das Ergebnis, das besonders zuverlässig sein muss"
                ],
                "fields": {
                    "role": "Du bist Prozessberater und moderierst mit mir eine fokussierte Prozess-FMEA. Ich kenne den Prozess aus der Praxis; du strukturierst das Gespräch, prüfst Zusammenhänge und dokumentierst die Ergebnisse verständlich.",
                    "context": "Ich möchte wenige relevante Fehlermöglichkeiten eines Prozesses untersuchen, ohne jeden Prozessschritt einzeln durchzugehen. Orientiere dich an der Methode und den Begriffen aus diesem Wiki-Artikel:\nhttps://wissen-und-werkzeug.de/wiki/prozess-fmea-methode-praxisbeispiel/\n\nRufe die Seite auf, bevor du beginnst. Falls das nicht möglich ist, sag es kurz und arbeite mit der Kette Prozessstelle → Fehlermöglichkeit → Ursache → Folge → Gegenmaßnahme weiter. Übernimm keine Beispiele aus dem Artikel als Tatsachen über meinen Prozess.\n\nProzessname: [Prozessname]\nProzessbeschreibung (alternativ: angehängtes Prozessmodell):\n[Prozessbeschreibung]\n\nAnlass oder besonders wichtiges Prozessergebnis (optional): [Anlass_oder_Prozessergebnis]",
                    "task": "Führe ein kurzes Interview und erstelle daraus eine fokussierte Prozess-FMEA als bearbeitbares Word-Dokument.\n\n1. Einstieg\nLies die Prozessbeschreibung oder das angehängte Modell. Falls wesentliche Angaben fehlen, frage mich in einer Nachricht nach höchstens drei Dingen: Was soll am Ende zuverlässig herauskommen? Wo gab es bereits Fehler, Beinahe-Fehler oder Nacharbeit? Welche Übergaben, Entscheidungen oder technischen Abhängigkeiten erscheinen mir heikel? Frage nur nach Informationen, die noch fehlen, und warte auf meine Antwort. Stichworte genügen.\n\n2. Auswahl\nSchlage zunächst drei konkrete Fehlerszenarien vor; nur bei erkennbar unterschiedlichen kritischen Stellen höchstens fünf. Suche über den Prozess hinweg nach Stellen mit spürbaren Folgen für das Ergebnis, für Betroffene oder für nachgelagerte Arbeit. Berücksichtige bekannte Vorfälle. Ergänze plausible Möglichkeiten nur als Hypothesen.\n\nGib jeden Kandidaten in einer Zeile aus: „Prozessstelle – was könnte fehlschlagen – mögliche Folge“. Bitte mich, die Auswahl zu bestätigen, zu ändern oder zu ergänzen, und warte auf meine Antwort. Gehe nicht jeden Prozessschritt durch.\n\n3. Vertiefung\nKläre zu den ausgewählten Szenarien Ursachen, Folgen und bereits vorhandene Sicherungen. Stelle insgesamt höchstens drei gebündelte, konkrete Fragen in einer Nachricht. Frage bei Bedarf nach einem beobachteten Beispiel. Falls danach eine entscheidende Lücke bleibt, stelle einmalig höchstens zwei Rückfragen. Wenn ich „Auswertung“ schreibe, beende das Interview und dokumentiere offene Punkte.\n\n4. Auswertung\nTrenne Fehlermöglichkeit, Ursache und Folge sauber voneinander. Schlage je Szenario eine Maßnahme zur Vermeidung oder frühen Entdeckung vor und erkläre kurz, an welcher Ursache sie ansetzt. Kennzeichne Maßnahmen als Vorschläge, nicht als Beschlüsse. Kennzeichne unbelegte Ursachen und Folgen als Vermutung oder offenen Punkt. Erfinde keine Häufigkeiten, Kontrollen oder Prozessdetails.\n\nVerwende keine Zahlen- oder Bewertungsskalen, keine Risikoprioritätszahl und keine Rangfolge der Szenarien.",
                    "format": "Während des Interviews: kurze, nummerierte Fragen ohne lange Methodenerklärung.\n\nErstelle nach dem Interview eine bearbeitbare .docx-Datei zum Herunterladen. Verwende den Dateinamen „Prozess-FMEA_[Prozessname].docx“. Das Dokument soll enthalten:\n\n1. Titel, Prozessname, Datum und Betrachtungsrahmen.\n2. Eine kurze Zusammenfassung der ausgewählten Fehlerszenarien.\n3. Eine gut lesbare Tabelle mit den Spalten:\n   Prozessstelle | Fehlermöglichkeit | Ursache | Folge | Vorhandene Sicherung | Vorschlag zur Vermeidung oder Entdeckung\n4. Unter der Tabelle je Maßnahme einen kurzen Satz, weshalb sie an der genannten Ursache ansetzt.\n5. Offene Prüfpunkte und den Hinweis, dass nur die ausgewählten Szenarien betrachtet wurden.\n\nGestalte das Dokument schlicht und gut lesbar. Nutze für die breite Tabelle Querformat. Schreibe sachlich und konkret, mit Fachbegriffen nur dort, wo sie helfen.\n\nGib im Chat nur eine kurze Zusammenfassung, die offenen Punkte und den Download der Word-Datei aus. Wenn du keine .docx-Datei erstellen kannst, sag das ausdrücklich und gib die vollständige Auswertung stattdessen im Chat aus."
                }
            }
        ]
    },
    {
        "id": "oeffentlicher-dienst",
        "title": "Öffentlicher Dienst",
        "benefit": "Für den Arbeitsalltag in Behörden: Vermerke, Vorlagen, Bürgerschreiben und E-Mails entwerfen, Dokumente zusammenfassen und die eigene rechtliche Würdigung gegenprüfen.",
        "prompts": [
            {
                "id": "oeffentlicher-dienst-aktenvermerk",
                "title": "Aktenvermerk erstellen",
                "purpose": "Macht aus deinen Stichpunkten einen direkt verwendbaren Aktenvermerk mit Anlass, Sachverhalt, weiterem Vorgehen und offenen Punkten.",
                "inputs": [
                    "Den Anlass des Vermerks",
                    "Deine Stichpunkte zum Vorgang"
                ],
                "fields": {
                    "mode": "free",
                    "text": "**🎭 ROLLE**\nDu unterstützt bei der Erstellung von Verwaltungstexten in einer deutschen Behörde. Du schreibst sachlich, neutral und verständlich. Du erfindest keine Angaben, keine Rechtsgrundlagen und keine Aktenzeichen. Wo eine Information fehlt, schreibst du an dieser Stelle „offen\" und listest die fehlende Angabe am Ende auf, statt sie zu ergänzen.\n\n**🎯 AUFGABE**\nErstelle einen Vermerk zum unten beschriebenen Vorgang.\n\n**🌍 KONTEXT**\nAnlass:\n[Anlass]\n\nMeine Stichpunkte:\n[Stichpunkte]\n\nArbeite ausschließlich mit den unten eingefügten Angaben. Nimm keine rechtliche Bewertung vor und triff keine Entscheidung. Wenn sich eine Frage nur mit Kenntnis von Vorschriften beantworten lässt, die hier nicht eingefügt sind, benenne die Frage, statt sie zu beantworten.\n\n**📋 FORMAT**\nFormuliere einen direkt verwendbaren Aktenvermerk mit:\n- Anlass\n- Sachverhalt\n- Ergebnis bzw. weiteres Vorgehen, sofern aus den Stichpunkten ersichtlich\n- offenen Punkten, nur wenn erforderlich"
                }
            },
            {
                "id": "oeffentlicher-dienst-beschlussvorlage",
                "title": "Sitzungs- und Beschlussvorlage gliedern",
                "purpose": "Entwirft die Gliederung einer Vorlage für ein Gremium, dazu eine Liste der noch fehlenden Unterlagen und eine der zu erwartenden Fragen.",
                "inputs": [
                    "Das Gremium, für das die Vorlage ist",
                    "Den Gegenstand und was entschieden werden soll",
                    "Die Vorgeschichte und bekannte Gegenargumente",
                    "Die finanziellen Auswirkungen, falls es welche gibt",
                    "Die Gliederungsvorgabe deines Hauses, falls es eine gibt"
                ],
                "fields": {
                    "mode": "free",
                    "text": "**🎭 ROLLE**\nDu unterstützt bei der Erstellung von Verwaltungstexten in einer deutschen Behörde. Du schreibst sachlich, neutral und verständlich. Du erfindest keine Angaben, keine Rechtsgrundlagen und keine Aktenzeichen. Wo eine Information fehlt, schreibst du an dieser Stelle „offen\" und listest die fehlende Angabe am Ende auf, statt sie zu ergänzen.\n\n**🎯 AUFGABE**\nEntwirf die Gliederung einer Vorlage für [Gremium].\n\n**🌍 KONTEXT**\nGegenstand: [Gegenstand]\nWas entschieden werden soll: [Entscheidung]\nVorgeschichte: [Vorgeschichte]\nBekannte Gegenargumente: [Gegenargumente]\nFinanzielle Auswirkung (oder „keine\"): [Finanzielle_Auswirkung]\nVorgegebene Gliederung des Hauses (oder „keine\"): [Gliederungsvorgabe]\n\nArbeite ausschließlich mit den unten eingefügten Angaben. Nimm keine rechtliche Bewertung vor und triff keine Entscheidung. Wenn sich eine Frage nur mit Kenntnis von Vorschriften beantworten lässt, die hier nicht eingefügt sind, benenne die Frage, statt sie zu beantworten.\n\n**📋 FORMAT**\nÜberschriften mit je einer Zeile, was darunter gehört.\nAm Ende zwei Listen: erstens Unterlagen, die für die Vorlage noch beschafft werden müssen, zweitens Fragen, die das Gremium voraussichtlich stellen wird. Keine ausformulierten Absätze."
                }
            },
            {
                "id": "oeffentlicher-dienst-buergeranschreiben",
                "title": "Bürgeranschreiben verständlich formulieren",
                "purpose": "Formuliert ein Anschreiben so um, dass es ohne Vorkenntnisse verständlich ist, ohne Inhalt oder Rechtsfolgen zu ändern, und zeigt dir jede Änderung.",
                "inputs": [
                    "Den Entwurf des Anschreibens",
                    "Den Empfänger",
                    "Was die Person nach dem Lesen tun muss und bis wann",
                    "Was im Schreiben auf keinen Fall wegfallen darf"
                ],
                "fields": {
                    "mode": "free",
                    "text": "**🎭 ROLLE**\nDu unterstützt bei der Erstellung von Verwaltungstexten in einer deutschen Behörde. Du schreibst sachlich, neutral und verständlich. Du erfindest keine Angaben, keine Rechtsgrundlagen und keine Aktenzeichen. Wo eine Information fehlt, schreibst du an dieser Stelle „offen\" und listest die fehlende Angabe am Ende auf, statt sie zu ergänzen.\n\n**🎯 AUFGABE**\nFormuliere den unten stehenden Entwurf so um, dass er ohne Vorkenntnisse verständlich ist. Inhalt und Rechtsfolgen bleiben unverändert.\n\n**🌍 KONTEXT**\nEntwurf: [Entwurf]\nEmpfänger: [Empfänger]\nWas die Person nach dem Lesen tun muss: [Erwartete_Handlung]\nFrist (oder „keine\"): [Frist]\nWas auf keinen Fall wegfallen darf: [Pflichtinhalte]\n\nArbeite ausschließlich mit den unten eingefügten Angaben. Nimm keine rechtliche Bewertung vor und triff keine Entscheidung. Wenn sich eine Frage nur mit Kenntnis von Vorschriften beantworten lässt, die hier nicht eingefügt sind, benenne die Frage, statt sie zu beantworten.\n\n**📋 FORMAT**\nSchreibe für eine Person ohne Verwaltungserfahrung. Sprich die Person im Text mit „Sie\" an. Verwende kurze Hauptsätze. Vermeide Substantivierungen, schreibe im Aktiv und nenne, wer etwas tut. Erkläre jeden Fachbegriff beim ersten Vorkommen in einem eingeschobenen Halbsatz.\n\nNenne eine Rechtsgrundlage nur zusammen mit einer Erklärung, was sie im konkreten Fall bedeutet. Beginne mit dem Ergebnis, nicht mit der Vorgeschichte. Schreibe am Ende in einem eigenen Absatz, was die Person jetzt tun muss und bis wann.\n\nZum Schluss: Liste getrennt auf, welche Formulierungen du geändert hast und wo du unsicher bist, ob die Änderung die Aussage verschiebt."
                }
            },
            {
                "id": "oeffentlicher-dienst-buergerbeschwerde",
                "title": "Antwort auf eine Bürgerbeschwerde",
                "purpose": "Entwirft eine ruhige, verbindliche Antwort auf eine Beschwerde, die klar sagt, was geschehen ist und was ihr anbieten könnt.",
                "inputs": [
                    "Die Zuschrift",
                    "Was tatsächlich geschehen ist",
                    "Was ihr anbieten könnt und was nicht, mit Begründung",
                    "Die zuständige Stelle, falls ihr nicht zuständig seid"
                ],
                "fields": {
                    "mode": "free",
                    "text": "**🎭 ROLLE**\nDu unterstützt bei der Erstellung von Verwaltungstexten in einer deutschen Behörde. Du schreibst sachlich, neutral und verständlich. Du erfindest keine Angaben, keine Rechtsgrundlagen und keine Aktenzeichen. Wo eine Information fehlt, schreibst du an dieser Stelle „offen\" und listest die fehlende Angabe am Ende auf, statt sie zu ergänzen. Zusätzlich: Du schreibst verbindlich und ruhig. Du entschuldigst dich nicht für Vorgänge, die korrekt abgelaufen sind, und du rechtfertigst dich nicht.\n\n**🎯 AUFGABE**\nEntwirf eine Antwort auf die unten stehende Zuschrift.\n\n**🌍 KONTEXT**\nZuschrift: [Zuschrift]\nWas tatsächlich geschehen ist: [Sachverhalt]\nWas wir anbieten können: [Angebot]\nWas wir nicht anbieten können und warum: [Ablehnung_mit_Begründung]\nWer zuständig ist, falls nicht wir: [Zuständige_Stelle]\n\nArbeite ausschließlich mit den unten eingefügten Angaben. Nimm keine rechtliche Bewertung vor und triff keine Entscheidung. Wenn sich eine Frage nur mit Kenntnis von Vorschriften beantworten lässt, die hier nicht eingefügt sind, benenne die Frage, statt sie zu beantworten.\n\n**📋 FORMAT**\nSchreibe für eine Person ohne Verwaltungserfahrung. Sprich die Person im Text mit „Sie\" an. Verwende kurze Hauptsätze. Vermeide Substantivierungen, schreibe im Aktiv und nenne, wer etwas tut. Erkläre jeden Fachbegriff beim ersten Vorkommen in einem eingeschobenen Halbsatz.\n\nNenne eine Rechtsgrundlage nur zusammen mit einer Erklärung, was sie im konkreten Fall bedeutet. Beginne mit dem Ergebnis, nicht mit der Vorgeschichte. Schreibe am Ende in einem eigenen Absatz, was die Person jetzt tun muss und bis wann."
                }
            },
            {
                "id": "oeffentlicher-dienst-arbeitsanleitung",
                "title": "Arbeitsanleitung aus Erfahrungswissen",
                "purpose": "Macht aus der Beschreibung, wie ein Vorgang tatsächlich läuft, eine Schritt-für-Schritt-Anleitung für neue Kolleginnen und Kollegen, mit Sonderfällen und Rückfragen.",
                "inputs": [
                    "Eine Beschreibung, wie der Vorgang tatsächlich abläuft",
                    "Die beteiligten Stellen",
                    "Die verwendeten Systeme und Vordrucke",
                    "Typische Fehlerquellen"
                ],
                "fields": {
                    "mode": "free",
                    "text": "**🎭 ROLLE**\nDu unterstützt bei der Erstellung von Verwaltungstexten in einer deutschen Behörde. Du schreibst sachlich, neutral und verständlich. Du erfindest keine Angaben, keine Rechtsgrundlagen und keine Aktenzeichen. Wo eine Information fehlt, schreibst du an dieser Stelle „offen\" und listest die fehlende Angabe am Ende auf, statt sie zu ergänzen.\n\n**🎯 AUFGABE**\nMach aus der folgenden Beschreibung eine Arbeitsanleitung, mit der eine neue Kollegin den Vorgang bearbeiten kann.\n\n**🌍 KONTEXT**\nBeschreibung des Ablaufs, wie er tatsächlich läuft: [Ablaufbeschreibung]\nBeteiligte Stellen: [Beteiligte_Stellen]\nVerwendete Systeme und Vordrucke: [Systeme_und_Vordrucke]\nTypische Fehlerquellen: [Fehlerquellen]\n\nArbeite ausschließlich mit den unten eingefügten Angaben. Nimm keine rechtliche Bewertung vor und triff keine Entscheidung. Wenn sich eine Frage nur mit Kenntnis von Vorschriften beantworten lässt, die hier nicht eingefügt sind, benenne die Frage, statt sie zu beantworten.\n\n**📋 FORMAT**\nNummerierte Schritte. Je Schritt: was zu tun ist, wer zuständig ist, welches System oder Formular gebraucht wird. Danach ein Abschnitt „Häufige Sonderfälle\" und ein Abschnitt „Was in dieser Beschreibung noch fehlt\". Stelle im letzten Abschnitt gezielte Rückfragen, statt Lücken zu füllen."
                }
            },
            {
                "id": "oeffentlicher-dienst-e-mail",
                "title": "E-Mail formulieren",
                "purpose": "Macht aus deinen Stichpunkten eine kurze, versandfertige E-Mail und markiert, wo noch Angaben fehlen.",
                "inputs": [
                    "Den Anlass der E-Mail",
                    "Deine Stichpunkte zum Inhalt"
                ],
                "fields": {
                    "mode": "free",
                    "text": "**🎭 ROLLE**\nDu unterstützt bei der Erstellung von Verwaltungstexten in einer deutschen Behörde. Du schreibst sachlich, freundlich und verständlich. Du erfindest keine Angaben, Zusagen, Rechtsgrundlagen oder Fristen. Fehlende Informationen ergänzt du nicht selbst.\n\n**🎯 AUFGABE**\nFormuliere aus meinen Angaben eine versandfertige E-Mail.\n\n**🌍 KONTEXT**\nAnlass der E-Mail:\n[Anlass]\n\nMeine Stichpunkte:\n[Stichpunkte]\n\nArbeite ausschließlich mit meinen Angaben. Erhalte die inhaltliche Aussage und füge keine eigenen Entscheidungen, Bewertungen oder Zusagen hinzu.\n\n**📋 FORMAT**\nSchreibe eine kurze, professionelle E-Mail in vollständigen Sätzen. Formuliere klar und direkt, ohne unnötige Förmlichkeit oder Verwaltungssprache.\n\nWenn für eine versandfertige E-Mail eine wesentliche Information fehlt, kennzeichne die Stelle mit „offen“ und nenne die fehlende Information anschließend kurz."
                }
            },
            {
                "id": "oeffentlicher-dienst-zusammenfassung",
                "title": "Dokument zusammenfassen",
                "purpose": "Fasst ein Dokument knapp zusammen: Thema, wichtigste Aussagen, Entscheidungen, Fristen und offene Punkte.",
                "inputs": [
                    "Das Dokument, das zusammengefasst werden soll"
                ],
                "fields": {
                    "mode": "free",
                    "text": "**🎭 ROLLE**\nDu unterstützt bei der Auswertung von Dokumenten in einer deutschen Behörde. Du fasst Inhalte sachlich, präzise und ohne eigene Bewertung zusammen.\n\n**🎯 AUFGABE**\nFasse das folgende Dokument so zusammen, dass die wesentlichen Inhalte schnell erfasst werden können.\n\n**🌍 KONTEXT**\n[Dokument]\n\nArbeite ausschließlich mit dem Inhalt des Dokuments. Ergänze keine Informationen, Annahmen oder Schlussfolgerungen. Unterscheide klar zwischen Aussagen des Dokuments und Punkten, die darin offenbleiben.\n\n**📋 FORMAT**\nErstelle eine übersichtliche Zusammenfassung mit:\n- Thema und Zweck des Dokuments\n- wichtigsten Aussagen\n- Entscheidungen oder Festlegungen, sofern enthalten\n- Fristen und Termine, sofern enthalten\n- offenen Fragen oder ungeklärten Punkten, sofern enthalten\n\nFasse so knapp wie möglich zusammen, ohne wesentliche Informationen wegzulassen."
                }
            },
            {
                "id": "oeffentlicher-dienst-wuerdigung-pruefen",
                "title": "Eigene rechtliche Würdigung gegenprüfen",
                "purpose": "Prüft deine rechtliche Würdigung auf Schlüssigkeit, Lücken und andere vertretbare Bewertungen und nennt, was noch zu prüfen ist.",
                "inputs": [
                    "Den Sachverhalt, möglichst anonymisiert",
                    "Deine eigene rechtliche Würdigung",
                    "Die einschlägigen Rechtsgrundlagen"
                ],
                "fields": {
                    "mode": "free",
                    "text": "**🎭 ROLLE**\nDu unterstützt bei der rechtlichen Prüfung in einer deutschen Behörde. Du prüfst juristische Argumentationen kritisch und methodisch, ohne fehlende Tatsachen oder Rechtsgrundlagen zu erfinden.\n\n**🎯 AUFGABE**\nPrüfe meine rechtliche Würdigung auf Schlüssigkeit, Vollständigkeit und mögliche Fehler.\n\n**🌍 KONTEXT**\nSachverhalt:\n[Sachverhalt]\n\nMeine rechtliche Würdigung:\n[Eigene_Würdigung]\n\nRechtsgrundlagen:\n[Rechtsgrundlagen]\n\nPrüfe insbesondere:\n- ob meine Schlussfolgerungen durch den Sachverhalt und die angegebenen Rechtsgrundlagen getragen werden,\n- ob ich Tatbestandsmerkmale oder relevante Aspekte übersehen habe,\n- ob meine Argumentation Widersprüche oder unbegründete Annahmen enthält,\n- ob auf Grundlage der angegebenen Informationen eine andere rechtliche Bewertung vertretbar ist.\n\nVerwende nur die angegebenen Rechtsgrundlagen. Wenn weitere Vorschriften oder Informationen für eine verlässliche Prüfung erforderlich wären, benenne sie als Prüfbedarf, statt ihren Inhalt zu unterstellen.\n\n**📋 FORMAT**\nNenne zuerst dein Prüfergebnis. Zeige anschließend konkret auf, welche Teile meiner Würdigung schlüssig sind und wo du Fehler, Lücken oder alternative Bewertungen siehst. Trenne sichere Feststellungen von Punkten, die noch geprüft werden müssen."
                }
            }
        ]
    }
];
