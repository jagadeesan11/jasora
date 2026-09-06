/**
 * Cross-tenant leak suite.
 *
 * Run before and after the phase-4 policy rewrite:
 *   node scripts/leak-test.mjs          # seed, assert, tear down
 *   node scripts/leak-test.mjs --keep   # leave the fixtures in place
 *   node scripts/leak-test.mjs --clean  # tear down only
 *
 * WHY THIS EXISTS
 *
 * The service role key bypasses RLS entirely, so any tenancy check run with it
 * passes whether or not the policies work. This suite therefore signs in as
 * real users and asserts through their sessions. That distinction has already
 * caught two bugs in this project: grants revoked from `authenticated`
 * silently disabled admin policies, because Postgres checks grants before
 * policies; and a read path was broken while the write path it was tested
 * through kept working.
 *
 * SAFETY
 *
 * The live shop is never a write target. Every mutation is aimed at one of the
 * two throwaway shops, so a policy that is wrong damages test data and nothing
 * else. The live shop appears only in read assertions, which cannot harm it.
 *
 * Everything created is prefixed so teardown can find it, and teardown checks
 * row counts back against a baseline rather than trusting itself.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = 'zz-leak';

// ---------------------------------------------------------------- environment

function readEnv() {
  const env = {};
  for (const line of readFileSync(join(ROOT, 'admin', '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    anon: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

const { url, anon, service } = readEnv();
if (!url || !anon || !service) {
  console.error('Missing Supabase env in admin/.env.local');
  process.exit(1);
}

const admin = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };

/** A caller's own session — this is the only way the policies are really tested. */
function asUser(token) {
  return { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function rest(headers, path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

// ------------------------------------------------------------------ assertions

let passed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/**
 * A read must return nothing belonging to another shop.
 *
 * Note this asserts on the rows, not on the status. A leak is a 200 with the
 * wrong rows in it, which a status check would wave straight through.
 */
// `key` names the identifying column, because not every table has an `id`:
// shop_members is keyed (shop_id, profile_id), and comparing an absent r.id
// against the foreign set matches nothing and passes no matter what leaked.
function checkNoRows(name, res, foreignIds, key = 'id') {
  const rows = Array.isArray(res.body) ? res.body : [];
  const leaked = rows.filter((r) => foreignIds.has(r[key]));
  check(name, leaked.length === 0, leaked.length ? `${leaked.length} foreign row(s) visible` : '');
}

/**
 * A write must not land.
 *
 * An error is one acceptable outcome; so is a 200 that changed nothing, since
 * PostgREST answers 204 for a write matching no rows and that reads as success.
 * What is NOT acceptable is rows coming back, which means it worked.
 */
function checkNoWrite(name, res) {
  const wrote = Array.isArray(res.body) ? res.body.length : 0;
  check(name, wrote === 0, wrote ? `wrote ${wrote} row(s)` : '');
}

// ----------------------------------------------------------------- fixtures

async function signIn(email, password) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!body.access_token) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(body).slice(0, 160)}`);
  return body.access_token;
}

async function createUser(email, password) {
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await res.json();
  if (!body.id) throw new Error(`user create failed: ${JSON.stringify(body).slice(0, 160)}`);
  return body.id;
}

/**
 * Fixtures are created by temp_leak_seed, a privileged helper, because several
 * triggers correctly refuse them over the API: bookings are closed while
 * online_payment_enabled is false unless the caller is an admin, and the
 * service key cannot change a profile's role by design.
 *
 * Only the seeding is privileged. Every assertion below runs through a real
 * signed-in session, which is the whole point — the service key bypasses RLS
 * and would report green regardless.
 */
async function seed() {
  // Throwaway passwords, generated here and never reused anywhere.
  const password = `Lk-${Math.random().toString(36).slice(2)}-${Date.now()}`;

  const users = {};
  for (const tag of ['a', 'b']) {
    const email = `${PREFIX}-owner-${tag}@example.invalid`;
    users[tag] = { id: await createUser(email, password), email };
  }

  const res = await fetch(`${url}/rest/v1/rpc/temp_leak_seed`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ p_owner_a: users.a.id, p_owner_b: users.b.id }),
  });
  const data = await res.json();
  if (res.status !== 200) throw new Error(`seed failed: ${JSON.stringify(data).slice(0, 200)}`);

  for (const tag of ['a', 'b']) users[tag].token = await signIn(users[tag].email, password);

  return { users, data };
}

// -------------------------------------------------------------------- the run

async function run({ users, data }) {
  const live = (await rest(admin, 'shops?select=id&slug=eq.moto-ceramic')).body[0];

  // Rows that must never be visible to shop A's owner.
  const foreignBookings = new Set([data.b.booking]);
  const foreignServices = new Set([data.b.service]);
  const foreignCategories = new Set([data.b.category]);

  const liveBookings = new Set(
    (await rest(admin, `bookings?select=id&shop_id=eq.${live.id}`)).body.map((r) => r.id),
  );

  const A = asUser(users.a.token);

  console.log('\n  READS — private trade must not cross shops');
  checkNoRows('bookings', await rest(A, 'bookings?select=id'), foreignBookings);
  checkNoRows('live bookings', await rest(A, 'bookings?select=id'), liveBookings);
  checkNoRows('invoices', await rest(A, 'invoices?select=id'),
    new Set((await rest(admin, `invoices?select=id&shop_id=eq.${live.id}`)).body.map((r) => r.id)));
  checkNoRows('technicians', await rest(A, 'technicians?select=id'),
    new Set((await rest(admin, `technicians?select=id&shop_id=eq.${live.id}`)).body.map((r) => r.id)));
  checkNoRows('support requests', await rest(A, 'support_requests?select=id'),
    new Set((await rest(admin, `support_requests?select=id&shop_id=eq.${live.id}`)).body.map((r) => r.id)));
  checkNoRows('booking events', await rest(A, 'booking_events?select=id'),
    new Set((await rest(admin, `booking_events?select=id&shop_id=eq.${live.id}`)).body.map((r) => r.id)));
  // shop_members is the table tenancy is DERIVED from: every phase-4 policy
  // says "shop_id in (select my_shop_ids())", and that reads this. It was
  // still on the pre-tenancy is_admin(), which is true for any shop_owner
  // anywhere, so shop A could read and — worse — write shop B's roster. This
  // suite passed throughout, because it never asked this table anything.
  // PRIVILEGE ESCALATION — a shop owner must not be able to become platform.
  //
  // This was reachable: profiles_update_own_or_admin let a shop owner update
  // any profile row, and prevent_self_role_escalation allowed a role change to
  // anyone passing the tenant-blind is_admin() — which a shop owner did. So A
  // could set their own role to 'admin' and gain every shop. Both halves are
  // fixed; this is the proof, and it asserts on the stored role rather than on
  // the response, because a write that silently succeeded would still return
  // an empty body.
  await rest(A, `profiles?id=eq.${users.a.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ role: 'admin' }),
  });
  const roleNow = (await rest(admin, `profiles?select=role&id=eq.${users.a.id}`)).body[0]?.role;
  check('shop owner cannot promote themselves', roleNow === 'shop_owner', `role is now ${roleNow}`);

  // Positive control for that one too: the same PATCH shape must still work on
  // a field they are allowed to change, or the refusal above proves only that
  // profile updates are broken.
  await rest(A, `profiles?id=eq.${users.a.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: 'Leak Owner A renamed' }),
  });
  const nameNow = (await rest(admin, `profiles?select=name&id=eq.${users.a.id}`)).body[0]?.name;
  check('own profile is still editable', nameNow === 'Leak Owner A renamed', `name is ${nameNow}`);

  // Positive control: A must still see their OWN membership, or the check
  // below passes simply because nobody can read this table at all — and every
  // phase-4 policy depends on being able to.
  check(
    'own membership visible',
    (await rest(A, 'shop_members?select=shop_id,profile_id')).body.some(
      (r) => r.shop_id === data.a.shop,
    ),
  );
  checkNoRows(
    'shop members of another shop',
    await rest(A, 'shop_members?select=profile_id'),
    new Set(
      (await rest(admin, `shop_members?select=profile_id&shop_id=eq.${live.id}`)).body.map(
        (r) => r.profile_id,
      ),
    ),
    'profile_id',
  );
  checkNoRows('payments', await rest(A, 'payments?select=id'),
    new Set((await rest(admin, `payments?select=id&shop_id=eq.${live.id}`)).body.map((r) => r.id)));

  // The customer-owned tables. These have no shop_id — a person and their car
  // belong to a customer, not a shop — which is exactly why phase 4 skipped
  // them and why they stayed readable by every shop owner for weeks. Their
  // scope is derived from bookings instead, so it needs testing rather than
  // reading.
  checkNoRows(
    'profiles of another shop\'s customers',
    await rest(A, 'profiles?select=id'),
    new Set(
      (await rest(admin, `bookings?select=user_id&shop_id=eq.${live.id}`)).body.map((r) => r.user_id),
    ),
  );
  checkNoRows(
    'vehicles booked in at another shop',
    await rest(A, 'customer_assets?select=id'),
    new Set(
      (await rest(admin, `bookings?select=asset_id&shop_id=eq.${live.id}`)).body
        .map((r) => r.asset_id)
        .filter(Boolean),
    ),
  );
  // Positive controls. Without these the two checks above pass just as well if
  // profiles became unreadable to everyone — which would break the admin
  // bookings list, where staff need the customer's name and phone, while
  // looking exactly like a hardened system.
  check(
    'own profile still readable',
    (await rest(A, `profiles?select=id&id=eq.${users.a.id}`)).body.length === 1,
  );

  // Give shop A a customer who is not A, so "my customers" is distinguishable
  // from "my own row". Owner B books a job with shop A; teardown removes it
  // with the rest of shop A.
  await rest(admin, 'bookings', {
    method: 'POST',
    body: JSON.stringify({
      user_id: users.b.id,
      service_id: data.a.service,
      scheduled_at: '2027-04-01T10:00:00Z',
      total_price: 100,
      payment_method: 'cod',
      status: 'confirmed',
      shop_id: data.a.shop,
    }),
  });
  check(
    'staff can read a customer of their own shop',
    (await rest(A, `profiles?select=id&id=eq.${users.b.id}`)).body.length === 1,
    'my_customer_ids() is not resolving — the bookings list would show no names',
  );

  // Nobody gets staff access to push tokens: the notification sender uses the
  // service key, so the policy is own-row-only and there is nothing to scope.
  check(
    'device tokens are own-row only',
    (await rest(A, 'device_tokens?select=profile_id')).body.every(
      (r) => r.profile_id === users.a.id,
    ),
  );

  // The catalogue is deliberately NOT scoped: this is one app with a shop
  // picker, so a customer browsing is supposed to see every shop's services in
  // order to choose one. Asserting otherwise would have driven a change that
  // broke the product. What must not cross is the ability to CHANGE them,
  // which the write checks below cover.
  console.log('  READS — catalogue is public across shops, by design');
  check('services visible cross-shop',
    (await rest(A, 'services?select=id')).body.some((r) => foreignServices.has(r.id)));
  check('categories visible cross-shop',
    (await rest(A, 'categories?select=id')).body.some((r) => foreignCategories.has(r.id)));

  console.log('  WRITES — shop A owner must not touch shop B (test data only)');

  // Positive control first, and it is the important one. Retiring is_admin()
  // rewrote the triggers that guard booking updates, and those triggers now ask
  // is_shop_staff(new.shop_id) instead of "staff anywhere". If that predicate
  // does not resolve, every assign/start/complete in the owner app fails —
  // which is precisely what phase 2 did to this table, undetected, because the
  // suite only ever checked that writes were REFUSED.
  {
    const res = await rest(A, `bookings?id=eq.${data.a.booking}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'in_progress' }),
    });
    const rows = Array.isArray(res.body) ? res.body : [];
    check(
      'shop owner can still start their own job',
      rows.length === 1 && rows[0].status === 'in_progress',
      rows.length ? `status came back ${rows[0].status}` : `status ${res.status} ${JSON.stringify(res.body).slice(0, 160)}`,
    );
  }
  checkNoWrite(
    'update B booking',
    await rest(A, `bookings?id=eq.${data.b.booking}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ total_price: 999 }),
    }),
  );
  checkNoWrite(
    'update B service',
    await rest(A, `services?id=eq.${data.b.service}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ base_price: 999 }),
    }),
  );
  checkNoWrite(
    'delete B booking',
    await rest(A, `bookings?id=eq.${data.b.booking}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    }),
  );

  // Positive control first. Without it the two refusals below would pass even
  // if inserting an add-on were impossible for everyone — which is how the
  // phase 7 storage policy looked correct while refusing a legitimate upload.
  // This proves the path is live and the trigger really does fill shop_id.
  {
    const res = await rest(A, 'addons', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ service_id: data.a.service, name: PREFIX + '-own', price: 1 }),
    });
    const row = Array.isArray(res.body) ? res.body[0] : null;
    check(
      'add-on on own service, shop derived',
      row?.shop_id === data.a.shop,
      row ? `shop_id came back ${row.shop_id}` : `status ${res.status}`,
    );
  }

  // Phase 8 added a SECURITY DEFINER trigger that fills shop_id from the
  // parent row, so a child no longer has to be told which shop it is in. That
  // trigger writes a tenancy column with the definer's privileges, which makes
  // it worth attacking directly: A adds an add-on to B's service, and both
  // ways of getting it wrong are covered. Omitting shop_id must not let the
  // trigger stamp B and wave it through; naming A's own shop must not pass the
  // policy by disagreeing with the parent.
  checkNoWrite(
    'add-on on B service, shop_id omitted',
    await rest(A, 'addons', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ service_id: data.b.service, name: PREFIX + '-derive', price: 1 }),
    }),
  );
  checkNoWrite(
    'add-on on B service, shop_id claimed as A',
    await rest(A, 'addons', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        service_id: data.b.service,
        shop_id: data.a.shop,
        name: PREFIX + '-claim',
        price: 1,
      }),
    }),
  );

  // Independent confirmation: read B's row back with the service key and check
  // it is untouched. A write that silently succeeded would show here even if
  // the response above looked empty.
  const after = (await rest(admin, `bookings?select=total_price&id=eq.${data.b.booking}`)).body;
  check('B booking value unchanged', after.length === 1 && Number(after[0].total_price) === 100,
    after.length ? `total_price is ${after[0]?.total_price}` : 'row is gone');

  // Phase 5: create_booking derives the shop from the service rather than
  // taking it as an argument, so a caller cannot name one. These two calls
  // prove the derivation both works and cannot be steered.
  console.log('  RPC — the shop is derived from the service, not chosen');

  const own = await fetch(`${url}/rest/v1/rpc/create_booking`, {
    method: 'POST',
    headers: A,
    body: JSON.stringify({ p_service_id: data.a.service, p_scheduled_at: '2027-06-01T10:00:00Z' }),
  });
  const ownBody = await own.json().catch(() => null);
  check('own shop booking lands on own shop',
    own.status === 200 && ownBody?.shop_id === data.a.shop,
    `status ${own.status}, shop ${ownBody?.shop_id ?? 'none'}`);

  // Booking shop B's service as shop A's owner. This must succeed — anyone may
  // book anywhere, that is what a marketplace is — and the point is where it
  // lands: on shop B, because the shop is derived from the service rather than
  // taken from the caller or the payload.
  //
  // This check used to assert a refusal, on the grounds that B's opening hours
  // were enforced against a non-member. It passed for the wrong reason: the
  // seed suspends triggers, so test shops get no hours at all and every slot
  // read as closed. Opening hours no longer gate bookings either way, so the
  // assertion is now the tenancy one it always should have been.
  const foreign = await fetch(`${url}/rest/v1/rpc/create_booking`, {
    method: 'POST',
    headers: A,
    body: JSON.stringify({ p_service_id: data.b.service, p_scheduled_at: '2027-06-01T10:00:00Z' }),
  });
  const foreignBody = await foreign.json().catch(() => null);
  check("another shop's service books onto that shop",
    foreign.status === 200 && foreignBody?.shop_id === data.b.shop,
    `status ${foreign.status}, shop ${foreignBody?.shop_id ?? 'none'}`);

  // What a shop CAN still refuse: a date it has blocked. That is the shop
  // naming a day it will not work, as opposed to the hours it usually keeps.
  await rest(admin, 'shop_closures', {
    method: 'POST',
    body: JSON.stringify({ shop_id: data.b.shop, closed_on: '2027-06-04' }),
  });
  const onClosedDay = await fetch(`${url}/rest/v1/rpc/create_booking`, {
    method: 'POST',
    headers: A,
    body: JSON.stringify({ p_service_id: data.b.service, p_scheduled_at: '2027-06-04T10:00:00Z' }),
  });
  const closedBody = await onClosedDay.json().catch(() => null);
  check('a date the shop blocked is still refused',
    onClosedDay.status >= 400 && /closed on that date/.test(JSON.stringify(closedBody)),
    `status ${onClosedDay.status} ${JSON.stringify(closedBody).slice(0, 120)}`);
  await rest(admin, `shop_closures?shop_id=eq.${data.b.shop}`, { method: 'DELETE' });

  // Anything that did get created is test data, and teardown will take it.

  // A shop's payment configuration must not silently close it.
  //
  // Every booking is forced to payment_method 'online' on insert, with cash
  // chosen afterwards — so a guard that read "online payment off" as "not open
  // for business" stopped a cash-only shop taking any booking at all, before
  // the customer ever reached the screen that offers cash. Both live shops are
  // cash-only, so this was every booking.
  //
  // A is not staff of shop B, so booking B's service exercises the guard rather
  // than the staff exemption.
  console.log('  PAYMENT CONFIG — a shop must be bookable on whatever it accepts');

  const setPayment = (shop, cod, online) =>
    rest(admin, `shops?id=eq.${shop}`, {
      method: 'PATCH',
      body: JSON.stringify({ cod_enabled: cod, online_payment_enabled: online }),
    });

  const bookB = (at) =>
    fetch(`${url}/rest/v1/rpc/create_booking`, {
      method: 'POST',
      headers: A,
      body: JSON.stringify({ p_service_id: data.b.service, p_scheduled_at: at }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

  // Shop B has no opening hours: temp_leak_seed runs with triggers suspended,
  // so the seed_business_hours trigger never fires for a test shop, and every
  // slot reads as closed. That is fine for the assertions above — it is also
  // why the foreign-booking check passes — but here it would mask the thing
  // being tested, so B gets a week of hours for the length of this section.
  await rest(admin, 'business_hours', {
    method: 'POST',
    body: JSON.stringify(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        shop_id: data.b.shop,
        weekday,
        is_open: true,
        opens_at: '09:00',
        closes_at: '20:00',
      })),
    ),
  });

  await setPayment(data.b.shop, true, false);
  const cashOnly = await bookB('2027-06-02T10:00:00Z');
  check('cash-only shop can take a booking', cashOnly.status === 200,
    `status ${cashOnly.status} ${JSON.stringify(cashOnly.body).slice(0, 120)}`);

  await setPayment(data.b.shop, false, false);
  const noMethod = await bookB('2027-06-03T10:00:00Z');
  check('shop with no payment method is refused',
    noMethod.status >= 400 && /not taking bookings/.test(JSON.stringify(noMethod.body)),
    `status ${noMethod.status} ${JSON.stringify(noMethod.body).slice(0, 120)}`);

  // Back to the seeded defaults so later assertions see what they expect, and
  // the hours go with them — teardown does not cover business_hours, and a left
  // behind row would block the shop's own deletion.
  await setPayment(data.b.shop, false, true);
  await rest(admin, `business_hours?shop_id=eq.${data.b.shop}`, { method: 'DELETE' });

  // Every embed the two apps actually send.
  //
  // This section exists because phase 2 broke all of them and this suite said
  // nothing. Adding a composite foreign key beside an existing one gave twelve
  // table pairs two relationships, and PostgREST refuses to embed when it
  // cannot tell which to follow — so the admin bookings list, the customer
  // booking history, the owner inbox, invoices and feedback were all failing
  // while every policy assertion here stayed green. Policies were never the
  // problem; the suite simply never sent the shape of query the apps send.
  //
  // These are copied from the real call sites. A schema change that breaks an
  // embed now fails here instead of in someone's hands.
  console.log('  EMBEDS — the shapes both apps actually send');

  const embeds = [
    ['admin categories', 'categories?select=id,name,slug,icon,input_template_id,input_templates(id,fields)'],
    ['admin services', 'services?select=id,category_id,name,base_price,is_active,categories(id,name)'],
    ['admin bookings', 'bookings?select=id,status,invoices(number),payments(status),services(id,name),technicians(id,name)'],
    ['customer bookings', 'bookings?select=id,status,net_price,promo_codes(code),services(name),technicians(name)'],
    ['booking input template', 'services?select=category_id,categories(id,input_template_id,input_templates(fields))'],
    ['feedback tags', 'services?select=categories(feedback_tags)'],
    ['owner reports', 'bookings?select=scheduled_at,status,net_price,services(name),technicians(name)'],
    ['addons and rules', 'addons?select=id,services(name)'],
    ['feedback to booking', 'service_feedback?select=id,bookings(id),services(name),technicians(name)'],
    ['redemptions to code', 'promo_redemptions?select=id,promo_codes(code),bookings(id)'],
  ];

  for (const [name, path] of embeds) {
    const res = await rest(A, `${path}&limit=1`);
    // A refused embed comes back as a PostgREST error object rather than an
    // array, so the shape of the answer is the assertion.
    const ok = Array.isArray(res.body);
    check(`embed: ${name}`, ok, ok ? '' : res.body?.message ?? `status ${res.status}`);
  }

  // One person, two shops — the case the owner app's picker exists for, and the
  // one that is easy to get wrong in the opposite direction from a leak: after
  // legitimately joining a second shop, staff must gain exactly that shop and
  // nothing else, and the membership query must return each shop once rather
  // than once per membership row.
  //
  // Run last, because it deliberately grants A access to B and so invalidates
  // the assertions above. The membership is removed again straight afterwards.
  console.log('  MULTI-SHOP — one owner, two shops');

  await rest(admin, 'shop_members', {
    method: 'POST',
    body: JSON.stringify({ shop_id: data.b.shop, profile_id: users.a.id, role: 'shop_owner' }),
  });

  const mine = await rest(A, 'shop_members?select=shop_id&profile_id=eq.' + users.a.id);
  const myShopIds = (Array.isArray(mine.body) ? mine.body : []).map((r) => r.shop_id);
  check(
    'both shops returned, once each',
    myShopIds.length === 2 && new Set(myShopIds).size === 2,
    `got ${myShopIds.length} row(s), ${new Set(myShopIds).size} distinct`,
  );

  // Access follows membership: B's bookings are now legitimately visible.
  const bNow = await rest(A, `bookings?select=id&shop_id=eq.${data.b.shop}`);
  check(
    'joined shop becomes visible',
    Array.isArray(bNow.body) && bNow.body.length > 0,
    `saw ${Array.isArray(bNow.body) ? bNow.body.length : 0}`,
  );

  // ...and stops at membership: the live shop is still nobody else's business.
  checkNoRows('live shop still hidden', await rest(A, 'bookings?select=id'), liveBookings);

  await rest(admin, `shop_members?shop_id=eq.${data.b.shop}&profile_id=eq.${users.a.id}`, {
    method: 'DELETE',
  });

  console.log('  ANON — must see no bookings at all');
  const anonRes = await rest({ apikey: anon, Authorization: `Bearer ${anon}` }, 'bookings?select=id');
  check('anon bookings', !Array.isArray(anonRes.body) || anonRes.body.length === 0,
    Array.isArray(anonRes.body) ? `${anonRes.body.length} rows` : '');
}

// -------------------------------------------------------------------- teardown

async function teardown() {
  // Via the helper, not REST: the same triggers that refuse the seeding refuse
  // parts of the cleanup, and a teardown that half-works is worse than none.
  const res = await fetch(`${url}/rest/v1/rpc/temp_leak_teardown`, { method: 'POST', headers: admin, body: '{}' });
  const body = await res.json().catch(() => ({}));

  const users = (await (await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: admin })).json()).users || [];
  const mine = users.filter((x) => (x.email || '').startsWith(PREFIX));
  for (const u of mine) {
    await fetch(`${url}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: admin });
  }
  return { shops: body.shops_removed ?? 0, users: mine.length };
}

