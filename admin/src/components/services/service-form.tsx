'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { IconPicker } from '@/components/icon-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import type { Addon, Category, PricingRule, PricingType, Service } from '@/types/database';

import {
  imagesFromUrls,
  ServiceImageUploader,
  type ServiceImage,
} from './service-image-uploader';

const PRICING_TYPE_LABELS: Record<PricingType, string> = {
  fixed: 'Fixed',
  tiered: 'Tiered',
  per_unit: 'Per unit',
};

interface PricingRuleRow {
  key: string;
  id?: string;
  conditionKey: string;
  conditionValue: string;
  price: string;
}

interface AddonRow {
  key: string;
  id?: string;
  name: string;
  price: string;
  isMultiSelect: boolean;
}

function newPricingRuleRow(rule?: PricingRule): PricingRuleRow {
  const [conditionKey, conditionValue] = Object.entries(rule?.condition ?? {})[0] ?? ['', ''];
  return {
    key: crypto.randomUUID(),
    id: rule?.id,
    conditionKey,
    conditionValue: String(conditionValue ?? ''),
    price: rule ? String(rule.price) : '',
  };
}

function newAddonRow(addon?: Addon): AddonRow {
  return {
    key: crypto.randomUUID(),
    id: addon?.id,
    name: addon?.name ?? '',
    price: addon ? String(addon.price) : '',
    isMultiSelect: addon?.is_multi_select ?? true,
  };
}

