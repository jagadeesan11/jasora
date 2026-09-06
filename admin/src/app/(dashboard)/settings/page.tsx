import { PageHeader } from '@/components/page-header';
import { SettingsForm } from '@/components/settings/settings-form';
import { getShopContext } from '@/lib/shop';
import { createClient } from '@/lib/supabase/server';
import type { ShopSettings } from '@/types/database';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { shop } = await getShopContext();

  // Settings are now that shop's own row. Someone who administers no shop has
  // nothing to edit here, which the empty state below already covers.
  const { data: settings, error } = shop
    ? await supabase.from('shops').select('*').eq('id', shop.id).maybeSingle<ShopSettings>()
    : { data: null, error: null };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Business details and checkout options. These reach the mobile app without a new release."
      />

      {error || !settings ? (
        <p className="text-sm text-destructive">
          Failed to load settings{error ? `: ${error.message}` : '.'}
        </p>
      ) : (
        <SettingsForm settings={settings} />
      )}
    </div>
  );
}
