'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { savePlatformLegal } from '@/app/(dashboard)/shops/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * The legal documents every shop operates under.
 *
 * On the Shops screen rather than under Settings, because Settings edits
 * whichever shop is selected and these belong to none of them. The privacy
 * policy describes who holds customer data — the platform does, for every shop
 * — so there is one, and a shop only names its own where it genuinely differs.
 *
 * A shop onboarded without touching this still has a policy, which is the point:
 * the alternative was a new shop shipping with none and nothing saying so.
 */
export function PlatformLegalCard({
  privacyUrl,
  termsUrl,
}: {
  privacyUrl: string | null;
  termsUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <form
      className="mt-10 max-w-2xl space-y-4 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setMessage(null);
        startTransition(async () => {
          const result = await savePlatformLegal(fd);
          setMessage({ ok: result.ok, text: result.ok ? 'Saved.' : (result.message ?? 'That did not work.') });
          if (result.ok) router.refresh();
        });
      }}
    >
      <div>
        <h2 className="text-sm font-semibold">Platform legal documents</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          These apply to every shop. A shop can point at its own from its Settings, but does not
          have to — and until it does, these are what its customers see.
        </p>
      </div>

      <div>
        <Label htmlFor="privacy_url" className="mb-1.5">
          Privacy policy URL
        </Label>
        <Input id="privacy_url" name="privacy_url" defaultValue={privacyUrl ?? ''} type="url" />
        <p className="mt-1 text-xs text-muted-foreground">
          The same URL your app store listing uses. It has to be reachable without signing in.
        </p>
      </div>

      <div>
        <Label htmlFor="terms_url" className="mb-1.5">
          Terms of use URL
        </Label>
        <Input id="terms_url" name="terms_url" defaultValue={termsUrl ?? ''} type="url" />
        <p className="mt-1 text-xs text-muted-foreground">
          Terms for using the app itself. Cancellation, refunds and warranty are a matter between
          the customer and the shop, and belong in that shop&rsquo;s own terms.
        </p>
      </div>

      {message ? (
        <p className={message.ok ? 'text-sm text-primary' : 'text-sm text-destructive'}>
          {message.text}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
