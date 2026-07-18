// Zentrale, leicht änderbare Stelle für das Enddatum des Pro-Einführungspreises.
// Muss mit der AGB (Abschnitt "Einführungspreis und Preisgarantie für frühe Nutzer") übereinstimmen.
const INTRO_PRICE_END_DATE = '2026-11-01';

const INTRO_PRICE_END_DATE_DISPLAY = (() => {
    const d = new Date(`${INTRO_PRICE_END_DATE}T00:00:00`);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}.${month}.${d.getFullYear()}`;
})();
