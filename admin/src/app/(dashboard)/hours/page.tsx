import { PageHeader } from '@/components/page-header';
import { CapacityCard } from '@/components/hours/capacity-card';
import { ClosuresCard, type ClosureRow } from '@/components/hours/closures-card';
import { HoursForm } from '@/components/hours/hours-form';
import { ShopLocationCard } from '@/components/shops/shop-location-card';
import type { DayInput } from '@/app/(dashboard)/hours/actions';
import { getShopContext } from '@/lib/shop';
import { createClient } from '@/lib/supabase/server';

export default async function HoursPage() {
  const supabase = await createClient();
  const { shop } = await getShopContext();
  const shopId = shop?.id ?? '';

  // Only from today: a day the shop was shut last month tells nobody anything
  // and would grow the list forever.
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;

  // The shop's own row, for the location card below.
  const { data: shopRow } = await supabase
    .from('shops')
    .select('latitude, longitude, service_radius_km, concurrent_jobs')
    .eq('id', shopId)
    .maybeSingle<{
      latitude: number | null;
      longitude: number | null;
      service_radius_km: number;
      concurrent_jobs: number;
    }>();

  const [{ data: hours, error }, { data: closures }] = await Promise.all([
    supabase
      .from('business_hours')
      .select('weekday, is_open, opens_at, closes_at')
      .eq('shop_id', shopId)
      .order('weekday')
      .returns<DayInput[]>(),
    supabase
      .from('shop_closures')
      .select('id, closed_on, reason')
      .eq('shop_id', shopId)
      .gte('closed_on', iso)
      .order('closed_on')
      .returns<ClosureRow[]>(),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <PageHeader
          title="Hours & availability"
          description="When this shop is staffed. Shown to customers in the app so they know when to turn up — it does not limit when they can book."
        />

        {error ? (
          <p className="text-sm text-destructive">Failed to load hours: {error.message}</p>
        ) : !hours || hours.length === 0 ? (
          // Every shop is seeded with a full week when it is created, so an
          // empty result means something went wrong rather than a shop that
          // has not got round to it.
          <p className="text-sm text-destructive">
            This shop has no opening hours set up. That should not happen — tell whoever runs
            Jasora.
          </p>
        ) : (
          <HoursForm days={hours} />
        )}
      </div>

      <CapacityCard concurrentJobs={shopRow?.concurrent_jobs ?? 1} />

      <ClosuresCard closures={closures ?? []} />

      <ShopLocationCard
        latitude={shopRow?.latitude ?? null}
        longitude={shopRow?.longitude ?? null}
        serviceRadiusKm={shopRow?.service_radius_km ?? 100}
      />
    </div>
  );
}
