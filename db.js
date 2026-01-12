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

// 4. Test-Funktion: Daten abrufen und ANZEIGEN
async function ladePrompts() {
    console.log("⏳ Versuche Daten zu laden...");
    
    // 1. Daten holen
    const { data, error } = await supabaseClient
        .from('prompts')
        .select('*');

    // 2. Fehler prüfen
    if (error) {
        console.error("❌ Fehler beim Laden:", error);
        return; // Abbruch
    }

    // 3. Das "Regal" im HTML finden
    const liste = document.getElementById('prompt-liste');
    
    // 4. Regal einmal leer machen (damit "Lade Daten..." verschwindet)
    liste.innerHTML = '';

    // 5. Für jeden Eintrag (item) einen Zettel schreiben und ins Regal hängen
    data.forEach(function(eintrag) {
        // Neues Listen-Element (<li>) erstellen
        const li = document.createElement('li');
        
        // Den Text aus der Datenbank hineinschreiben
        li.textContent = eintrag.text;
        
        // Ein bisschen hübsch machen (Tailwind Klassen)
        li.className = "bg-white p-3 rounded shadow border-l-4 border-blue-500";
        
        // Ins Regal hängen
        liste.appendChild(li);
    });
    
    console.log("✅ Daten erfolgreich auf der Seite angezeigt!");
}

// Funktion ausführen
ladePrompts();