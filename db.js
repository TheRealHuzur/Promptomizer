// db.js - Verbindung zur Datenbank 🧠

// 1. Konfiguration
const SUPABASE_URL = 'https://nrrsroaubbpmjyexhuhi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ycnNyb2F1YmJwbWp5ZXhodWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MzU2ODcsImV4cCI6MjA4MzExMTY4N30.UcUIVDHiV6o5thTyeO8r5cylhPpNGl6Tpc3J0qsSxoM';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log("Supabase Client wurde geladen! 🚀", supabaseClient);

// ---------------------------------------------------------
// LOGIK FÜR DEINE BESTEHENDE APP
// ---------------------------------------------------------

// Wir warten, bis die HTML-Seite komplett fertig ist
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Den existierenden "Erstellen"-Button finden
    const generateBtn = document.getElementById('btn-generate');

    if (generateBtn) {
        // Wir hängen uns an den Klick-Event dran
        generateBtn.addEventListener('click', speichereInSupabase);
        console.log("✅ Supabase hat sich mit dem Button verbunden.");
    }

    // 2. Bestehende Daten beim Start laden
    ladePrompts();
});


// Funktion: Daten aus DEINEN Feldern lesen und speichern
async function speichereInSupabase() {
    console.log("💾 Starte Speichervorgang...");

    // 1. Die Werte aus deinen Feldern holen
    const role = document.getElementById('input-role')?.value || '';
    const context = document.getElementById('input-context')?.value || '';
    const task = document.getElementById('input-task')?.value || '';
    const style = document.getElementById('input-style')?.value || '';
    const format = document.getElementById('input-format')?.value || '';

    // Wenn alles leer ist, brechen wir ab (nichts zu speichern)
    if (!role && !context && !task) return;

    // 2. Den Text so zusammenbauen, wie er auch in deine Zwischenablage kommt
    // (Damit es in der DB genauso hübsch aussieht)
    let vollerText = "";
    if(role) vollerText += `**🎭 ROLLE**\n${role}\n\n`;
    if(context) vollerText += `**🌍 KONTEXT**\n${context}\n\n`;
    if(task) vollerText += `**🎯 AUFGABE**\n${task}\n\n`;
    if(style) vollerText += `**🎨 STIL UND TONALITÄT**\n${style}\n\n`;
    if(format) vollerText += `**🧪 VARIANTEN**\n${format}\n\n`;

    // 3. An Supabase senden
    const { error } = await supabaseClient
        .from('prompts')
        .insert({ text: vollerText.trim() });

    if (error) {
        console.error("❌ Fehler beim Speichern in Cloud:", error);
    } else {
        console.log("✅ Erfolgreich in der Cloud gesichert!");
        // Liste sofort aktualisieren, damit du es siehst
        ladePrompts();
    }
}


// Funktion: Liste laden und in dein existierendes <ul> rendern
async function ladePrompts() {
    const listenElement = document.getElementById('prompt-liste');
    if (!listenElement) return; // Falls wir auf einer Seite ohne Liste sind

    // Daten holen (Neueste zuerst)
    const { data, error } = await supabaseClient
        .from('prompts')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Fehler beim Laden:", error);
        return;
    }

    // Liste leeren
    listenElement.innerHTML = '';

    // Einträge bauen
    data.forEach(eintrag => {
        const li = document.createElement('li');
        
        // Wir nutzen Tailwind-Klassen passend zu deinem Design (Slate/Navy)
        li.className = "bg-white dark:bg-navy-800 p-4 rounded-lg shadow border-l-4 border-petrol-600 dark:border-petrol-500 text-sm text-slate-700 dark:text-slate-300 mb-2";
        
        // Zeilenumbrüche für HTML lesbar machen
        li.innerHTML = eintrag.text.replace(/\n/g, '<br>');
        
        listenElement.appendChild(li);
    });
}