import { CalendarCheck, IndianRupee, Layers, Users, Wrench } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import { getShopContext } from '@/lib/shop';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

const PRICE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const DATE = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

const STATUS_STYLES: Record<string, string> = {
  pending_payment: 'bg-muted text-muted-foreground',
  confirmed: 'bg-primary/12 text-primary',
  assigned: 'bg-primary/12 text-primary',
  in_progress: 'bg-chart-3/20 text-chart-3',
  completed: 'bg-primary/12 text-primary',
  cancelled: 'bg-destructive/12 text-destructive',
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Pending payment',
  confirmed: 'Confirmed',
  assigned: 'Assigned',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

interface RecentBooking {
  id: string;
  scheduled_at: string;
  status: string;
  total_price: number;
  services: { name: string } | null;
}

export default async function DashboardHome() {
  const supabase = await createClient();
  const { shop } = await getShopContext();
  const shopId = shop?.id ?? '';

  // Counts for this shop. The booking queries below need no filter: bookings
  // are scoped by RLS to the shops the caller is staff at.
  const [categories, services, technicians, bookings, recent] = await Promise.all([
    supabase.from('categories').select('id', { count: 'exact', head: true }).eq('shop_id', shopId),
    supabase
      .from('services')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('is_active', true),
    supabase
      .from('technicians')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .eq('status', 'active'),
    supabase.from('bookings').select('status, total_price'),
    supabase
      .from('bookings')
      .select('id, scheduled_at, status, total_price, services(name)')
      .order('scheduled_at', { ascending: false })
      .limit(5)
      .returns<RecentBooking[]>(),
  ]);

  const allBookings = bookings.data ?? [];
  const awaitingAssignment = allBookings.filter((b) => b.status === 'confirmed').length;
  const revenue = allBookings
    .filter((b) => b.status !== 'cancelled' && b.status !== 'pending_payment')
    .reduce((sum, b) => sum + Number(b.total_price), 0);

  const stats = [
    { label: 'Categories', value: categories.count ?? 0, Icon: Layers, href: '/categories' },
    { label: 'Active services', value: services.count ?? 0, Icon: Wrench, href: '/services' },
    { label: 'Bookings', value: allBookings.length, Icon: CalendarCheck, href: '/bookings' },
    { label: 'Active technicians', value: technicians.count ?? 0, Icon: Users, href: '/technicians' },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="A snapshot of your catalogue and booking activity."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, Icon, href }) => (
          <Link
            key={label}
            href={href}
            className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {label}
              </span>
              <Icon className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</div>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Booked value
            </span>
            <IndianRupee className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
            {PRICE.format(revenue)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Excludes cancelled and unpaid bookings.
          </p>
        </div>

        <div
          className={cn(
            'rounded-xl border p-4',
            awaitingAssignment > 0
              ? 'border-primary/40 bg-primary/5'
              : 'border-border bg-card',
          )}
        >
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Needs a technician
          </span>
          <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
            {awaitingAssignment}
          </div>
          {awaitingAssignment > 0 ? (
            <Link href="/bookings" className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
              Assign now →
            </Link>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Everything is assigned.</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-1">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Completed
          </span>
          <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
            {allBookings.filter((b) => b.status === 'completed').length}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Jobs finished to date.</p>
        </div>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Recent bookings</h2>
          <Link href="/bookings" className="text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {(recent.data ?? []).length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No bookings yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(recent.data ?? []).map((booking) => (
                <li key={booking.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {booking.services?.name ?? 'Service'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {DATE.format(new Date(booking.scheduled_at))}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
                      STATUS_STYLES[booking.status] ?? 'bg-muted text-muted-foreground',
                    )}
                  >
                    {STATUS_LABELS[booking.status] ?? booking.status}
                  </span>
                  <span className="w-20 text-right text-sm font-medium tabular-nums">
                    {PRICE.format(booking.total_price)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
