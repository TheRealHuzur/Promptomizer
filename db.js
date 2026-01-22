// db.js - Supabase Integration & Auth Logic 🧠

// 1. Konfiguration
const SUPABASE_URL = 'https://nrrsroaubbpmjyexhuhi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ycnNyb2F1YmJwbWp5ZXhodWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MzU2ODcsImV4cCI6MjA4MzExMTY4N30.UcUIVDHiV6o5thTyeO8r5cylhPpNGl6Tpc3J0qsSxoM';

// Initialisierung
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Globaler User State
window.currentUser = null;

console.log("🚀 Supabase Client V4 initialisiert");

// ---------------------------------------------------------
// AUTHENTIFIZIERUNG & LISTENER
// ---------------------------------------------------------

supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log("🔐 Auth Status:", event, session?.user?.email);
    window.currentUser = session?.user || null;
    
    // Custom Event feuern, damit index.html das UI updaten kann
    const authEvent = new CustomEvent('auth-state-changed', { detail: window.currentUser });
    window.dispatchEvent(authEvent);
});

// Google Login
async function loginWithGoogle() {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
    });
    if (error) throw error;
}

// Email Auth
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
// DATENBANK OPERATIONEN (Hybrid: Cloud + Session)
// ---------------------------------------------------------

window.db = {
    
    // --- PROMPTS (Historie) ---
    async savePrompt(entry) {
        if (window.currentUser) {
            // ☁️ CLOUD SAVE
            const { error } = await supabaseClient
                .from('prompt_history')
                .insert({
                    user_id: window.currentUser.id,
                    text: entry.text,
                    fields: entry.fields,
                    created_at: new Date().toISOString(),
                    favorite: false
                });
            if (error) console.error("Cloud Save Error:", error);
        } else {
            // 🍪 SESSION SAVE (Gast)
            let history = JSON.parse(sessionStorage.getItem('promptomizer_history') || '[]');
            // Lokale ID generieren falls nicht vorhanden
            if(!entry.id) entry.id = Date.now();
            history.unshift(entry);
            if (history.length > 50) history.pop();
            sessionStorage.setItem('promptomizer_history', JSON.stringify(history));
        }
    },

    async getHistory() {
        if (window.currentUser) {
            // ☁️ CLOUD FETCH
            const { data, error } = await supabaseClient
                .from('prompt_history')
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
            await supabaseClient.from('prompt_history').delete().eq('id', id);
        } else {
            let history = JSON.parse(sessionStorage.getItem('promptomizer_history') || '[]');
            history = history.filter(h => h.id != id); // Loose equality für Session IDs
            sessionStorage.setItem('promptomizer_history', JSON.stringify(history));
        }
    },

    async toggleFavorite(id, currentStatus) {
        if (window.currentUser) {
            await supabaseClient.from('prompt_history').update({ favorite: !currentStatus }).eq('id', id);
        } else {
            let history = JSON.parse(sessionStorage.getItem('promptomizer_history') || '[]');
            const idx = history.findIndex(h => h.id == id);
            if (idx > -1) {
                history[idx].favorite = !history[idx].favorite;
                sessionStorage.setItem('promptomizer_history', JSON.stringify(history));
            }
        }
    },

    // --- SNIPPETS (Bausteine) ---
    async saveSnippet(snippet) {
        if (!window.currentUser) return false;

        const { error } = await supabaseClient
            .from('snippets')
            .insert({
                user_id: window.currentUser.id,
                name: snippet.name,
                content: snippet.content,
                mode: snippet.mode,
                field_id: snippet.field_id,
                created_at: new Date().toISOString()
            });

        if (error) {
            console.error("Snippet Save Error:", error);
            return false;
        }
        return true;
    },

    async getSnippets(params) {
        if (!window.currentUser) return [];

        let query = supabaseClient
            .from('snippets')
            .select('*')
            .eq('user_id', window.currentUser.id);

        if (params.mode === 'structured') {
            query = query.in('mode', ['structured', 'both']).eq('field_id', params.fieldId);
        }
        if (params.mode === 'free') {
            query = query.in('mode', ['free', 'both']).or('field_id.is.null,field_id.eq.free');
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) {
            console.error("Snippets Fetch Error:", error);
            return [];
        }
        return data || [];
    },

    async updateSnippet(id, patch) {
        if (!window.currentUser) return false;
        const { error } = await supabaseClient
            .from('snippets')
            .update(patch)
            .eq('id', id)
            .eq('user_id', window.currentUser.id);
        if (error) {
            console.error("Snippet Update Error:", error);
            return false;
        }
        return true;
    },

    async deleteSnippet(id) {
        if (!window.currentUser) return false;
        const { error } = await supabaseClient
            .from('snippets')
            .delete()
            .eq('id', id)
            .eq('user_id', window.currentUser.id);
        if (error) {
            console.error("Snippet Delete Error:", error);
            return false;
        }
        return true;
    },

    // --- BIBLIOTHEK (Szenarien) ---
    async saveScenario(scenario) {
        if (!window.currentUser) return false; 

        const { error } = await supabaseClient
            .from('library') // Achte darauf, dass deine Tabelle in Supabase 'library' oder 'scenarios' heißt. Im V3 Code war es 'scenarios' oder 'library'. Ich nutze hier 'library' basierend auf deinem letzten Input.
            .insert({
                user_id: window.currentUser.id,
                name: scenario.name,
                fields: scenario.fields,
                category: scenario.category ?? null
            });
        
        if (error) {
            // Fallback falls Tabelle 'scenarios' heißt
            if(error.code === '42P01') { // Undefined table
                 const { error: err2 } = await supabaseClient.from('scenarios').insert({
                    user_id: window.currentUser.id,
                    name: scenario.name,
                    fields: scenario.fields,
                    category: scenario.category ?? null
                });
                if(err2) { console.error(err2); return false; }
                return true;
            }
            console.error("Library Save Error:", error);
            return false;
        }
        return true;
    },

    async getScenarios() {
        if (!window.currentUser) return [];

        // Versuch 'library', Fallback auf 'scenarios'
        let { data, error } = await supabaseClient
            .from('library')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
             const { data: data2, error: error2 } = await supabaseClient
            .from('scenarios')
            .select('*')
            .order('created_at', { ascending: false });
            if(error2) return [];
            return data2;
        }
        return data;
    },

    async getPromptCategories() {
        if (!window.currentUser) return [];
        const { data, error } = await supabaseClient
            .from('prompt_categories')
            .select('name')
            .eq('user_id', window.currentUser.id)
            .order('created_at', { ascending: true });
        if (error) {
            console.error("Prompt Categories Fetch Error:", error);
            return [];
        }
        return data || [];
    },

    async createPromptCategory(name) {
        if (!window.currentUser) return false;
        const { error } = await supabaseClient
            .from('prompt_categories')
            .insert({ user_id: window.currentUser.id, name });
        if (error) {
            console.error("Prompt Category Create Error:", error);
            return false;
        }
        return true;
    },

    async updateScenario(id, patch) {
        if (!window.currentUser) return false;
        const { error } = await supabaseClient
            .from('library')
            .update(patch)
            .eq('id', id)
            .eq('user_id', window.currentUser.id);
        if (error && error.code !== '42P01') {
            console.error("Scenario Update Error:", error);
            return false;
        }
        const { error: err2 } = await supabaseClient
            .from('scenarios')
            .update(patch)
            .eq('id', id)
            .eq('user_id', window.currentUser.id);
        if (err2 && err2.code !== '42P01') {
            console.error("Scenario Update Error (fallback):", err2);
            return false;
        }
        return true;
    },
    
    async deleteScenario(id) {
        try {
            if (!window.currentUser) return false;
            const uid = window.currentUser.id;

            await supabaseClient
                .from('library')
                .delete()
                .eq('id', id)
                .eq('user_id', uid);

            // Fallback Tabelle (falls vorhanden/benutzt)
            await supabaseClient
                .from('scenarios')
                .delete()
                .eq('id', id)
                .eq('user_id', uid);

            return true;
        } catch (e) {
            console.error('deleteScenario error', e);
            return false;
        }
    }
};
