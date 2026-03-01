// db.js - Supabase Integration & Auth Logic 🧠

// 1. Konfiguration
const SUPABASE_URL = 'https://nrrsroaubbpmjyexhuhi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ycnNyb2F1YmJwbWp5ZXhodWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MzU2ODcsImV4cCI6MjA4MzExMTY4N30.UcUIVDHiV6o5thTyeO8r5cylhPpNGl6Tpc3J0qsSxoM';

// Initialisierung
let supabaseClient;
let authSubscription = null;

// Globaler User State
window.currentUser = null;

function getRememberPref() {
    return localStorage.getItem('promptomizer_remember') !== 'false';
}

function initSupabaseClient() {
    const remember = getRememberPref();
    const storage = remember ? window.localStorage : window.sessionStorage;

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            storage,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });

    if (authSubscription && authSubscription.unsubscribe) authSubscription.unsubscribe();

    const { data } = supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log("ðŸ” Auth Status:", event, session?.user?.email);

        if (event === 'PASSWORD_RECOVERY') {
            const recoveryEvent = new CustomEvent('auth-password-recovery');
            window.dispatchEvent(recoveryEvent);
        }

        window.currentUser = session?.user || null;
        const authEvent = new CustomEvent('auth-state-changed', { detail: window.currentUser });
        window.dispatchEvent(authEvent);
    });

    authSubscription = data?.subscription || null;
}

window.setRememberPref = (remember) => {
    localStorage.setItem('promptomizer_remember', remember ? 'true' : 'false');
    initSupabaseClient();
};

initSupabaseClient();

console.log("🚀 Supabase Client V4 initialisiert");

// ---------------------------------------------------------
// AUTHENTIFIZIERUNG & LISTENER
// ---------------------------------------------------------

// Google Login
async function loginWithGoogle() {
    try {
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin }
        });
        if (error) throw error;
    } catch (err) {
        console.error('Google Login Fehler:', err);
    }
}

async function registerUser(email, password, metadata = {}) {
    // metadata z.B. { agb_accepted_at: "...", agb_version: "..." }
    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
            data: metadata
        }
    });
    return { data, error };
}

async function requestPasswordReset(email) {
    const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
    });
    return { data, error };
}

async function updateUserPassword(newPassword) {
    const { data, error } = await supabaseClient.auth.updateUser({ password: newPassword });
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
    // --- PROFILES ---
    async getProfile() {
        if (!window.currentUser) return null;
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', window.currentUser.id)
            .single();
        if (error) {
            console.error("Profile Fetch Error:", error);
            return null;
        }
        return data;
    },

    async updateProfile(patch) {
        if (!window.currentUser) return false;
        const { error } = await supabaseClient
            .from('profiles')
            .update(patch)
            .eq('id', window.currentUser.id);
        if (error) {
            console.error("Profile Update Error:", error);
            return false;
        }
        return true;
    },

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
            if (!entry.id) entry.id = Date.now();
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
            .from('library')
            .insert({
                user_id: window.currentUser.id,
                name: scenario.name,
                fields: scenario.fields,
                category: scenario.category ?? null
            });

        if (error) {
            console.error("Library Save Error:", error);
            return false;
        }
        return true;
    },

    async getScenarios() {
        if (!window.currentUser) return [];
        const uid = window.currentUser.id;

        const { data, error } = await supabaseClient
            .from('library')
            .select('*')
            .eq('user_id', uid)
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Library Fetch Error:", error);
            return [];
        }
        return data;
    },

    async getPromptCategories() {
        if (!window.currentUser) return [];
        const { data, error } = await supabaseClient
            .from('prompt_categories')
            .select('id, name, created_at')
            .eq('user_id', window.currentUser.id)
            .order('name', { ascending: true });
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

    async renamePromptCategory(categoryId, oldName, newName) {
        if (!window.currentUser) return false;
        const uid = window.currentUser.id;

        const { data, error } = await supabaseClient
            .from('prompt_categories')
            .update({ name: newName })
            .eq('id', categoryId)
            .eq('user_id', uid)
            .select('id');

        if (error) {
            console.error('Prompt Category Rename Error:', error);
            return false;
        }

        if (!data || data.length === 0) {
            console.error('Prompt Category Rename: 0 rows updated', { categoryId, uid, oldName, newName });
            return false;
        }

        const { data: rows, error: err2 } = await supabaseClient
            .from('library')
            .update({ category: newName })
            .eq('user_id', uid)
            .eq('category', oldName)
            .select('id');

        if (err2) {
            console.error('Prompt Category Rename Library Error:', err2);
            return false;
        }

        if (!rows || rows.length === 0) {
            console.error('Prompt Category Rename: 0 prompts updated', { categoryId, uid, oldName, newName });
        }

        return true;
    },

    async deletePromptCategory(categoryId, categoryName) {
        if (!window.currentUser) return false;
        const uid = window.currentUser.id;

        const { data, error } = await supabaseClient
            .from('prompt_categories')
            .delete()
            .eq('id', categoryId)
            .eq('user_id', uid)
            .select('id');

        if (error) {
            console.error('Prompt Category Delete Error:', error);
            return false;
        }

        if (!data || data.length === 0) {
            console.error('Prompt Category Delete: 0 rows deleted', { categoryId, uid, categoryName });
            return false;
        }

        const { data: rows, error: err2 } = await supabaseClient
            .from('library')
            .update({ category: null })
            .eq('user_id', uid)
            .eq('category', categoryName)
            .select('id');

        if (err2) {
            console.error('Prompt Category Delete Library Error:', err2);
            return false;
        }

        if (!rows || rows.length === 0) {
            console.error('Prompt Category Delete: 0 prompts updated', { categoryId, uid, categoryName });
        }

        return true;
    },

    async updateScenario(id, patch) {
        if (!window.currentUser) return false;
        const uid = window.currentUser.id;

        const { data, error } = await supabaseClient
            .from('library')
            .update(patch)
            .eq('id', id)
            .eq('user_id', uid)
            .select('id');

        if (error) {
            console.error("Scenario Update Error:", error);
            return false;
        }

        if (!data || data.length === 0) {
            console.error("Scenario Update: 0 rows updated", { id, uid, patch });
            return false;
        }

        return true;
    },

    async deleteScenario(id) {
        try {
            if (!window.currentUser) return false;
            const uid = window.currentUser.id;

            const { error } = await supabaseClient
                .from('library')
                .delete()
                .eq('id', id)
                .eq('user_id', uid);

            if (error) {
                console.error('deleteScenario error', error);
                return false;
            }

            return true;
        } catch (e) {
            console.error('deleteScenario error', e);
            return false;
        }
    }
};


