import { createBrowserClient } from '@supabase/ssr';

/**
 * Never let the browser cache an API response.
 *
 * PostgREST answers an ambiguous embed with 300 Multiple Choices, and 300 is
 * one of the statuses a browser may cache heuristically when the response
 * carries no cache directives. That happened in the mobile web build: a schema
 * problem was fixed in the database, every fresh request succeeded, and the app
 * kept showing the old error because Chrome was replaying the 300 "(from disk
 * cache)" without going to the network. Retrying could not help — no request
 * was being made.
 *
 * The same client runs here, against the same API, so it gets the same
 * treatment. A REST response is a point-in-time answer about mutable rows;
 * none of it should come from disk.
 */
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store' });

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: noStoreFetch } },
  );
}
