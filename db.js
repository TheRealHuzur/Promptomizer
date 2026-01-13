// db.js - Supabase Integration & Auth Logic 🧠

// 1. Konfiguration
const SUPABASE_URL = 'https://nrrsroaubbpmjyexhuhi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ycnNyb2F1YmJwbWp5ZXhodWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MzU2ODcsImV4cCI6MjA4MzExMTY4N30.UcUIVDHiV6o5thTyeO8r5cylhPpNGl6Tpc3J0qsSxoM';

// Initialisierung
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// WICHTIG: Wir hängen den User direkt an das window-Objekt, 
// damit index.html und db.js beide darauf zugreifen können.
window.currentUser = null;

console.log("🚀 Supabase Client initialisiert");

// ---------------------------------------------------------
// AUTHENTIFIZIERUNG & LISTENER
// ---------------------------------------------------------

supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log("🔐 Auth Status:", event, session?.user?.email);
    
    // Status global aktualisieren
    window.currentUser = session?.user || null;
    
    // UI Update aufrufen
    updateHeaderUI(window.currentUser);
});

// UI Update Funktion
function updateHeaderUI(user) {
    const btnAuth = document.getElementById('btn-auth');
    const userMenu = document.getElementById('user-menu');
    const userEmailSpan = document.getElementById('user-email');

    if (user) {
        if(btnAuth) btnAuth.classList.add('hidden');
        if(userMenu) userMenu.classList.remove('hidden');
        if(userEmailSpan) userEmailSpan.innerText = user.email;
    } else {
        if(btnAuth) btnAuth.classList.remove('hidden');
        if(userMenu) userMenu.classList.add('hidden');
        if(userEmailSpan) userEmailSpan.innerText = "";
    }
}

// Google Login Funktion
async function loginWithGoogle() {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin 
        }
    });

    if (error) {
        console.error("Google Login Error:", error);
        const errorBox = document.getElementById('auth-error');
        if(errorBox) {
            errorBox.innerText = "Fehler: " + error.message;
            errorBox.classList.remove('hidden');
        }
    }
}

// ---------------------------------------------------------
// AUTH FUNKTIONEN
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
}

// ---------------------------------------------------------
// DATENBANK OPERATIONEN (Hybrid)
// ---------------------------------------------------------

window.db = {
    
    // --- PROMPTS (Historie) ---
    async savePrompt(entry) {
        // HIER WAR DER FEHLER: Wir nutzen jetzt window.currentUser
        if (window.currentUser) {
            // ☁️ CLOUD SAVE
            const { error } = await supabaseClient
                .from('prompts')
                .insert({
                    user_id: window.currentUser.id,
                    text: entry.text,
                    created_at: new Date().toISOString(),
                    favorite: false
                });
            if (error) console.error("Cloud Save Error:", error);
        } else {
            // 🍪 SESSION SAVE
            let history = JSON.parse(sessionStorage.getItem('promptomizer_history') || '[]');
            history.unshift(entry);
            if (history.length > 50) history.pop();
            sessionStorage.setItem('promptomizer_history', JSON.stringify(history));
        }
    },

    async getHistory() {
        if (window.currentUser) {
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
            return data.map(item => ({
                id: item.id,
                timestamp: item.created_at,
                text: item.text,
                fields: item.fields || [],
                favorite: item.favorite
            }));
        } else {
            // 🍪 SESSION FETCH
            return JSON.parse(sessionStorage.getItem('promptomizer_history') || '[]');
        }
    },

    async deletePrompt(id) {
        if (window.currentUser) {
            await supabaseClient.from('prompts').delete().eq('id', id);
        } else {
            let history = JSON.parse(sessionStorage.getItem('promptomizer_history') || '[]');
            history = history.filter(h => h.id !== id);
            sessionStorage.setItem('promptomizer_history', JSON.stringify(history));
        }
    },

    async toggleFavorite(id, currentStatus) {
        if (window.currentUser) {
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

    // --- BIBLIOTHEK ---
    async saveScenario(scenario) {
        if (!window.currentUser) return false; 

        console.log("Speichere in Bibliothek:", scenario.name);

        const { error } = await supabaseClient
            .from('library') 
            .insert({
                user_id: window.currentUser.id,
                name: scenario.name,
                fields: scenario.fields
            });
        
        if (error) {
            console.error("Library Save Error:", error);
            alert("Fehler: " + error.message);
            return false;
        }
        return true;
    },

    async getScenarios() {
        if (!window.currentUser) return [];

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
        if(window.currentUser) {
            await supabaseClient.from('library').delete().eq('id', id);
        }
    }
};