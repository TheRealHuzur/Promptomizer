(function () {
    'use strict';

    function legacyCopy(textElement) {
        const range = document.createRange();
        range.selectNodeContents(textElement);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
    }

    async function copyContent(button) {
        const targetId = button.getAttribute('data-copy-target');
        const target = targetId ? document.getElementById(targetId) : null;
        if (!target) return;

        const text = target.innerText.trim();
        const original = button.innerHTML;
        try {
            if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
            await navigator.clipboard.writeText(text);
            button.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Kopiert';
        } catch (error) {
            legacyCopy(target);
            button.innerHTML = '<i class="fa-solid fa-highlighter" aria-hidden="true"></i> Text markiert';
        }

        const statusId = button.getAttribute('aria-describedby');
        const status = statusId ? document.getElementById(statusId) : null;
        if (status) status.textContent = 'Der Text wurde kopiert oder zum manuellen Kopieren markiert.';

        window.setTimeout(() => {
            button.innerHTML = original;
            if (status) status.textContent = '';
        }, 2200);
    }

    function openTemplate(button) {
        const target = document.getElementById(button.getAttribute('data-open-template-target'));
        if (!target) return;
        const values = {};
        target.innerText.split(/\n+/).forEach((line) => {
            const match = line.match(/^(Rolle|Kontext|Aufgabe|Format):\s*(.*)$/i);
            if (!match) return;
            const key = { rolle: 'role', kontext: 'context', aufgabe: 'task', format: 'format' }[match[1].toLowerCase()];
            values[key] = match[2];
        });
        const params = new URLSearchParams(values);
        window.location.href = '/prompt-erstellen?' + params.toString();
    }

    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-copy-target]');
        if (button) copyContent(button);
        const openButton = event.target.closest('[data-open-template-target]');
        if (openButton) openTemplate(openButton);
    });
})();
