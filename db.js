// db.js - Supabase Integration & Auth Logic 🧠

// 1. Konfiguration
const SUPABASE_URL = 'https://nrrsroaubbpmjyexhuhi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ycnNyb2F1YmJwbWp5ZXhodWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MzU2ODcsImV4cCI6MjA4MzExMTY4N30.UcUIVDHiV6o5thTyeO8r5cylhPpNGl6Tpc3J0qsSxoM';

// Initialisierung (Globale Variable für Zugriff)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;

console.log("🚀 Supabase Client initialisiert");

// ---------------------------------------------------------
// AUTHENTIFIZIERUNG & LISTENER
// ---------------------------------------------------------

// Dieser Listener feuert IMMER, wenn die Seite lädt oder jemand Login/Logout klickt
supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log("🔐 Auth Status:", event, session?.user?.email);
    
    // 1. WICHTIG: Die globale Variable aktualisieren!
    currentUser = session?.user || null;
    
    // 2. Die UI Buttons anpassen
    updateHeaderUI(currentUser);
});

// UI Update Funktion
function updateHeaderUI(user) {
    const btnAuth = document.getElementById('btn-auth'); // Login Button
    const userMenu = document.getElementById('user-menu'); // User Bereich
    const userEmailSpan = document.getElementById('user-email'); // E-Mail Anzeige

    if (user) {
        // --- EINGELOGGT ---
        if(btnAuth) btnAuth.classList.add('hidden');
        if(userMenu) userMenu.classList.remove('hidden');
        if(userEmailSpan) userEmailSpan.innerText = user.email;
    } else {
        // --- GAST ---
        if(btnAuth) btnAuth.classList.remove('hidden');
        if(userMenu) userMenu.classList.add('hidden');
        if(userEmailSpan) userEmailSpan.innerText = "";
    }
}
// Google Login Funktion (Korrigiert)
async function loginWithGoogle() {
    // FEHLER BEHOBEN: Hier stand vorher 'supabase', muss aber 'supabaseClient' heißen!
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            // Leitet den User nach dem Login zurück zur aktuellen URL
            redirectTo: window.location.origin 
        }
    });

    if (error) {
        console.error("Google Login Error:", error);
        const errorBox = document.getElementById('auth-error');
        if(errorBox) {
            errorBox.innerText = "Fehler beim Google Login: " + error.message;
            errorBox.classList.remove('hidden');
        }
    }
}

    if (error) {
        console.error("Google Login Error:", error);
        // Optional: Fehler im UI anzeigen, falls der Redirect nicht sofort greift
        const errorBox = document.getElementById('auth-error');
        if(errorBox) {
            errorBox.innerText = "Fehler beim Google Login: " + error.message;
            errorBox.classList.remove('hidden');
        }
    }
    // Bei Erfolg leitet Supabase automatisch weiter, kein weiterer Code nötig.
}

// ---------------------------------------------------------
// AUTH FUNKTIONEN (Werden vom Modal aufgerufen)
// ---------------------------------------------------------

async function registerUser(email, password) {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    return { data, error };
}

async function loginUser(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    return { data, error };
}

async function handleLogout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) console.error('Logout Fehler:', error);
    // UI Update passiert automatisch durch onAuthStateChange
}

// ---------------------------------------------------------
// DATENBANK OPERATIONEN (Hybrid: Cloud vs. Session)
// ---------------------------------------------------------

// Wir machen das globale 'db' Objekt verfügbar für script.js
window.db = {
    
    // --- PROMPTS (Historie) ---
    async savePrompt(entry) {
        if (currentUser) {
            // ☁️ CLOUD SAVE (User)
            console.log("Speichere Prompt in Cloud...");
            const { error } = await supabaseClient
                .from('prompts')
                .insert({
                    user_id: currentUser.id,
                    text: entry.text,
                    // Achtung: 'fields' Spalte muss in Supabase existieren!
                    // Falls nicht, speichern wir es aktuell nicht mit, um Fehler zu vermeiden.
                    created_at: new Date().toISOString(),
                    favorite: false
                });
            if (error) console.error("Cloud Save Error:", error);
        } else {
            // 🍪 SESSION SAVE (Gast)
            console.log("Speichere Prompt lokal (Session)...");
            let history = JSON.parse(sessionStorage.getItem('promptomizer_history') || '[]');
            history.unshift(entry);
            if (history.length > 50) history.pop();
            sessionStorage.setItem('promptomizer_history', JSON.stringify(history));
        }
    },

    async getHistory() {
        if (currentUser) {
            // ☁️ CLOUD FETCH
            const { data, error } = await supabaseClient
                .from('prompts')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);
            
            if (error) {
                console.error("Cloud Fetch Error:", error);
                return [];
            }
            // Mapping: Supabase Daten -> App Format
            return data.map(item => ({
                id: item.id,
                timestamp: item.created_at,
                text: item.text,
                fields: item.fields || [], // Fallback
                favorite: item.favorite
            }));
        } else {
            // 🍪 SESSION FETCH
            return JSON.parse(sessionStorage.getItem('promptomizer_history') || '[]');
        }
    },

    async deletePrompt(id) {
        if (currentUser) {
            await supabaseClient.from('prompts').delete().eq('id', id);
        } else {
            let history = JSON.parse(sessionStorage.getItem('promptomizer_history') || '[]');
            history = history.filter(h => h.id !== id);
            sessionStorage.setItem('promptomizer_history', JSON.stringify(history));
        }
    },

    async toggleFavorite(id, currentStatus) {
        if (currentUser) {
            await supabaseClient.from('prompts').update({ favorite: !currentStatus }).eq('id', id);
        } else {
            let history = JSON.parse(sessionStorage.getItem('promptomizer_history') || '[]');
            const idx = history.findIndex(h => h.id === id);
            if (idx > -1) {
                history[idx].favorite = !history[idx].favorite;
                sessionStorage.setItem('promptomizer_history', JSON.stringify(history));
            }
        }
    },

    // --- BIBLIOTHEK (Ehemals Szenarien) ---
    // Speichert Vorlagen in der Cloud-Tabelle 'library'
    async saveScenario(scenario) {
        if (!currentUser) return false; 

        console.log("Speichere in Bibliothek:", scenario.name);

        // WICHTIG: Hier stand vorher 'scenarios', jetzt 'library'
        const { error } = await supabaseClient
            .from('library') 
            .insert({
                user_id: currentUser.id,
                name: scenario.name,
                fields: scenario.fields
            });
        
        if (error) {
            console.error("Library Save Error:", error);
            alert("Fehler beim Speichern: " + error.message); // Zeigt dir den Fehler direkt an
            return false;
        }
        return true;
    },

    async getScenarios() {
        if (!currentUser) return [];

        // Auch hier: Laden aus 'library'
        const { data, error } = await supabaseClient
            .from('library')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error("Library Load Error:", error);
            return [];
        }
        return data;
    },
    
    async deleteScenario(id) {
        if(currentUser) {
            // Auch hier: Löschen aus 'library'
            await supabaseClient.from('library').delete().eq('id', id);
        }
    }
};
