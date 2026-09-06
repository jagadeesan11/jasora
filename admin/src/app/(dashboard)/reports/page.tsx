import { PageHeader } from '@/components/page-header';
import { ReportsView } from '@/components/reports/reports-view';
import { getShopContext } from '@/lib/shop';
import { createClient } from '@/lib/supabase/server';
import type { ReportRow } from '@/types/reports';

export default async function ReportsPage() {
  const supabase = await createClient();
  const { shop } = await getShopContext();
  const { data, error } = await supabase
    .from('bookings')
    .select(
      `id, created_at, scheduled_at, status, total_price, net_price, payment_method,
       services(name, categories(name)),
       technicians(name),
       profiles(name, phone, city),
       invoices(number),
       service_feedback(rating)`,
    )
    .eq('shop_id', shop?.id ?? '')
    .order('scheduled_at', { ascending: false })
    .returns<ReportRow[]>();

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Trading summary and the underlying bookings. Export the detail as CSV for accounts or a board pack."
      />

      {error ? (
        <p className="text-sm text-destructive">Failed to load reports: {error.message}</p>
      ) : (
        <ReportsView rows={data ?? []} />
      )}
    </div>
  );
}