export function ServiceForm({
  categories,
  service,
  pricingRules,
  addons,
}: {
  categories: Category[];
  service?: Service;
  pricingRules?: PricingRule[];
  addons?: Addon[];
}) {
  const router = useRouter();
  const isEditing = Boolean(service);

  const [name, setName] = useState(service?.name ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [categoryId, setCategoryId] = useState(service?.category_id ?? categories[0]?.id ?? '');
  const [basePrice, setBasePrice] = useState(service ? String(service.base_price) : '');
  const [pricingType, setPricingType] = useState<PricingType>(service?.pricing_type ?? 'fixed');
  const [durationMinutes, setDurationMinutes] = useState(
    service?.duration_minutes ? String(service.duration_minutes) : '',
  );
  const [isActive, setIsActive] = useState(service?.is_active ?? true);
  const [icon, setIcon] = useState<string | null>(service?.icon ?? null);
  const [ruleRows, setRuleRows] = useState<PricingRuleRow[]>(
    (pricingRules ?? []).map((r) => newPricingRuleRow(r)),
  );
  const [addonRows, setAddonRows] = useState<AddonRow[]>((addons ?? []).map((a) => newAddonRow(a)));
  const [images, setImages] = useState<ServiceImage[]>(imagesFromUrls(service?.images ?? []));
  const [folderId] = useState(() => service?.id ?? crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateRuleRow(key: string, patch: Partial<PricingRuleRow>) {
    setRuleRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function updateAddonRow(key: string, patch: Partial<AddonRow>) {
    setAddonRows((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!categoryId) {
      setError('Select a category.');
      return;
    }

    // A partly filled row used to be dropped on the way to the database and
    // the form then navigated away, so the row looked saved and was not. Say
    // so instead, before anything is written.
    const halfRule = ruleRows.find(
      (r) => (r.conditionKey || r.conditionValue || r.price !== '') && !(r.conditionKey && r.price !== ''),
    );
    if (halfRule) {
      setError('Every pricing rule needs a condition key and a price. Fill the row in, or remove it.');
      return;
    }

    const halfAddon = addonRows.find((x) => (x.name || x.price !== '') && !(x.name && x.price !== ''));
    if (halfAddon) {
      setError('Every add-on needs a name and a price. Fill the row in, or remove it.');
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    const servicePayload = {
      name,
      description: description || null,
      category_id: categoryId,
      base_price: Number(basePrice) || 0,
      pricing_type: pricingType,
      duration_minutes: durationMinutes ? Number(durationMinutes) : null,
      is_active: isActive,
      icon,
      images: images.map((i) => i.url),
    };

    let serviceId = service?.id;
    if (isEditing && serviceId) {
      const { error: updateError } = await supabase
        .from('services')
        .update(servicePayload)
        .eq('id', serviceId);
      if (updateError) {
        setError(updateError.message);
        setIsSubmitting(false);
        return;
      }
    } else {
      const { data, error: insertError } = await supabase
        .from('services')
        .insert(servicePayload)
        .select('id')
        .single();
      if (insertError || !data) {
        setError(insertError?.message ?? 'Failed to create service.');
        setIsSubmitting(false);
        return;
      }
      serviceId = data.id;
    }

    const reconcileError = await reconcileChildren(supabase, serviceId!, ruleRows, addonRows);
    if (reconcileError) {
      setError(reconcileError);
      setIsSubmitting(false);
      return;
    }

    router.push('/services');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-8">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <section className="space-y-4">
        <div>
          <Label htmlFor="name" className="mb-1.5">
            Name
          </Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        {/* Photos sit immediately above the icon, because the icon's whole
            purpose is to stand in until a photo exists. They used to be a
            hundred lines apart, past price and duration, so the icon hint
            pointed at something nobody could find. */}
        <div>
          <Label className="mb-1.5">Photos</Label>
          <p className="mb-2 text-xs text-muted-foreground">
            Shown to customers on the service page. The first one is the main image. A real photo of
            finished work sells this better than any icon — especially where several services differ
            only by warranty.
          </p>
          <ServiceImageUploader folderId={folderId} images={images} onChange={setImages} />
        </div>

        <IconPicker
          value={icon}
          onChange={setIcon}
          description="Only shown while this service has no photos. Add one above and the icon disappears."
        />

        <div>
          <Label htmlFor="description" className="mb-1.5">
            Description
          </Label>
          <Textarea
            id="description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="mb-1.5">Category</Label>
            <Select
              value={categoryId}
              onValueChange={(value) => value && setCategoryId(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a category">
                  {(value: string) => categories.find((c) => c.id === value)?.name ?? ''}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5">Pricing type</Label>
            <Select
              value={pricingType}
              onValueChange={(value) => value && setPricingType(value as PricingType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{(value: PricingType) => PRICING_TYPE_LABELS[value]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed</SelectItem>
                <SelectItem value="tiered">Tiered</SelectItem>
                <SelectItem value="per_unit">Per unit</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="base_price" className="mb-1.5">
              Base price (₹)
            </Label>
            <Input
              id="base_price"
              type="number"
              min="0"
              step="1"
              required
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="duration_minutes" className="mb-1.5">
              Duration (minutes)
            </Label>
            <Input
              id="duration_minutes"
              type="number"
              min="0"
              step="1"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch id="is_active" checked={isActive} onCheckedChange={setIsActive} />
          <Label htmlFor="is_active">Active (visible to customers)</Label>
        </div>
      </section>


      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Pricing rules</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRuleRows((prev) => [...prev, newPricingRuleRow()])}
          >
            Add rule
          </Button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Each rule overrides the base price when a condition matches, e.g. vehicle_size = suv.
        </p>
        {/* Pricing rules are read only for tiered pricing — compute_booking_price
            uses base_price directly for every other type. Saying so here stops
            someone filling in rules that save correctly and then never apply,
            which looks exactly like the rules not saving. */}
        {pricingType !== 'tiered' ? (
          <p className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            Pricing is set to <strong>{PRICING_TYPE_LABELS[pricingType] ?? pricingType}</strong>, so
            these rules are stored but never used — the base price is charged. Switch pricing to
            Tiered for them to take effect.
          </p>
        ) : null}
        <div className="space-y-2">
          {ruleRows.map((row) => (
            <div key={row.key} className="grid grid-cols-[1fr_1fr_120px_auto] items-center gap-2">
              <Input
                placeholder="condition key (e.g. vehicle_size)"
                value={row.conditionKey}
                onChange={(e) => updateRuleRow(row.key, { conditionKey: e.target.value })}
              />
              <Input
                placeholder="condition value (e.g. suv)"
                value={row.conditionValue}
                onChange={(e) => updateRuleRow(row.key, { conditionValue: e.target.value })}
              />
              <Input
                type="number"
                min="0"
                placeholder="price"
                value={row.price}
                onChange={(e) => updateRuleRow(row.key, { price: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setRuleRows((prev) => prev.filter((r) => r.key !== row.key))}
              >
                Remove
              </Button>
            </div>
          ))}
          {ruleRows.length === 0 && (
            <p className="text-sm text-muted-foreground">No pricing rules yet.</p>
          )}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Addons</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAddonRows((prev) => [...prev, newAddonRow()])}
          >
            Add addon
          </Button>
        </div>
        <div className="space-y-2">
          {addonRows.map((row) => (
            <div key={row.key} className="grid grid-cols-[1fr_120px_auto_auto] items-center gap-2">
              <Input
                placeholder="Addon name"
                value={row.name}
                onChange={(e) => updateAddonRow(row.key, { name: e.target.value })}
              />
              <Input
                type="number"
                min="0"
                placeholder="price"
                value={row.price}
                onChange={(e) => updateAddonRow(row.key, { price: e.target.value })}
              />
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch
                  checked={row.isMultiSelect}
                  onCheckedChange={(checked) => updateAddonRow(row.key, { isMultiSelect: checked })}
                />
                Multi-select
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setAddonRows((prev) => prev.filter((a) => a.key !== row.key))}
              >
                Remove
              </Button>
            </div>
          ))}
          {addonRows.length === 0 && <p className="text-sm text-muted-foreground">No addons yet.</p>}
        </div>
      </section>

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Save changes' : 'Create service'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/services')}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

async function reconcileChildren(
  supabase: ReturnType<typeof createClient>,
  serviceId: string,
  ruleRows: PricingRuleRow[],
  addonRows: AddonRow[],
): Promise<string | null> {
  const validRules = ruleRows.filter((r) => r.conditionKey && r.price !== '');
  const validAddons = addonRows.filter((a) => a.name && a.price !== '');

  const { error: rulesDeleteError } = await supabase
    .from('pricing_rules')
    .delete()
    .eq('service_id', serviceId)
    .not(
      'id',
      'in',
      `(${validRules.map((r) => r.id).filter(Boolean).join(',') || '00000000-0000-0000-0000-000000000000'})`,
    );
  if (rulesDeleteError) return rulesDeleteError.message;

  for (const rule of validRules) {
    const payload = {
      service_id: serviceId,
      condition: { [rule.conditionKey]: rule.conditionValue },
      price: Number(rule.price),
    };
    const { error: upsertError } = rule.id
      ? await supabase.from('pricing_rules').update(payload).eq('id', rule.id)
      : await supabase.from('pricing_rules').insert(payload);
    if (upsertError) return upsertError.message;
  }

  const { error: addonsDeleteError } = await supabase
    .from('addons')
    .delete()
    .eq('service_id', serviceId)
    .not(
      'id',
      'in',
      `(${validAddons.map((a) => a.id).filter(Boolean).join(',') || '00000000-0000-0000-0000-000000000000'})`,
    );
  if (addonsDeleteError) return addonsDeleteError.message;

  for (const addon of validAddons) {
    const payload = {
      service_id: serviceId,
      name: addon.name,
      price: Number(addon.price),
      is_multi_select: addon.isMultiSelect,
    };
    const { error: upsertError } = addon.id
      ? await supabase.from('addons').update(payload).eq('id', addon.id)
      : await supabase.from('addons').insert(payload);
    if (upsertError) return upsertError.message;
  }

  return null;
}
