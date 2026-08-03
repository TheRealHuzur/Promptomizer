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
            options: { redirectTo: window.location.origin + '/app' }
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
            data: metadata,
            emailRedirectTo: window.location.origin + '/app'
        }
    });
    return { data, error };
}

async function resendSignupConfirmation(email) {
    const { data, error } = await supabaseClient.auth.resend({
        type: 'signup',
        email,
        options: {
            emailRedirectTo: window.location.origin + '/app'
        }
    });
    return { data, error };
}

async function requestPasswordReset(email) {
    const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/app'
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
    async getSession() {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) {
            console.error('Session Error:', error);
            throw error;
        }
        return data.session;
    },

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


    async getAccountSettings() {
        if (!window.currentUser) return null;
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('display_name, default_editor_mode, active_badge_code, billing_interval, created_at')
            .eq('id', window.currentUser.id)
            .single();

        if (error) {
            console.error('Account Settings Fetch Error:', error);
            return null;
        }

        return {
            display_name: typeof data.display_name === 'string' ? data.display_name : '',
            default_editor_mode: data.default_editor_mode === 'free' ? 'free' : 'structured',
            active_badge_code: typeof data.active_badge_code === 'string' ? data.active_badge_code : null,
            billing_interval: data.billing_interval || null,
            created_at: data.created_at || null
        };
    },

    async saveAccountSettings(settings) {
        if (!window.currentUser) return { success: false, reason: 'NOT_LOGGED_IN' };

        const rawName = typeof settings?.display_name === 'string' ? settings.display_name.trim() : '';
        if (rawName.length > 40) return { success: false, reason: 'DISPLAY_NAME_TOO_LONG' };

        const defaultEditorMode = settings?.default_editor_mode === 'free' ? 'free' : 'structured';
        const activeBadgeCode = typeof settings?.active_badge_code === 'string' && settings.active_badge_code.trim()
            ? settings.active_badge_code.trim()
            : null;
        const patch = {
            display_name: rawName || null,
            default_editor_mode: defaultEditorMode,
            active_badge_code: activeBadgeCode
        };

        const { data, error } = await supabaseClient
            .from('profiles')
            .update(patch)
            .eq('id', window.currentUser.id)
            .select('display_name, default_editor_mode, active_badge_code')
            .single();

        if (error) {
            console.error('Account Settings Update Error:', error);
            return {
                success: false,
                reason: error.code === '23503' ? 'BADGE_NOT_EARNED' : 'ERROR'
            };
        }

        return {
            success: true,
            settings: {
                display_name: typeof data.display_name === 'string' ? data.display_name : '',
                default_editor_mode: data.default_editor_mode === 'free' ? 'free' : 'structured',
                active_badge_code: typeof data.active_badge_code === 'string' ? data.active_badge_code : null
            }
        };
    },

    async getUserBadges() {
        if (!window.currentUser) return [];
        const uid = window.currentUser.id;
        const [catalogResult, awardsResult] = await Promise.all([
            supabaseClient
                .from('badges')
                .select('code, name, description, icon_path, unlock_hint, is_secret, sort_order')
                .eq('is_enabled', true)
                .order('sort_order', { ascending: true }),
            supabaseClient
                .from('user_badges')
                .select('badge_code, awarded_at, award_reason')
                .eq('user_id', uid)
        ]);

        if (catalogResult.error || awardsResult.error) {
            console.error('Badge Fetch Error:', catalogResult.error || awardsResult.error);
            return [];
        }

        const awards = new Map((awardsResult.data || []).map(award => [award.badge_code, award]));
        return (catalogResult.data || []).map(badge => {
            const award = awards.get(badge.code);
            return {
                ...badge,
                earned: Boolean(award),
                awarded_at: award?.awarded_at || null,
                award_reason: award?.award_reason || null
            };
        });
    },
    async updateProfile(patch) {
        if (!window.currentUser) return false;
        console.log("Versuche Profil zu updaten für ID:", window.currentUser.id, patch);
        const { data, error } = await supabaseClient
            .from('profiles')
            .update(patch)
            .eq('id', window.currentUser.id)
            .select(); // Select added to return the updated row

        if (error) {
            // Technische Details (z.B. fehlende RLS-Policy) nur in die Konsole, nicht zum Nutzer
            console.error("Profile Update Error (Möglicherweise RLS Policy fehlend):", error);
            if (typeof window.showToast === 'function') {
                window.showToast("Profil konnte nicht gespeichert werden. Bitte erneut versuchen.", "error");
            }
            return false;
        }

        if (!data || data.length === 0) {
            console.warn("Profile Update Warnung: Keine Zeile wurde aktualisiert. RLS blockiert möglicherweise das Update.");
        } else {
            console.log("Profil erfolgreich aktualisiert:", data);
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
            // ☁️ CLOUD FETCH — Free-User sehen max. 10 Einträge
            const tier = await this.getUserTier();
            const historyLimit = tier === 'pro' ? 50 : 10;
            const { data, error } = await supabaseClient
                .from('prompt_history')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(historyLimit);

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
        if (!window.currentUser) return { success: false, reason: 'NOT_LOGGED_IN' };

        const { error } = await supabaseClient
            .from('library')
            .insert({
                user_id: window.currentUser.id,
                name: scenario.name,
                fields: scenario.fields,
                category: scenario.category ?? null
            });

        if (error) {
            console.error('Library Save Error:', error);
            // Supabase transportiert RAISE EXCEPTION als error.message
            if (error.message?.includes('FREE_LIMIT_REACHED')) {
                return { success: false, reason: 'FREE_LIMIT_REACHED' };
            }
            return { success: false, reason: 'ERROR' };
        }
        return { success: true };
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

    async saveScenarioVersion(id, payload) {
        if (!window.currentUser) {
            return { success: false, reason: 'NOT_LOGGED_IN' };
        }

        const uid = window.currentUser.id;
        const { data, error } = await supabaseClient
            .from('library')
            .update({
                name: payload.name,
                fields: payload.fields
            })
            .eq('id', id)
            .eq('user_id', uid)
            .select('*');

        if (error) {
            console.error('Prompt Version Save Error:', error);
            return { success: false, reason: 'ERROR' };
        }

        if (!data || data.length !== 1) {
            console.error('Prompt Version Save: keine eindeutige Zeile aktualisiert', { id, uid });
            return { success: false, reason: 'NOT_FOUND' };
        }

        return { success: true, scenario: data[0] };
    },

    async getPromptVersions(promptId, offset = 0, limit = 20) {
        if (!window.currentUser) {
            return { success: false, reason: 'NOT_LOGGED_IN', versions: [], hasMore: false };
        }

        const tier = await this.getUserTier();
        if (tier !== 'pro') {
            return { success: false, reason: 'PRO_REQUIRED', versions: [], hasMore: false };
        }

        const safeOffset = Math.max(0, Number(offset) || 0);
        const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
        const { data, error, count } = await supabaseClient
            .from('prompt_versions')
            .select('id, prompt_id, version_number, name, fields, created_at, restored_from_version', { count: 'exact' })
            .eq('prompt_id', promptId)
            .eq('user_id', window.currentUser.id)
            .order('version_number', { ascending: false })
            .range(safeOffset, safeOffset + safeLimit - 1);

        if (error) {
            console.error('Prompt Versions Fetch Error:', error);
            return { success: false, reason: 'ERROR', versions: [], hasMore: false };
        }

        const versions = data || [];
        return {
            success: true,
            versions,
            hasMore: safeOffset + versions.length < (count || 0),
            total: count || 0
        };
    },

    async restoreScenarioVersion(promptId, versionNumber) {
        if (!window.currentUser) {
            return { success: false, reason: 'NOT_LOGGED_IN' };
        }

        const tier = await this.getUserTier();
        if (tier !== 'pro') {
            return { success: false, reason: 'PRO_REQUIRED' };
        }

        const { data, error } = await supabaseClient.rpc('restore_library_prompt_version', {
            p_prompt_id: promptId,
            p_version_number: versionNumber
        });

        if (error) {
            console.error('Prompt Version Restore Error:', error);
            return {
                success: false,
                reason: error.message?.includes('PROMPT_VERSION_NOT_FOUND') ? 'NOT_FOUND' : 'ERROR'
            };
        }

        if (!data || data.length !== 1) {
            console.error('Prompt Version Restore: keine eindeutige Zeile aktualisiert', { promptId, versionNumber });
            return { success: false, reason: 'NOT_FOUND' };
        }

        return { success: true, scenario: data[0] };
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
        if (!window.currentUser) return { success: false, reason: 'NOT_LOGGED_IN' };
        const { error } = await supabaseClient
            .from('prompt_categories')
            .insert({ user_id: window.currentUser.id, name });
        if (error) {
            console.error("Prompt Category Create Error:", error);
            if (error.message?.includes('CATEGORY_LIMIT_REACHED')) {
                return { success: false, reason: 'CATEGORY_LIMIT_REACHED' };
            }
            return { success: false, reason: 'ERROR' };
        }
        return { success: true };
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
    },

    async getPromptCount() {
        if (!window.currentUser) return 0;
        const { count, error } = await supabaseClient
            .from('library')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', window.currentUser.id);
        if (error) {
            console.error('Prompt Count Error:', error);
            return 0;
        }
        return count ?? 0;
    },

    async getCategoryCount() {
        if (!window.currentUser) return 0;
        const { count, error } = await supabaseClient
            .from('prompt_categories')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', window.currentUser.id);
        if (error) {
            console.error('Category Count Error:', error);
            return 0;
        }
        return count ?? 0;
    },

    async getUserTier() {
        const profile = await this.getProfile();
        return profile?.tier ?? 'free';
    },

    async createProCheckoutSession(interval = 'month') {
        const body = { interval: interval === 'year' ? 'year' : 'month' };
        const { data, error } = await supabaseClient.functions.invoke('create-stripe-checkout-session', { body });
        if (error) {
            console.error('Checkout Session Error:', error);
            throw error;
        }
        return data;
    },

    async createCustomerPortalSession() {
        const { data, error } = await supabaseClient.functions.invoke('create-stripe-portal-session');
        if (error) {
            console.error('Customer Portal Error:', error);
            throw error;
        }
        return data;
    },

    async syncStripeSubscription() {
        const { data, error } = await supabaseClient.functions.invoke('sync-stripe-subscription');
        if (error) {
            console.error('Stripe Sync Error:', error);
            throw error;
        }
        return data;
    }
};


