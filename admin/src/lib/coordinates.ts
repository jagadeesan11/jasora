/**
 * Turning what an owner pastes into a latitude and longitude.
 *
 * Asking for two decimal numbers gets you two empty fields: nobody knows their
 * own coordinates. What they can do is find their unit on Google Maps, and
 * Maps will hand over coordinates in several shapes depending on how they got
 * there. This accepts all of them, so the instruction can be "paste it" rather
 * than "paste it, but only this kind".
 *
 * Deliberately no network call. Geocoding an address needs a paid key and gets
 * Indian addresses wrong in exactly the way that matters — "opp. to Bharathi
 * Mill Road" lands on the main road, not the unit down the lane. The owner
 * dropping a pin is both cheaper and more accurate.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type ParseResult =
  | { ok: true; value: Coordinates }
  | { ok: false; reason: string };

/** A shortened share link carries no coordinates — it is only a redirect. */
const SHORT_LINK = /(maps\.app\.goo\.gl|goo\.gl\/maps)/i;

const PATTERNS = [
  // A bare pair, which is what Maps copies when you tap the coordinates.
  /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/,
  // The map's own centre: /maps/@11.9416,79.8083,17z
  /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
  // The pinned place inside the data blob, which is the exact spot rather than
  // wherever the viewport happened to be: !3d<lat>!4d<lng>
  /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/,
  // ?q=11.9416,79.8083 and &query=11.9416,79.8083
  /[?&](?:q|query|ll|daddr)=(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
];

export function parseCoordinates(input: string): ParseResult {
  const text = input.trim();
  if (!text) return { ok: false, reason: 'Paste a Google Maps link or a pair of coordinates.' };

  if (SHORT_LINK.test(text)) {
    return {
      ok: false,
      reason:
        'A shortened Maps link has no coordinates in it. Open it, then copy the address bar — or long-press your shop on the map and copy the numbers it shows.',
    };
  }

  for (const pattern of PATTERNS) {
    // The place pattern is checked after the viewport one but wins when both
    // match, because !3d/!4d is the pin and @ is only where the map was looking.
    const match = text.match(pattern);
    if (!match) continue;

    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (latitude < -90 || latitude > 90) {
      return { ok: false, reason: 'That latitude is outside -90 to 90 — are the two numbers swapped?' };
    }
    if (longitude < -180 || longitude > 180) {
      return { ok: false, reason: 'That longitude is outside -180 to 180.' };
    }

    return { ok: true, value: { latitude, longitude } };
  }

  return {
    ok: false,
    reason: 'No coordinates in that. Long-press your shop on Google Maps and copy the numbers it shows.',
  };
}

/**
 * Preferring the pinned place over the viewport when a URL carries both.
 *
 * A Maps place URL has @lat,lng for where the map was centred and !3d/!4d for
 * the pin itself. They differ by however far the person had scrolled, which on
 * a zoomed-out map is kilometres.
 */
export function parseMapsUrl(input: string): ParseResult {
  const place = input.match(/!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/);
  if (place) return parseCoordinates(`${place[1]},${place[2]}`);
  return parseCoordinates(input);
}
