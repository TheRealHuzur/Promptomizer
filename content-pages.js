(function () {
    'use strict';

    function copyTextWithLegacySelection(value) {
        const activeElement = document.activeElement;
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.top = "0";
        textarea.style.left = "-9999px";
        textarea.style.opacity = "0";
        document.body.append(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);

        let copied = false;
        try {
            copied = document.execCommand("copy");
        } catch (error) {
            console.warn("Legacy clipboard copy failed:", error);
        } finally {
            textarea.remove();
            activeElement?.focus?.();
        }
        return copied;
    }

    async function copyTextToClipboard(text) {
        const value = String(text ?? "");
        if (copyTextWithLegacySelection(value)) return;
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
        await navigator.clipboard.writeText(value);
    }

    async function copyContent(button) {
        const targetId = button.getAttribute("data-copy-target");
        const target = targetId ? document.getElementById(targetId) : null;
        if (!target) return;

        const text = target.innerText.trim();
        const original = button.innerHTML;
        const statusId = button.getAttribute("aria-describedby");
        const status = statusId ? document.getElementById(statusId) : null;
        const successMessage = button.getAttribute("data-copy-success");

        try {
            await copyTextToClipboard(text);
            button.innerHTML = "<i class=\"fa-solid fa-check\" aria-hidden=\"true\"></i> Kopiert";
            if (successMessage) button.classList.add("ui-btn-copy-success");
            if (status) {
                status.textContent = successMessage || "Der Text wurde kopiert oder zum manuellen Kopieren markiert.";
            }
        } catch (error) {
            console.error("Copy failed", error);
            if (status) status.textContent = "Kopieren war nicht möglich.";
        }

        window.setTimeout(() => {
            button.innerHTML = original;
            button.classList.remove("ui-btn-copy-success");
            if (status) status.textContent = "";
        }, 2200);
    }

    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-copy-target]');
        if (button) copyContent(button);
    });
})();
