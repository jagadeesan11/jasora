import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { LargeSecureStore } from '@/lib/large-secure-store';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project values.',
  );
}

/**
 * Never let the browser cache an API response.
 *
 * PostgREST answers an ambiguous embed with 300 Multiple Choices, and 300 is
 * one of the statuses a browser may cache heuristically when the response
 * carries no cache directives. That happened: a schema problem was fixed in the
 * database, every fresh request succeeded, and the web build kept showing the
 * old error because Chrome was replaying the 300 "(from disk cache)" without
 * going to the network at all. Retrying could not help — no request was being
 * made — which made a fixed bug look unfixed for a day.
 *
 * A REST response is a point-in-time answer about mutable rows; none of it
 * should ever come from disk. `no-store` on web is the whole fix. React Native
 * has no HTTP cache of this kind and ignores the option, so this is a no-op
 * off the web build rather than something that needs branching.
 */
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store' });

// expo-secure-store has no native module on web, so LargeSecureStore (which
// relies on it) can't run there; supabase-js falls back to its own default
// (localStorage) when no storage adapter is provided.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: { fetch: noStoreFetch },
});
