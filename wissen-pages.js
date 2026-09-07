/*
    Verhalten der Cornerstone-Wissensseiten unter /wissen/<slug>:
    1. Kopierfunktion fuer Promptbloecke mit Toast-Bestaetigung
    2. Auswahltest auf /wissen/prompt-techniken

    Diese Datei ersetzt auf den Wissensseiten content-pages.js. Beide zusammen
    zu laden wuerde jeden Kopierklick doppelt ausloesen, weil beide einen
    globalen click-Listener registrieren.

    Kein alert()/confirm(), Rueckmeldung ausschliesslich ueber den Toast
    (CLAUDE.md §7). Das DOM wird ueber textContent aufgebaut, nicht ueber
    innerHTML mit eingesetzten Werten.
*/
(function () {
    'use strict';

    /* ---------------------------------------------------------------
       Kopieren und Toast
       --------------------------------------------------------------- */

    let toastNode = null;
    let toastTimer = 0;

    function showToast(message) {
        if (!toastNode) {
            toastNode = document.createElement('div');
            toastNode.className = 'mp-toast';
            toastNode.setAttribute('role', 'status');
            toastNode.setAttribute('aria-live', 'polite');
            document.body.appendChild(toastNode);
        }
        toastNode.textContent = message;
        toastNode.hidden = false;
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => {
            if (toastNode) toastNode.hidden = true;
        }, 2000);
    }

    // Reihenfolge wie in content-pages.js: erst die Auswahl-Variante, die auch
    // ohne sicheren Kontext und ohne Clipboard-Berechtigung funktioniert.
    function copyWithLegacySelection(value) {
        const activeElement = document.activeElement;
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '-9999px';
        textarea.style.opacity = '0';
        document.body.append(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);

        let copied = false;
        try {
            copied = document.execCommand('copy');
        } catch (error) {
            console.warn('Legacy clipboard copy failed:', error);
        } finally {
            textarea.remove();
            activeElement?.focus?.();
        }
        return copied;
    }

    async function copyText(text) {
        const value = String(text ?? '');
        if (copyWithLegacySelection(value)) return;
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
        await navigator.clipboard.writeText(value);
    }

    async function copyFromBlock(button) {
        const block = button.closest('[data-prompt-block]');
        const pre = block && block.querySelector('pre');
        if (!pre) return;
        try {
            // textContent, damit Hervorhebungen im optimierten Prompt den
            // kopierten Text nicht veraendern.
            await copyText(pre.textContent);
            showToast('Prompt kopiert.');
        } catch (error) {
            console.error('Copy failed', error);
            showToast('Kopieren war nicht möglich.');
        }
    }

    document.addEventListener('click', (event) => {
        const button = event.target.closest('.mp-copy');
        if (button) copyFromBlock(button);
    });

    /* ---------------------------------------------------------------
       Auswahltest (nur /wissen/prompt-techniken)
       --------------------------------------------------------------- */

    const STEPS = [
        {
            q: 'Ist die Aufgabe einfach und eindeutig?',
            name: 'Direkte Anweisung',
            why: 'Starte mit einer direkten Anweisung. Ergänze nur nötigen Kontext und das gewünschte Format.',
            anchor: '#direkte-anweisung',
            prompt: 'Fasse den folgenden Text in fünf Stichpunkten zusammen.\nVerwende ausschließlich Informationen aus dem Text.\nJeder Stichpunkt darf höchstens einen Satz enthalten.\n\n[TEXT]'
        },
        {
            q: 'Fehlt eine bestimmte fachliche Perspektive oder Arbeitsweise?',
            name: 'Rollen-Prompting',
            why: 'Beschreibe Fachgebiet und Arbeitsweise, statt einen „Superexperten“ zu behaupten.',
            anchor: '#rollen-prompting',
            prompt: 'Du bist [konkrete Fachrolle].\nDu arbeitest [relevante Arbeitsweise].\n\n[Arbeitsauftrag]'
        },
        {
            q: 'Trifft die KI Stil, Klassifikation oder Ausgabeform trotz Erklärung nicht zuverlässig?',
            name: 'Beispiele und Few-Shot',
            why: 'Zeige ein bis drei geeignete Beispiele für das gewünschte Muster.',
            anchor: '#few-shot',
            prompt: 'Ordne jede Eingabe genau einer Kategorie zu.\n\nEingabe: [Beispiel 1]\nAusgabe: [LABEL]\n\nEingabe: [Beispiel 2]\nAusgabe: [LABEL]\n\nEingabe: [neuer Fall]\nAusgabe:'
        },
        {
            q: 'Besteht die Aufgabe aus mehreren anspruchsvollen Arbeitsschritten?',
            name: 'Prompt-Chaining',
            why: 'Zerlege die Arbeit in abhängige Etappen und prüfe jede Übergabe.',
            anchor: '#prompt-chaining',
            prompt: 'Schritt 1 von [n]: [erster Arbeitsschritt].\nGib nur das Ergebnis dieses Schritts aus.\nSchreibe noch nicht den fertigen Text.'
        },
        {
            q: 'Ist ein erster Entwurf vorhanden, aber noch zu allgemein oder sprachlich schwach?',
            name: 'Entwurf → Kritik → Überarbeitung',
            why: 'Trenne Bewerten und Überarbeiten und gib der Kritik konkrete Kriterien.',
            anchor: '#kritik',
            prompt: 'Prüfe den Entwurf anhand dieser Kriterien:\n1. [Kriterium]\n2. [Kriterium]\n\nGib noch keine Neufassung aus. Nenne die fünf wichtigsten\nVerbesserungen in absteigender Bedeutung.'
        },
        {
            q: 'Muss die Antwort ausschließlich auf vorgegebenen Dokumenten oder Daten beruhen?',
            name: 'Quellengebundenes Prompting',
            why: 'Begrenze die erlaubte Wissensgrundlage und lass Lücken kennzeichnen.',
            anchor: '#quellengebunden',
            prompt: 'Beantworte die Frage ausschließlich anhand der bereitgestellten Dokumente.\nKennzeichne fehlende Angaben als „nicht enthalten“.\nNenne bei jeder belegten Aussage Dokument und Abschnitt.\n\nFrage: [FRAGE]'
        }
    ];

    const FALLBACK = {
        name: 'Zuerst Ziel, Kontext und Aufgabe prüfen',
        why: 'Nicht jedes Problem benötigt eine zusätzliche Technik. Kläre erst das Ziel und schärfe Kontext und Arbeitsauftrag.',
        anchor: '/wissen/prompt-engineering',
        prompt: 'Ich will: [Ergebnis]\nFür: [Zielgruppe oder Anwendungsfall]\nDamit: [Nutzung oder Wirkung]\nGut ist das Ergebnis, wenn: [Kriterien]'
    };

    function initQuiz(root) {
        const resultsBox = root.querySelector('[data-test-results]');
        const askBox = root.querySelector('[data-test-ask]');
        const progressBox = root.querySelector('[data-test-progress]');
        const questionBox = root.querySelector('[data-test-question]');
        const controlsBox = root.querySelector('[data-test-controls]');
        const moreBtn = root.querySelector('[data-test-more]');
        const resetBtn = root.querySelector('[data-test-reset]');
        const yesBtn = root.querySelector('[data-test-yes]');
        const noBtn = root.querySelector('[data-test-no]');

        let idx = 0;
        let results = [];
        let asking = true;

        function buildCard(entry) {
            const card = document.createElement('div');
            card.className = 'mp-test-card';

            const kicker = document.createElement('div');
            kicker.className = 'mp-kick';
            kicker.textContent = 'Empfehlung';
            card.appendChild(kicker);

            const name = document.createElement('p');
            name.className = 'mp-test-name';
            name.textContent = entry.name;
            card.appendChild(name);

            const why = document.createElement('p');
            why.className = 'mp-p mp-test-why';
            why.textContent = entry.why;
            card.appendChild(why);

            const block = document.createElement('div');
            block.setAttribute('data-prompt-block', '');
            block.className = 'mp-test-block';

            const pre = document.createElement('pre');
            pre.className = 'mp-code';
            pre.textContent = entry.prompt;
            block.appendChild(pre);

            const actions = document.createElement('div');
            actions.className = 'mp-test-actions';

            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'mp-copy';
            const icon = document.createElement('i');
            icon.className = 'fa-solid fa-copy';
            icon.setAttribute('aria-hidden', 'true');
            copyBtn.appendChild(icon);
            copyBtn.appendChild(document.createTextNode('Mini-Prompt kopieren'));
            actions.appendChild(copyBtn);

            const jump = document.createElement('a');
            jump.className = 'mp-test-jump';
            jump.href = entry.anchor;
            jump.textContent = 'Zum Abschnitt →';
            actions.appendChild(jump);

            block.appendChild(actions);
            card.appendChild(block);
            return card;
        }

        function render() {
            resultsBox.textContent = '';
            results.forEach((entry) => resultsBox.appendChild(buildCard(entry)));

            const step = STEPS[idx];
            const showAsk = asking && Boolean(step);
            askBox.hidden = !showAsk;
            if (showAsk) {
                progressBox.textContent = 'Frage ' + (idx + 1) + ' von ' + STEPS.length;
                questionBox.textContent = step.q;
            }

            const showMore = !asking && results.length > 0 && idx < STEPS.length;
            moreBtn.hidden = !showMore;
            controlsBox.hidden = results.length === 0;
        }

        yesBtn.addEventListener('click', () => {
            const step = STEPS[idx];
            if (!step) return;
            results = results.concat([step]);
            idx += 1;
            asking = false;
            render();
        });

        noBtn.addEventListener('click', () => {
            if (idx + 1 < STEPS.length) {
                idx += 1;
            } else {
                // Letzte Frage verneint: Fallback zeigen und die Strecke
                // abschliessen, damit "Weitere Technik ergaenzen" nicht auf eine
                // bereits beantwortete Frage zurueckfuehrt.
                results = results.concat([FALLBACK]);
                idx = STEPS.length;
                asking = false;
            }
            render();
        });

        moreBtn.addEventListener('click', () => {
            asking = true;
            render();
        });

        resetBtn.addEventListener('click', () => {
            idx = 0;
            results = [];
            asking = true;
            render();
        });

        render();
    }

    document.addEventListener('DOMContentLoaded', () => {
        const quiz = document.querySelector('[data-technique-test]');
        if (quiz) initQuiz(quiz);
    });
})();
