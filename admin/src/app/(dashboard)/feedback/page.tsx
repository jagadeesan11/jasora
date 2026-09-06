import { PageHeader } from '@/components/page-header';
import { FeedbackList } from '@/components/feedback/feedback-list';
import { getShopContext } from '@/lib/shop';
import { createClient } from '@/lib/supabase/server';
import type { FeedbackListItem } from '@/types/feedback';

export default async function FeedbackPage() {
  const supabase = await createClient();
  const { shop } = await getShopContext();

  // Scoped to the shop being worked in. RLS is not enough on its own here: it
  // narrows a shop owner to their own shops, but a platform admin passes
  // is_platform_admin() and so is shown every shop's rows merged into one
  // list, with nothing on screen saying which shop a row came from.
  const { data, error } = await supabase
    .from('service_feedback')
    .select(
      `id, booking_id, rating, comment, tags, is_published, admin_response, responded_at, created_at,
       services(name), technicians(name), profiles(name, phone)`,
    )
    .eq('shop_id', shop?.id ?? '')
    .order('created_at', { ascending: false })
    .returns<FeedbackListItem[]>();

  return (
    <div>
      <PageHeader
        title="Feedback"
        description="What customers said after the work was done. Low ratings come first — an unanswered one-star is the thing worth acting on today."
      />

      {error ? (
        <p className="text-sm text-destructive">Failed to load feedback: {error.message}</p>
      ) : (
        <FeedbackList initialFeedback={data ?? []} />
      )}
    </div>
  );
}
