/* NextGen Supabase browser configuration.
 * Production project. Publishable key is safe for browser use with RLS enabled.
 * Never put a service_role or secret key in this file.
 */
window.NEXTGEN_SUPABASE_CONFIG = {
  url: "https://vexntvbufnawtxszslsz.supabase.co",
  anonKey: "sb_publishable_nQiYBS_fiNQ6XeOFHnYbHg_xi9AlznW"
};

// One shared Supabase client per browser tab/app runtime.
// All NextGen pages and modules must use this factory; never create ad-hoc clients.
(function(){
  if (typeof window === 'undefined') return;
  window.getNextGenSupabaseClient = function(){
    const config = window.NEXTGEN_SUPABASE_CONFIG || {};
    if (!window.supabase || !config.url || !config.anonKey) {
      throw new Error('NextGen authentication configuration is unavailable.');
    }
    if (!window.NGAuthClient) {
      window.NGAuthClient = window.supabase.createClient(config.url, config.anonKey, {
        auth: {
          storageKey: 'nextgen-auth-v2',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce'
        }
      });
    }
    return window.NGAuthClient;
  };
})();
