const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.html'), 'utf8');

const between = (start, end) => {
    const from = app.indexOf(start);
    assert(from >= 0, `Anfang fehlt: ${start}`);
    const to = app.indexOf(end, from + start.length);
    assert(to > from, `Ende fehlt: ${end}`);
    return app.slice(from, to);
};

// Sidebar: Plus neben "Bausteine", als eigener Button neben dem Umschalter (nicht verschachtelt)
const sidebarHeader = between('onclick="toggleSnippetsSection()"', 'id="snippets-body"');
assert(sidebarHeader.includes('id="sidebar-new-snippet-btn"'));
assert(sidebarHeader.includes('onclick="openNewSnippetModal()"'));
assert(sidebarHeader.includes('aria-label="Baustein anlegen"'));
const toggleButton = sidebarHeader.slice(0, sidebarHeader.indexOf('</button>'));
assert(!toggleButton.includes('sidebar-new-snippet-btn'));

// Vorbelegung: aktives Feld im strukturierten Modus, sonst Kontext; freier Modus -> free
const openNew = between('function openNewSnippetModal()', 'function openFreeSnippetSaveModal()');
assert(openNew.includes("currentMode === 'free'"));
assert(openNew.includes('activeFieldId'));
assert(openNew.includes("'context'"));
assert(openNew.includes('closeMobileNav({ restoreFocus: false })'));
assert(openNew.includes('openSnippetModal({ categoryId })'));

// Einstellungen -> Bausteine verwalten: Header-Aktion "Baustein anlegen"
const settings = between('function renderSettingsPage()', 'if (contentEl)');
assert(settings.includes("settingsCurrentPage === 'snippets'"));
assert(settings.includes("openSnippetModal({ categoryId: 'context' })"));
assert(settings.includes('Baustein anlegen'));

// Dialog: Einsatzbereich statt Kategorie, Hinweis auf Kollektions-Platzhalter
const modal = between('id="modal-snippet"', 'saveSnippetFromModal()');
assert(modal.includes('<label class="ui-label">Einsatzbereich</label>'));
assert(!modal.includes('<label class="ui-label">Kategorie</label>'));
assert(modal.includes('Platzhalter von Kollektions-Prompts'));

// Speichern aktualisiert Zähler, Sidebar-Bereich und offene Baustein-Bibliothek
const save = between('async function saveSnippetFromModal()', "result.reason === 'FREE_LIMIT_REACHED'");
assert(save.includes('if (!isSnippetsOpen) toggleSnippetsSection();'));
assert(save.includes('await updatePromptCounter();'));
assert(save.includes('window.SnippetLibrary?.refreshAll?.()'));

console.log('snippet create entrypoints smoke ok');
