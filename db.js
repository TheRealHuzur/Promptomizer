// db.js - Supabase Integration & Auth Logic

// 1. Konfiguration (Deine Credentials)
const SUPABASE_URL = 'https://nrrsroaubbpmjyexhuhi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ycnNyb2F1YmJwbWp5ZXhodWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MzU2ODcsImV4cCI6MjA4MzExMTY4N30.UcUIVDHiV6o5thTyeO8r5cylhPpNGl6Tpc3J0qsSxoM';

// Initialisierung
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;

// ---------------------------------------------------------
// AUTHENTIFIZIERUNG
// ---------------------------------------------------------

// Listener für Status-Änderungen (Login/Logout)
supabase.auth.onAuthStateChange((event, session) => {
    console.log("Auth Event:", event);
    currentUser = session?.user || null;
    updateAuthUI();
    
    // Wenn Login erfolgreich, lade Daten neu
    if (event === 'SIGNED_IN') {
        if (typeof loadHistory === 'function') loadHistory();
        // Optional: Scenarios neu laden
    }
    // Wenn Logout, leere View oder lade SessionStorage
    if (event === 'SIGNED_OUT') {
        if (typeof loadHistory === 'function') loadHistory();
    }
});

async function registerUser(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { data, error };
}

async function loginUser(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
}

async function logoutUser() {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Logout Error:', error);
}

// UI Update Funktion
function updateAuthUI() {
    const btnAuth = document.getElementById('btn-auth');
    const userMenu = document.getElementById('user-menu');
    const userEmail = document.getElementById('user-email');

    if (currentUser) {
        // User ist eingeloggt
        btnAuth.classList.add('hidden');
        userMenu.classList.remove('hidden');
        userEmail.innerText = currentUser.email;
    } else {
        // Gast
        btnAuth.classList.remove('hidden');
        userMenu.classList.add('hidden');
    }
}

// ---------------------------------------------------------
// DATENBANK OPERATIONEN (Hybrid)
// ---------------------------------------------------------

const db = {
    // --- PROMPTS (Historie) ---
    async savePrompt(entry) {
        if (currentUser) {
            // Cloud Save
            const { error } = await supabase
                .from('prompts')
                .insert({
                    user_id: currentUser.id,
                    text: entry.text,
                    fields: entry.fields, // JSONB column assumed
                    created_at: new Date().toISOString(),
                    favorite: false
                });
            if (error) console.error("DB Save Error:", error);
        } else {
            // Session Save (Gast)
            let history = JSON.parse(sessionStorage.getItem('promptomizer_history') || '[]');
            history.unshift(entry);
            if (history.length > 50) history.pop();
            sessionStorage.setItem('promptomizer_history', JSON.stringify(history));
        }
    },

    async getHistory() {
        if (currentUser) {
            // Cloud Fetch
            const { data, error } = await supabase
                .from('prompts')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);
            
            if (error) {
                console.error("DB Fetch Error:", error);
                return [];
            }
            // Mapping für Kompatibilität mit UI
            return data.map(item => ({
                id: item.id,
                timestamp: item.created_at,
                text: item.text,
                fields: item.fields,
                favorite: item.favorite
            }));
        } else {
            // Session Fetch (Gast)
            return JSON.parse(sessionStorage.getItem('promptomizer_history') || '[]');
        }
    },

    async deletePrompt(id) {
        if (currentUser) {
            await supabase.from('prompts').delete().eq('id', id);
        } else {
            let history = JSON.parse(sessionStorage.getItem('promptomizer_history') || '[]');
            history = history.filter(h => h.id !== id);
            sessionStorage.setItem('promptomizer_history', JSON.stringify(history));
        }
    },

    async toggleFavorite(id, currentStatus) {
        if (currentUser) {
            await supabase.from('prompts').update({ favorite: !currentStatus }).eq('id', id);
        } else {
            let history = JSON.parse(sessionStorage.getItem('promptomizer_history') || '[]');
            const idx = history.findIndex(h => h.id === id);
            if (idx > -1) {
                history[idx].favorite = !history[idx].favorite;
                sessionStorage.setItem('promptomizer_history', JSON.stringify(history));
            }
        }
    },

    // --- SZENARIEN ---
    async saveScenario(scenario) {
        if (!currentUser) return false; // Should be blocked by UI, but safety check

        const { error } = await supabase
            .from('scenarios')
            .insert({
                user_id: currentUser.id,
                name: scenario.name,
                fields: scenario.fields
            });
        
        if (error) {
            console.error("Scenario Save Error:", error);
            return false;
        }
        return true;
    },

    async getScenarios() {
        if (!currentUser) return []; // Gäste haben keine Szenarien (laut Anforderung)

        const { data, error } = await supabase
            .from('scenarios')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) return [];
        return data;
    },
    
    async deleteScenario(id) {
        if(currentUser) {
            await supabase.from('scenarios').delete().eq('id', id);
        }
    }
};