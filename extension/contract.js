// Promptomizer Chrome-Extension – Vertragsfunktionen.
//
// Die Funktionen prefixSearchQuery, structuredValues und promptToText sind
// zeichengleiche Kopien aus library.js, isFreeCollectionPrompt und toStorageFields
// aus collections.js (siehe CLAUDE.md §7a, Kopplung). tests/extension-contract-smoke.cjs
// vergleicht den Quelltext und prüft libraryFieldsPayload gegen getCurrentLibraryFieldsPayload
// in app.html; wer diese Stellen in der App ändert, muss hier nachziehen.
//
// Die Datei ist ein klassisches Browser-Skript (Global PromptomizerContract)
// und zugleich per require() aus Node ladbar.
const PromptomizerContract = (() => {
    function prefixSearchQuery(value) {
        return String(value || '')
            .match(/[\p{L}\p{N}]+/gu)
            ?.map(term => `${term.toLocaleLowerCase('de-DE')}:*`)
            .join(' & ') || '';
    }

    function structuredValues(prompt) {
        const result = { role: '', context: '', task: '', format: '' };
        const fields = prompt?.fields;
        const order = ['role', 'context', 'task', 'style', 'format'];
        if (Array.isArray(fields)) {
            fields.forEach((value, index) => {
                const key = order[index];
                if (Object.prototype.hasOwnProperty.call(result, key)) result[key] = value || '';
            });
        } else if (fields && typeof fields === 'object') {
            const source = fields.mode === 'structured' ? fields.fields : fields;
            if (Array.isArray(source)) {
                source.forEach((value, index) => {
                    const key = order[index];
                    if (Object.prototype.hasOwnProperty.call(result, key)) result[key] = value || '';
                });
            } else if (source && typeof source === 'object') {
                Object.keys(result).forEach(key => { result[key] = source[key] || ''; });
            }
        }
        return result;
    }

    function promptToText(prompt) {
        if (!prompt) return '';
        if (prompt.prompt_type === 'free' || prompt.fields?.mode === 'free' || typeof prompt.fields?.text === 'string') {
            return String(prompt.fields?.text || '');
        }
        const values = structuredValues(prompt);
        const labels = {
            role: '🎭 ROLLE',
            context: '🌍 KONTEXT',
            task: '🎯 AUFGABE',
            format: '📋 FORMAT'
        };
        return Object.keys(labels)
            .filter(key => String(values[key] || '').trim())
            .map(key => `**${labels[key]}**\n${String(values[key]).trim()}`)
            .join('\n\n');
    }

    // Zeichengleiche Kopien aus collections.js: Speicherformat bei der Übernahme
    // eines Kollektions-Prompts in die Bibliothek.
    function isFreeCollectionPrompt(prompt) {
        return prompt?.fields?.mode === 'free';
    }

    function toStorageFields(prompt) {
        const fields = prompt?.fields || {};
        if (isFreeCollectionPrompt(prompt)) {
            return { mode: 'free', text: String(fields.text ?? '').replace(/\r\n/g, '\n') };
        }
        return [
            String(fields.role ?? ''),
            String(fields.context ?? ''),
            String(fields.task ?? ''),
            '',
            String(fields.format ?? '')
        ];
    }

    // Speicherformat beim Anlegen und Ändern eines Prompts, wie getCurrentLibraryFieldsPayload
    // in app.html: strukturiert [role, context, task, '', format], frei { mode: 'free', text }.
    // Die App liest die Werte aus dem DOM, deshalb kein Quelltextvergleich: der Drift-Test
    // führt die App-Funktion mit nachgebautem DOM aus und vergleicht die Ergebnisse.
    function libraryFieldsPayload(mode, values) {
        if (mode === 'free') {
            return {
                mode: 'free',
                text: String(values?.text || '').replace(/\r\n/g, '\n')
            };
        }
        return [
            values?.role || '',
            values?.context || '',
            values?.task || '',
            '',
            values?.format || ''
        ];
    }

    // Einsatzbereich eines Bausteins wie saveEditor in snippet-library.js.
    function snippetModeFor(fieldId) {
        return fieldId === 'free' ? 'free' : 'structured';
    }

    // Ab hier Ergänzungen nur für die Extension (kein Gegenstück in library.js).

    // Baustein-Kopiertext ist der unveränderte Inhalt (snippet-library.js copySnippet).
    function snippetToText(snippet) {
        return String(snippet?.content || '');
    }

    // Tokenizer wie prefixSearchQuery, nur ohne ":*"-Suffix.
    function searchTerms(value) {
        return (String(value || '').match(/[\p{L}\p{N}]+/gu) || [])
            .map(term => term.toLocaleLowerCase('de-DE'));
    }

    // Semantik von "a:* & b:*": jeder Suchbegriff ist Präfix mindestens eines Tokens.
    function matchesSearch(tokens, query) {
        const terms = searchTerms(query);
        return terms.every(term => tokens.some(token => token.startsWith(term)));
    }

    function promptSearchTokens(prompt) {
        return searchTerms([prompt?.name, prompt?.description, prompt?.category, promptToText(prompt)].join(' '));
    }

    function snippetSearchTokens(snippet) {
        return searchTerms([snippet?.name, snippet?.content].join(' '));
    }

    // Standardsortierung der Bibliothek: is_favorite desc, last_used_at desc (nulls last),
    // updated_at desc, id desc (library.js getLibraryPrompts / db.js getLibrarySnippets).
    function compareLibraryOrder(a, b) {
        const favA = !!a?.is_favorite;
        const favB = !!b?.is_favorite;
        if (favA !== favB) return favB ? 1 : -1;
        const usedA = a?.last_used_at || '';
        const usedB = b?.last_used_at || '';
        if (usedA !== usedB) {
            if (!usedA) return 1;
            if (!usedB) return -1;
            return usedB > usedA ? 1 : -1;
        }
        const updA = a?.updated_at || '';
        const updB = b?.updated_at || '';
        if (updA !== updB) return updB > updA ? 1 : -1;
        return Number(b?.id || 0) - Number(a?.id || 0);
    }

    return {
        prefixSearchQuery,
        structuredValues,
        promptToText,
        isFreeCollectionPrompt,
        toStorageFields,
        libraryFieldsPayload,
        snippetModeFor,
        snippetToText,
        searchTerms,
        matchesSearch,
        promptSearchTokens,
        snippetSearchTokens,
        compareLibraryOrder
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PromptomizerContract;
