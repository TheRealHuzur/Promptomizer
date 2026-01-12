// db.js - Verbindung zur Datenbank 🧠

// 1. Konfiguration
const SUPABASE_URL = 'https://nrrsroaubbpmjyexhuhi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ycnNyb2F1YmJwbWp5ZXhodWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MzU2ODcsImV4cCI6MjA4MzExMTY4N30.UcUIVDHiV6o5thTyeO8r5cylhPpNGl6Tpc3J0qsSxoM';

// 2. Client starten
// ACHTUNG: Wir nennen es jetzt "supabaseClient", damit es keinen Namensstreit gibt!
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 3. Test-Signal senden
console.log("Supabase Client wurde geladen! 🚀", supabaseClient);
// ... dein bestehender Code steht hier drüber ...

// 4. Test-Funktion: Daten abrufen

async function ladePrompts() {
    console.log("⏳ Versuche Daten zu laden...");
    
    // Wir fragen die Tabelle 'prompts' ab und wollen alle Spalten (*)
    const { data, error } = await supabaseClient
        .from('prompts')
        .select('*');

    if (error) {
        console.error("❌ Fehler beim Laden:", error);
    } else {
        console.log("✅ Daten aus Supabase empfangen:", data);
    }
}

// 5. Die Funktion direkt beim Start einmal ausführen
ladePrompts();