const BASELINE_TABLES = [
  'shops', 'shop_members', 'categories', 'services', 'addons', 'pricing_rules',
  'technicians', 'promo_codes', 'business_hours', 'bookings', 'booking_events',
  'payments', 'invoices', 'service_feedback', 'promo_redemptions',
];

async function countRows(table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
    headers: { ...admin, Prefer: 'count=exact', Range: '0-0' },
  });
  return Number((res.headers.get('content-range') || '/0').split('/')[1]) || 0;
}

async function countAuthUsers() {
  const res = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: admin });
  const body = await res.json();
  return (body.users || []).length;
}

/**
 * Row counts as they are right now.
 *
 * Measured at the start of every run rather than read from a file written
 * once. A stored snapshot goes stale the moment the database legitimately
 * changes — adding a second shop made it report two tables as drift on a run
 * that had cleaned up perfectly — and a cleanup check that cries wolf is one
 * nobody reads. Measuring per run also makes the claim honest: what is being
 * asserted is that THIS run left nothing behind.
 */
async function takeBaseline() {
  const base = {};
  for (const t of BASELINE_TABLES) base[t] = await countRows(t);
  base.__auth_users = await countAuthUsers();
  return base;
}

async function verifyBaseline(base) {
  if (!base) {
    console.log('\n  (no baseline taken — skipping restore check)');
    return true;
  }
  const drift = [];
  for (const [table, expected] of Object.entries(base)) {
    const n = table === '__auth_users' ? await countAuthUsers() : await countRows(table);
    if (n !== expected) drift.push(`${table}: ${n} vs ${expected}`);
  }
  if (drift.length) {
    console.log('\n  !! DID NOT RETURN TO BASELINE');
    for (const d of drift) console.log('     ' + d);
    return false;
  }
  console.log('\n  every table back to baseline');
  return true;
}

// ------------------------------------------------------------------------ main

const args = process.argv.slice(2);

if (args.includes('--clean')) {
  const removed = await teardown();
  console.log(`removed ${removed.shops} shop(s), ${removed.users} user(s)`);
  process.exit(0);
}

console.log('Cross-tenant leak suite');
console.log('  live shop is never a write target; all mutations hit test shops only');

await teardown(); // in case a previous run was interrupted

// Taken after that teardown and before seeding, so it describes the database
// this run started from.
const baseline = await takeBaseline();
const fixtures = await seed();
console.log(`  seeded 2 shops, ${Object.keys(fixtures.users).length} owners`);

try {
  await run(fixtures);
} finally {
  if (!args.includes('--keep')) {
    await teardown();
  }
}

console.log(`\n  ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`    FAIL  ${f}`);

if (!args.includes('--keep')) {
  const clean = await verifyBaseline(baseline);
  if (!clean) process.exitCode = 1;
}

if (failures.length) process.exitCode = 1;
