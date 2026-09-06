import { PageHeader } from '@/components/page-header';
import { BookingsTable } from '@/components/bookings/bookings-table';
import { getShopContext } from '@/lib/shop';
import { createClient } from '@/lib/supabase/server';
import type { BookingListItem, Technician } from '@/types/database';

export default async function BookingsPage() {
  const supabase = await createClient();
  const { shop } = await getShopContext();
  const shopId = shop?.id ?? '';

  const [{ data: bookings, error }, { data: technicians }, { data: addons }] = await Promise.all([
    supabase
      .from('bookings')
      .select(
        `id, scheduled_at, status, total_price, discount_amount, discount_reason, net_price,
         promo_discount_amount, promo_codes(code),
         technician_id, addon_ids, created_at,
         contact_name, contact_phone, service_address, service_city, service_postal_code,
         needs_pickup, pickup_notes, payment_method,
         invoices(number),
         payments(status),
         services(id, name, category_id, duration_minutes),
         profiles:user_id(name, phone, email, address_line, city, postal_code),
         technicians(id, name, phone),
         customer_assets:asset_id(attributes)`,
      )
      // The bookings themselves were the one thing left unscoped here: a shop
      // owner is narrowed by RLS, but a platform admin sees every shop, so
      // without this the list merged them.
      .eq('shop_id', shopId)
      .order('scheduled_at', { ascending: false })
      .returns<BookingListItem[]>(),
    // The assign picker, and the add-on names. Both scoped to this shop:
    // bookings themselves come back scoped by RLS, but these two lookups are
    // read from tables whose policies are open.
    supabase
      .from('technicians')
      .select('*')
      .eq('shop_id', shopId)
      .eq('status', 'active')
      .order('name')
      .returns<Technician[]>(),
    // addon_ids is a uuid[] rather than a FK, so PostgREST can't embed the
    // rows — fetch them once and resolve names client-side.
    supabase.from('addons').select('id, name').eq('shop_id', shopId).returns<{ id: string; name: string }[]>(),
  ]);

  return (
    <div>
      <PageHeader
        title="Bookings"
        description="Assign a technician to confirmed bookings that don't have one yet."
      />

      {error ? (
        <p className="text-sm text-destructive">Failed to load bookings: {error.message}</p>
      ) : (
        <BookingsTable
          initialBookings={bookings ?? []}
          technicians={technicians ?? []}
          addons={addons ?? []}
        />
      )}
    </div>
  );
}
