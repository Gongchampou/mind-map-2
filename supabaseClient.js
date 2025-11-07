import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const missingConfigMessage = 'Supabase environment variables are missing. Cloud sync is disabled until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(missingConfigMessage);
}

function createDisabledClient() {
  const error = new Error(missingConfigMessage);
  const queryBuilder = {
    select() { return this; },
    upsert: async () => ({ data: null, error }),
    eq() { return this; },
    maybeSingle: async () => ({ data: null, error }),
  };

  return {
    auth: {
      async getSession() { return { data: { session: null }, error: null }; },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async signInWithPassword() { return { data: null, error }; },
      async signUp() { return { data: null, error }; },
      async signOut() { return { error: null }; },
    },
    from() {
      return queryBuilder;
    },
  };
}

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createDisabledClient();

