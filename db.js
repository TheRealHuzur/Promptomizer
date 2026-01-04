// db.js - Verbindung zur Datenbank 🧠

// 1. Konfiguration (Hier deine Werte von Supabase einfügen!)
const SUPABASE_URL = https://nrrsroaubbpmjyexhuhi.supabase.co; // Deine "Project URL"
const SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ycnNyb2F1YmJwbWp5ZXhodWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MzU2ODcsImV4cCI6MjA4MzExMTY4N30.UcUIVDHiV6o5thTyeO8r5cylhPpNGl6Tpc3J0qsSxoM; // Dein langer "anon / public" Key

// 2. Client starten
// (Das "supabase"-Objekt kommt aus der Bibliothek, die wir im HTML geladen haben)
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 3. Test-Signal senden
console.log("Supabase Client wurde geladen! 🚀", supabase);
// Update Test