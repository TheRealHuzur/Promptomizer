// db.js - Verbindung zur Datenbank 🧠

// 1. Konfiguration
const SUPABASE_URL = 'https://nrrsroaubbpmjyexhuhi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ycnNyb2F1YmJwbWp5ZXhodWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MzU2ODcsImV4cCI6MjA4MzExMTY4N30.UcUIVDHiV6o5thTyeO8r5cylhPpNGl6Tpc3J0qsSxoM';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log("Supabase Client wurde geladen! 🚀", supabaseClient);

// ---------------------------------------------------------
// LOGIK: Speichern im Hintergrund
// ---------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    
    // Wir suchen jetzt gezielt den "Speichern"-Button aus dem Szenario-Modus
    // (Voraussetzung: Du hast ihm in der HTML die id="btn-save-scenario" gegeben!)
    const saveScenarioBtn = document.getElementById('btn-save-scenario');

    if (saveScenarioBtn) {
        // Wenn der Button geklickt wird, schicken wir die Daten zur Cloud
        saveScenarioBtn.addEventListener('click', speichereInSupabase);
        console.log("✅ Bereit zum Speichern in die Cloud (Szenario-Modus).");
    } else {
        console.warn("⚠️ Button 'btn-save-scenario' nicht gefunden. Hast du die ID in der HTML gesetzt?");
    }
});


// Funktion: Daten aus den Feldern lesen und senden
async function speichereInSupabase() {
    console.log("☁️ Sende Daten an Supabase...");

    // 1. Werte aus den Feldern holen
    const role = document.getElementById('input-role')?.value || '';
    const context = document.getElementById('input-context')?.value || '';
    const task = document.getElementById('input-task')?.value || '';
    const style = document.getElementById('input-style')?.value || '';
    const format = document.getElementById('input-format')?.value || '';

    // Abbruch, wenn alles leer ist
    if (!role && !context && !task) {
        console.log("Leere Eingabe - nichts gesendet.");
        return;
    }

    // 2. Text zusammenbauen
    let vollerText = "";
    if(role) vollerText += `**🎭 ROLLE**\n${role}\n\n`;
    if(context) vollerText += `**🌍 KONTEXT**\n${context}\n\n`;
    if(task) vollerText += `**🎯 AUFGABE**\n${task}\n\n`;
    if(style) vollerText += `**🎨 STIL UND TONALITÄT**\n${style}\n\n`;
    if(format) vollerText += `**🧪 VARIANTEN**\n${format}\n\n`;

    // 3. Abflug zur Datenbank
    const { error } = await supabaseClient
        .from('prompts')
        .insert({ text: vollerText.trim() });

    if (error) {
        console.error("❌ Fehler beim Cloud-Upload:", error);
    } else {
        console.log("✅ Erfolgreich in der Cloud gesichert!");
    }
}