'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { createClient } from '@/lib/supabase/client';
import type { Category, Technician } from '@/types/database';

export function TechnicianForm({
  technician,
  categories,
  shopId,
}: {
  technician?: Technician;
  categories: Category[];
  shopId: string;
}) {
  const router = useRouter();
  const isEditing = Boolean(technician);

  const [name, setName] = useState(technician?.name ?? '');
  const [phone, setPhone] = useState(technician?.phone ?? '');
  const [isActive, setIsActive] = useState(technician?.status !== 'inactive');
  const [categoryIds, setCategoryIds] = useState<string[]>(technician?.category_ids ?? []);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleCategory(categoryId: string) {
    setCategoryIds((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId],
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const supabase = createClient();
    const payload = {
      name,
      phone: phone || null,
      status: isActive ? 'active' : 'inactive',
      category_ids: categoryIds,
    };

    const { error: saveError } =
      isEditing && technician
        ? await supabase.from('technicians').update(payload).eq('id', technician.id)
        : // shop_id on the insert only — an edit must not move someone to
          // another shop.
          await supabase.from('technicians').insert({ ...payload, shop_id: shopId });

    setIsSubmitting(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }

    router.push('/technicians');
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

        <div>
          <Label htmlFor="phone" className="mb-1.5">
            Phone
          </Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
        </div>

        <div className="flex items-center gap-2">
          <Switch id="is_active" checked={isActive} onCheckedChange={setIsActive} />
          <Label htmlFor="is_active">Active (assignable to bookings)</Label>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Categories</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Which categories this technician can be assigned bookings from.
        </p>
        <div className="space-y-2">
          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          )}
          {categories.map((category) => (
            <label key={category.id} className="flex items-center gap-2 text-sm">
              <Switch
                checked={categoryIds.includes(category.id)}
                onCheckedChange={() => toggleCategory(category.id)}
              />
              {category.name}
            </label>
          ))}
        </div>
      </section>

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Save changes' : 'Create technician'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/technicians')}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
