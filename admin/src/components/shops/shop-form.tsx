'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { createShop } from '@/app/(dashboard)/shops/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

/**
 * Suggests an invoice prefix from the name: initials first, then the leading
 * letters, so "Moto Ceramic" gives MC and "Nexora" gives NEXORA.
 *
 * A suggestion rather than a rule, because this ends up on every printed bill
 * and the person naming it may well want something else. It exists so nobody
 * has to guess the format from a validation error.
 */
function suggestPrefix(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words
    .map((w) => w[0])
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();

  const candidate = initials.length >= 2 ? initials : name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return candidate.slice(0, 8);
}

export function ShopForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [prefix, setPrefix] = useState('');
  const [prefixEdited, setPrefixEdited] = useState(false);

  // Both derive from the name until someone types in them, at which point they
  // stop moving. Silently rewriting a field a person has edited is worse than
  // not helping at all.
  function onNameChange(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
    if (!prefixEdited) setPrefix(suggestPrefix(value));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const fd = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await createShop(fd);
      if (!result.ok) {
        setError(result.message ?? 'That did not work.');
        return;
      }
      router.push('/shops');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-6">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div>
        <Label htmlFor="name" className="mb-1.5">
          Shop name
        </Label>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Moto Ceramic — Puducherry"
          required
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Shown in the app wherever the shop&rsquo;s name appears.
        </p>
      </div>

      <div>
        <Label htmlFor="slug" className="mb-1.5">
          Web address
        </Label>
        <Input
          id="slug"
          name="slug"
          value={slug}
          onChange={(e) => {
            setSlugEdited(true);
            setSlug(e.target.value);
          }}
          placeholder="moto-ceramic"
          required
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Lower case letters, numbers and hyphens. Used in links and file paths, so it does not
          change once bookings exist.
        </p>
      </div>

      <div>
        <Label htmlFor="invoice_prefix" className="mb-1.5">
          Invoice prefix
        </Label>
        <Input
          id="invoice_prefix"
          name="invoice_prefix"
          value={prefix}
          onChange={(e) => {
            setPrefixEdited(true);
            setPrefix(e.target.value.toUpperCase());
          }}
          placeholder="MC"
          required
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Starts every bill this shop issues — {prefix || 'MC'}/2026-27/0001. Two to eight letters
          or numbers, starting with a letter, and unique across all shops: once bills are printed
          and filed, this is the only thing telling two shops&rsquo; apart.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="city" className="mb-1.5">
            City <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input id="city" name="city" placeholder="Pondicherry" />
        </div>
        <div>
          <Label htmlFor="support_phone" className="mb-1.5">
            Support phone <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input id="support_phone" name="support_phone" placeholder="+919787045679" />
        </div>
      </div>

      <div>
        <Label htmlFor="support_email" className="mb-1.5">
          Support email <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input id="support_email" name="support_email" type="email" />
      </div>

      <p className="text-xs text-muted-foreground">
        The logo, address, payment methods and legal links are set under Settings once you switch
        to the new shop. It opens Monday to Saturday 9am&ndash;8pm and Sunday 10am&ndash;2pm until
        somebody changes that under Hours.
      </p>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create shop'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
