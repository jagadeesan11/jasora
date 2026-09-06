'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  ACCEPTED_LABEL,
  ACCEPTED_TYPES,
  MAX_SOURCE_BYTES,
  formatBytes,
  prepareImage,
} from '@/lib/prepare-image';
import { createClient } from '@/lib/supabase/client';

const BUCKET = 'service-images';
/** Kept apart from service photos so a shop's identity is not mixed in with
 *  its catalogue, and so it is obvious what may be deleted. Nested under the
 *  shop's id because the storage policy grants a shop its own first path
 *  segment — a bare 'brand/' is now writable only by a platform admin, which
 *  is exactly the upload this used to attempt. */
const FOLDER = 'brand';

/**
 * The shop logo, uploaded rather than pasted as a URL.
 *
 * Asking for a URL would mean the shop first has to host the file somewhere,
 * which is the whole problem this replaces. It goes into the existing public
 * image bucket; the column only accepts a URL from that storage, so a pasted
 * link to somewhere else would be refused by the database anyway.
 *
 * `prepareImage` resizes and compresses, the same as service photos. Its
 * aspect-ratio warning is deliberately ignored here — that advice is about
 * images the app crops to a wide card, and a logo is square by nature.
 */
export function ShopLogoField({
  value,
  onChange,
  shopId,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  shopId: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function upload(file: File) {
    setProblem(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setProblem(`That is not an accepted image. Allowed: ${ACCEPTED_LABEL}.`);
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setProblem(`That file is ${formatBytes(file.size)}, over the ${formatBytes(MAX_SOURCE_BYTES)} limit.`);
      return;
    }

    setBusy(true);
    try {
      const prepared = await prepareImage(file);
      const extension = prepared.file.type === 'image/png' ? 'png' : 'jpg';
      // Timestamped rather than a fixed name: the old file stays reachable
      // until it is replaced, and no CDN cache can serve yesterday's logo
      // under today's URL.
      const path = `${shopId}/${FOLDER}/logo-${Date.now()}.${extension}`;

      const supabase = createClient();
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, prepared.file, { contentType: prepared.file.type, upsert: true });

      if (error) {
        setProblem(error.message);
        return;
      }

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That image could not be prepared.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="shop-logo">Shop logo</Label>

      <div className="flex items-center gap-4">
        {/* `relative` is what `fill` positions against. Sized by the frame
            rather than by the image: with explicit width/height the border
            makes the content box 62px, flex-shrink takes the width to 62 while
            the height stays pinned at 64, and a non-square logo renders
            squashed — which is exactly what Next's aspect-ratio warning is
            for. `fill` has no dimensions to disagree about. */}
        <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {value ? (
            <Image
              src={value}
              alt="Shop logo"
              fill
              sizes="64px"
              unoptimized
              className="object-contain p-1"
            />
          ) : (
            <span className="text-xs text-muted-foreground">None</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            id="shop-logo"
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? 'Uploading…' : value ? 'Replace' : 'Upload logo'}
          </Button>
          {value ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => onChange(null)}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Shown in the app beside the shop name. Square works best. {ACCEPTED_LABEL}. Leave it empty
        to show the shop&rsquo;s initials instead.
      </p>

      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
    </div>
  );
}
