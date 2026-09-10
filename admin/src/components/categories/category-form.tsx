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
import type { Category, InputFieldType, InputTemplate, InputTemplateField } from '@/types/database';

const FIELD_TYPE_LABELS: Record<InputFieldType, string> = {
  text: 'Text',
  number: 'Number',
  select: 'Select',
};

interface FieldRow {
  key: string;
  name: string;
  label: string;
  type: InputFieldType;
  required: boolean;
  options: string;
  hint: string;
}

function newFieldRow(field?: InputTemplateField): FieldRow {
  return {
    key: crypto.randomUUID(),
    name: field?.name ?? '',
    label: field?.label ?? '',
    type: field?.type ?? 'text',
    required: field?.required ?? true,
    // One per line. A list of thirty vehicle makes is unreadable as one long
    // comma-separated line, and both separators parse on the way back in.
    options: field?.options?.join('\n') ?? '',
    hint: field?.hint ?? '',
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function CategoryForm({
  category,
  inputTemplate,
  shopId,
}: {
  category?: Category;
  inputTemplate?: InputTemplate;
  // Which shop a new category belongs to. Resolved on the server, where the
  // caller's memberships are, and passed down — a client component cannot
  // work it out for itself without trusting something the browser holds.
  shopId: string;
}) {
  const router = useRouter();
  const isEditing = Boolean(category);

  const [name, setName] = useState(category?.name ?? '');
  const [slug, setSlug] = useState(category?.slug ?? '');
  const [slugEdited, setSlugEdited] = useState(isEditing);
  const [icon, setIcon] = useState(category?.icon ?? '');
  const [fieldRows, setFieldRows] = useState<FieldRow[]>(
    (inputTemplate?.fields ?? []).map((f) => newFieldRow(f)),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateFieldRow(key: string, patch: Partial<FieldRow>) {
    setFieldRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const validRows = fieldRows.filter((r) => r.name && r.label);
    const fields: InputTemplateField[] = validRows.map((r) => ({
      name: r.name,
      label: r.label,
      type: r.type,
      required: r.required,
      ...(r.type === 'select'
        ? { options: r.options.split(/[,\n]/).map((o) => o.trim()).filter(Boolean) }
        : {}),
      ...(r.hint.trim() ? { hint: r.hint.trim() } : {}),
    }));

    setIsSubmitting(true);
    const supabase = createClient();

    let templateId = category?.input_template_id ?? inputTemplate?.id ?? null;

    if (fields.length > 0) {
      const templatePayload = { name: `${name} Input Template`, fields };
      if (templateId) {
        const { error: templateError } = await supabase
          .from('input_templates')
          .update(templatePayload)
          .eq('id', templateId);
        if (templateError) {
          setError(templateError.message);
          setIsSubmitting(false);
          return;
        }
      } else {
        const { data: newTemplate, error: templateError } = await supabase
          .from('input_templates')
          .insert({ ...templatePayload, shop_id: shopId })
          .select('id')
          .single();
        if (templateError || !newTemplate) {
          setError(templateError?.message ?? 'Failed to create input template.');
          setIsSubmitting(false);
          return;
        }
        templateId = newTemplate.id;
      }
    }

    const categoryPayload = {
      name,
      slug: slug || slugify(name),
      icon: icon || null,
      input_template_id: templateId,
    };

    if (isEditing && category) {
      const { error: updateError } = await supabase
        .from('categories')
        .update(categoryPayload)
        .eq('id', category.id);
      if (updateError) {
        setError(updateError.message);
        setIsSubmitting(false);
        return;
      }
    } else {
      const { error: insertError } = await supabase
        .from('categories')
        .insert({ ...categoryPayload, shop_id: shopId });
      if (insertError) {
        setError(insertError.message);
        setIsSubmitting(false);
        return;
      }
    }

    router.push('/categories');
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
          <Input
            id="name"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugEdited) setSlug(slugify(e.target.value));
            }}
          />
        </div>

        <div>
          <Label htmlFor="slug" className="mb-1.5">
            Slug
          </Label>
          <Input
            id="slug"
            required
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugEdited(true);
            }}
          />
        </div>

        <IconPicker
          value={icon || null}
          onChange={(next) => setIcon(next ?? '')}
          description="Shown on the category tile in the app. Without one, the app falls back to the first letter of the name."
        />
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Booking input fields</h2>
            <p className="text-xs text-muted-foreground">
              What a booking for this category needs to collect (e.g. vehicle
              make/model/registration/fuel/size). A select with eight or more options opens as a
              searchable list in the app rather than a row of chips.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFieldRows((prev) => [...prev, newFieldRow()])}
          >
            Add field
          </Button>
        </div>

        <div className="space-y-3">
          {fieldRows.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-[1fr_1fr_140px_auto_auto] items-center gap-2"
            >
              <Input
                placeholder="field name (e.g. vehicle_size)"
                value={row.name}
                onChange={(e) => updateFieldRow(row.key, { name: e.target.value })}
              />
              <Input
                placeholder="label (e.g. Vehicle Size)"
                value={row.label}
                onChange={(e) => updateFieldRow(row.key, { label: e.target.value })}
              />
              <Select
                value={row.type}
                onValueChange={(value) => value && updateFieldRow(row.key, { type: value as InputFieldType })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{(value: InputFieldType) => FIELD_TYPE_LABELS[value]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="select">Select</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch
                  checked={row.required}
                  onCheckedChange={(checked) => updateFieldRow(row.key, { required: checked })}
                />
                Required
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setFieldRows((prev) => prev.filter((r) => r.key !== row.key))}
              >
                Remove
              </Button>
              <Input
                className="col-span-5"
                placeholder="hint shown under the label (e.g. Model only — no variant or year)"
                value={row.hint}
                onChange={(e) => updateFieldRow(row.key, { hint: e.target.value })}
              />
              {row.type === 'select' && (
                <Textarea
                  className="col-span-5 min-h-24"
                  placeholder="options, one per line — hatchback, sedan, suv"
                  value={row.options}
                  onChange={(e) => updateFieldRow(row.key, { options: e.target.value })}
                />
              )}
            </div>
          ))}
          {fieldRows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No input fields — bookings for this category won&apos;t ask for anything extra.
            </p>
          )}
        </div>
      </section>

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Save changes' : 'Create category'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/categories')}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
