import { createClient as createServiceClient } from '@supabase/supabase-js';

import { PageHeader } from '@/components/page-header';
import { SupportQueue } from '@/components/support/support-queue';
import { getShopContext } from '@/lib/shop';
import { createClient } from '@/lib/supabase/server';
import type { AccountMatch, SupportRequest } from '@/types/support';

/**
 * Ties each request to the account it is probably about.
 *
 * The whole point of the queue is "this person cannot sign in" — so the first
 * thing an admin needs is which account that is. Login identities live in
 * auth.users, not profiles, and are only reachable with the service key on the
 * server. Without a key configured this degrades to no matches rather than
 * failing the page.
 */
async function matchAccounts(requests: SupportRequest[]): Promise<Record<string, AccountMatch>> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || requests.length === 0) return {};

  const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const users = data?.users ?? [];

  const byEmail = new Map<string, (typeof users)[number]>();
  const byPhone = new Map<string, (typeof users)[number]>();
  for (const u of users) {
    // || not ??: Supabase returns an empty string for an absent email, which
    // ?? passes straight through and would then match every blank contact.
    if (u.email) byEmail.set(u.email.toLowerCase(), u);
    if (u.phone) byPhone.set(u.phone.replace(/^\+/, ''), u);
  }

  const names = new Map<string, string | null>();
  const supabase = await createClient();
  const { data: profiles } = await supabase.from('profiles').select('id, name');
  for (const p of profiles ?? []) names.set(p.id, p.name);

  const matches: Record<string, AccountMatch> = {};
  for (const r of requests) {
    const hit =
      (r.contact_email && byEmail.get(r.contact_email.toLowerCase())) ||
      (r.contact_phone && byPhone.get(r.contact_phone.replace(/^\+/, '')));
    if (hit) {
      matches[r.id] = {
        id: hit.id,
        name: names.get(hit.id) ?? null,
        identity: hit.email || hit.phone || '—',
      };
    }
  }
  return matches;
}

export default async function SupportPage() {
  const supabase = await createClient();
  const { shop } = await getShopContext();
  const { data, error } = await supabase
    .from('support_requests')
    .select(
      'id, kind, contact_raw, contact_email, contact_phone, message, status, admin_note, created_at, resolved_at',
    )
    .eq('shop_id', shop?.id ?? '')
    .order('created_at', { ascending: false })
    .returns<SupportRequest[]>();

  const requests = data ?? [];
  const matches = await matchAccounts(requests);
  const open = requests.filter((r) => r.status !== 'resolved').length;

  return (
    <div>
      <PageHeader
        title="Help requests"
        description={
          open > 0
            ? `${open} waiting. Most are "I can't sign in" — match the contact to an account, then set a new password from Users.`
            : 'Nothing waiting. Customers who cannot sign in land here, along with any questions they send.'
        }
      />

      {error ? (
        <p className="text-sm text-destructive">Failed to load requests: {error.message}</p>
      ) : (
        <SupportQueue initialRequests={requests} matches={matches} />
      )}
    </div>
  );
}
