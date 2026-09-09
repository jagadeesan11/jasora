/**
 * Regenerates every launcher/splash asset from one source of truth:
 * mobile/assets/brand/jasora-logo-source.png — the stacked JASORA lockup.
 *
 * Run it whenever the logo changes:
 *   node scripts/generate-icons.mjs
 *
 * Needs `sharp`, which is resolved from whichever workspace already has it.
 *
 * ---------------------------------------------------------------------------
 * The one decision this file encodes
 *
 * The lockup is a pin above the word JASORA above a tagline. All three belong
 * on the splash, where there is room to read them. Only the pin belongs on the
 * launcher icon: at 48dp the word is about four pixels tall and the tagline is
 * finer than a pixel, so shipping the whole lockup as the icon turns a good
 * logo into a smudge. So the pin is lifted and set on the wordmark's own navy,
 * and the lockup is used whole for the splash.
 *
 * Lifting the pin is the easy half — nothing else in the artwork is warm, so
 * one hue ramp separates it, keeps its anti-aliased edge, and leaves the
 * knocked-out centre transparent without any special handling. The navy drop
 * shadow under it fails the same ramp, which is what we want: a shadow drawn
 * for a light ground would be invisible on a dark one.
 *
 * Store rules this encodes, so they are not rediscovered by rejection:
 *  - icon.png must be fully opaque with square corners; the stores apply their
 *    own mask. It is composited on a solid ground rather than cropped out of
 *    the artwork, whose card has rounded corners of its own.
 *  - The adaptive foreground is cropped hard — a circular mask keeps only the
 *    central ~61%. checkSafeZone() below fails the build if the pin overflows.
 *  - The monochrome layer must be a single flat colour on transparency;
 *    Android recolours it for themed icons and ignores whatever hue is there.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ESM import() ignores NODE_PATH, so resolve through CJS require, which does
// walk node_modules from the paths we give it.
const require = createRequire(import.meta.url);
let sharp;
for (const base of [ROOT, join(ROOT, 'mobile'), join(ROOT, 'admin')]) {
  try {
    sharp = require(require.resolve('sharp', { paths: [base] }));
    break;
  } catch {
    /* try the next workspace */
  }
}
if (!sharp) {
  console.error('sharp not found in any workspace. Install it:\n  npm i -D sharp');
  process.exit(1);
}

const SRC = join(ROOT, 'mobile', 'assets', 'brand', 'jasora-logo-source.png');
const OUT = join(ROOT, 'mobile', 'assets', 'images');
const ADMIN_APP = join(ROOT, 'admin', 'src', 'app');
const ADMIN_PUBLIC = join(ROOT, 'admin', 'public');

/**
 * How orange a pixel is, 0..1. Red-minus-blue rather than a hue conversion
 * because it is monotonic across the pin's whole gradient and lands on zero
 * for every other thing in the artwork: the card ground, the navy letters, the
 * shadow ellipse and the pin's own knocked-out centre all read cool or neutral.
 * Used as alpha directly, so the pin keeps the edge the artwork drew.
 */
const orangeness = ([r, , b]) => Math.min(1, Math.max(0, (r - b - 20) / 60));

/** Ink, for finding the lockup's bands: anything that is not the card ground. */
const INK_DISTANCE = 55;

/** Stay this far inside the card, clear of its rounded edge and its shadow. */
const CARD_MARGIN = 40;

/**
 * How much of the icon's height the pin fills.
 *
 * The launcher one is not a taste decision — the mask may be a circle, and
 * only a circle inscribed in the middle 61% of the canvas is guaranteed to
 * survive. checkSafeZone() fails the build if this is raised too far; 0.60 is
 * the most this pin allows, measured, and 0.62 already clips.
 *
 * The two land on the same number here, which is luck rather than design: a
 * teardrop wastes most of its bounding box, so it fits a circle far better
 * than a square mark of the same height would. They stay separate constants
 * because a different mark would part them immediately.
 */
const FOREGROUND_FRACTION = 0.6;
const ICON_FRACTION = 0.6;

/**
 * Encoding. Passing `effort` to sharp's PNG encoder implicitly turns on
 * palette quantisation — it is NOT lossless, whatever the name suggests. For
 * this artwork that is nearly free: flat navy and one orange ramp sit inside
 * 256 colours comfortably. icon.png still keeps full colour, because it is the
 * master the stores re-encode every launcher density from.
 */
const PNG_DERIVED = { compressionLevel: 9, effort: 10 };
const PNG_MASTER = { compressionLevel: 9 };

// ------------------------------------------------------------------ source

const { data: PX, info: INFO } = await sharp(SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const W = INFO.width;
const H = INFO.height;
const at = (x, y) => {
  const s = (y * W + x) * INFO.channels;
  return [PX[s], PX[s + 1], PX[s + 2], PX[s + 3]];
};
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** The card's flat ground, read just inside its top edge. */
const GROUND = at(W >> 1, CARD_MARGIN + 5).slice(0, 3);
const isInk = (p) =>
  Math.abs(p[0] - GROUND[0]) + Math.abs(p[1] - GROUND[1]) + Math.abs(p[2] - GROUND[2]) >
  INK_DISTANCE;

/**
 * The lockup's horizontal bands. Measured rather than hardcoded so a re-export
 * at another size still works — hardcoded fractions are what tie a generator
 * to one particular PNG.
 *
 * Rows are required to carry more than a couple of ink pixels before they
 * count, which drops the card's own anti-aliased edge without needing to know
 * where that edge is.
 */
function bands() {
  const x0 = CARD_MARGIN;
  const x1 = W - CARD_MARGIN;
  const found = [];
  let run = null;
  for (let y = CARD_MARGIN; y < H - CARD_MARGIN; y += 1) {
    let n = 0;
    for (let x = x0; x < x1; x += 1) if (isInk(at(x, y))) n += 1;
    if (n > 2 && !run) run = { top: y, bottom: y, ink: n };
    else if (n > 2) {
      run.bottom = y;
      run.ink += n;
    } else if (run) {
      found.push(run);
      run = null;
    }
  }
  if (run) found.push(run);

  return found.map((b) => {
    let left = W;
    let right = -1;
    for (let y = b.top; y <= b.bottom; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        if (!isInk(at(x, y))) continue;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    const width = right - left + 1;
    const height = b.bottom - b.top + 1;
    return { left, top: b.top, width, height, ink: b.ink, fill: b.ink / (width * height) };
  });
}

/**
 * The three bands that are the logo, as opposed to the card's own edges.
 *
 * Picked by density, not by ink volume or position. The card's rounded top and
 * bottom sweep the full width of the image, so they accumulate as much ink as
 * a line of type — enough to pass any threshold on the total, which silently
 * shifts every band assignment by one and crops the splash to the wrong thing.
 * What actually separates them is that an edge is a hairline through a tall
 * box while artwork fills its box: the edges come in under 7% and nothing in
 * the lockup is below 35%.
 *
 * The faint sparkle in the bottom-right corner — a generation artefact, not
 * part of the design — falls out here too, and everything below the tagline is
 * cropped away.
 */
const BANDS = bands()
  .filter((b) => b.fill > 0.15 && b.ink > 2000)
  .sort((a, b) => a.top - b.top);

if (BANDS.length < 3) {
  console.error(
    `Expected pin, wordmark and tagline bands; found ${BANDS.length}.\n` +
      'Is the source still the stacked JASORA lockup?',
  );
  process.exit(1);
}
const [PIN_BAND, WORDMARK, TAGLINE] = BANDS;

// ------------------------------------------------------------------- colours

/** The pin's own bounds. Tighter than its band, which includes the shadow. */
function pinBounds() {
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (orangeness(at(x, y)) < 0.5) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

const PIN = pinBounds();

/**
 * The brand's two colours, taken off the artwork rather than declared here.
 *
 * The navy is the most common deep tone in the wordmark — the mode, not the
 * mean, because a mean over a band of antialiased letterforms lands on a
 * washed-out blend of ink and ground that appears nowhere in the logo.
 */
function inkColour(band) {
  const counts = new Map();
  for (let y = band.top; y <= band.top + band.height; y += 1) {
    for (let x = band.left; x <= band.left + band.width; x += 1) {
      const p = at(x, y);
      if (Math.max(p[0], p[1], p[2]) > 80) continue;
      const k = (p[0] << 16) | (p[1] << 8) | p[2];
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  let best = 0;
  let key = 0;
  for (const [k, n] of counts) {
    if (n > best) {
      best = n;
      key = k;
    }
  }
  return [(key >> 16) & 255, (key >> 8) & 255, key & 255];
}

const NAVY = inkColour(WORDMARK);

// ---------------------------------------------------------------- the pin

/** The pin on transparency, trimmed to its own bounds, alpha from its hue. */
function pinLayer({ flat = false } = {}) {
  const { left, top, width, height } = PIN;
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = at(left + x, top + y);
      const d = (y * width + x) * 4;
      const a = Math.round(orangeness(p) * 255);
      out[d] = flat ? 255 : p[0];
      out[d + 1] = flat ? 255 : p[1];
      out[d + 2] = flat ? 255 : p[2];
      out[d + 3] = a;
    }
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

const PIN_COLOUR = await pinLayer();
const PIN_FLAT = await pinLayer({ flat: true });

/** Centre something on a transparent square, at a given share of the height. */
async function onCanvas(input, { size, fraction }) {
  const box = Math.round(size * fraction);
  const scaled = await sharp(input)
    .resize(null, box, { fit: 'inside' })
    .png()
    .toBuffer();
  const m = await sharp(scaled).metadata();
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: scaled,
        left: Math.round((size - m.width) / 2),
        top: Math.round((size - m.height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

async function solid(size, colour) {
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r: colour[0], g: colour[1], b: colour[2] } },
  })
    .png()
    .toBuffer();
}

/** The master icon: the pin on the wordmark's navy, opaque, square corners. */
async function buildIconMaster(size) {
  return sharp(await solid(size, NAVY))
    .composite([{ input: await onCanvas(PIN_COLOUR, { size, fraction: ICON_FRACTION }) }])
    .removeAlpha()
    .png()
    .toBuffer();
}

// Built once at full size; every other size is a resize of it, so the favicon,
// the admin tab icon and the .ico cannot drift from the launcher icon.
const ICON_MASTER = await buildIconMaster(1024);

async function squareIcon(size) {
  if (size === 1024) return ICON_MASTER;
  return sharp(ICON_MASTER).resize(size, size).removeAlpha().png().toBuffer();
}

/**
 * The splash: the whole lockup, on the card's own ground.
 *
 * Kept opaque rather than keyed onto transparency. The letterforms are
 * antialiased against this exact grey, and lifting them off it leaves a pale
 * fringe on every edge; matching app.json's splash backgroundColor to the same
 * grey makes the join seamless instead. Cropped to the tagline's baseline, so
 * the sparkle artefact below it never ships.
 */
async function splash() {
  const pad = 30;
  const left = Math.max(0, Math.min(PIN.left, WORDMARK.left) - pad);
  const right = Math.min(W, Math.max(PIN.left + PIN.width, WORDMARK.left + WORDMARK.width) + pad);
  const top = Math.max(0, PIN_BAND.top - pad);
  const bottom = Math.min(H, TAGLINE.top + TAGLINE.height + pad);
  return sharp(SRC)
    .extract({ left, top, width: right - left, height: bottom - top })
    .removeAlpha()
    .png()
    .toBuffer();
}

// ------------------------------------------------------------------ checks

/**
 * Does the mark survive a circular launcher mask?
 *
 * Android guarantees only a circle inscribed in the middle 66/108 of the
 * adaptive canvas. Rather than trust the arithmetic, mask the real foreground
 * and count how many of its pixels fall outside that circle.
 */
async function checkSafeZone(foreground) {
  const { data, info } = await sharp(foreground)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const centre = info.width / 2;
  const radius = (info.width * 66) / 108 / 2;
  let total = 0;
  let clipped = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] < 128) continue;
      total += 1;
      if (Math.hypot(x - centre, y - centre) > radius) clipped += 1;
    }
  }
  return { total, clipped, pct: total ? (clipped / total) * 100 : 0 };
}

// ------------------------------------------------------------------- output

mkdirSync(OUT, { recursive: true });

const foreground = await onCanvas(PIN_COLOUR, { size: 1024, fraction: FOREGROUND_FRACTION });

const assets = [
  ['icon.png', ICON_MASTER, 'iOS + store listing. Opaque, square corners.'],
  ['android-icon-background.png', await solid(1024, NAVY), `Adaptive background: flat ${hex(NAVY)}.`],
  ['android-icon-foreground.png', foreground, 'Adaptive foreground: the pin.'],
  [
    'android-icon-monochrome.png',
    await onCanvas(PIN_FLAT, { size: 1024, fraction: FOREGROUND_FRACTION }),
    'Themed-icon layer: flat white, centre still knocked out.',
  ],
  ['splash-icon.png', await splash(), 'Splash: the whole lockup on its own ground.'],
  ['favicon.png', await squareIcon(64), 'Web favicon: the pin, legible at 64px.'],
];

for (const [file, buf, note] of assets) {
  const encoded = await sharp(buf)
    .png(file === 'icon.png' ? PNG_MASTER : PNG_DERIVED)
    .toBuffer();
  writeFileSync(join(OUT, file), encoded);

  const info = await sharp(encoded).metadata();
  const kb = `${Math.round(encoded.length / 1024)}KB`;
  console.log(
    `${file.padEnd(30)} ${info.width}x${info.height}  alpha=${info.hasAlpha}  ${kb.padStart(7)}  ${note}`,
  );
  if (file === 'icon.png' && info.hasAlpha) {
    console.error('  !! icon.png kept an alpha channel — stores reject transparent icons.');
    process.exitCode = 1;
  }
}

// admin panel favicon -------------------------------------------------------
// Generated from the same artwork so the browser tab, the launcher and the
// sidebar agree. The previous icon.svg is removed: the source is a raster now,
// and Next.js prefers icon.svg over everything else if it is left behind.

rmSync(join(ADMIN_APP, 'icon.svg'), { force: true });
writeFileSync(
  join(ADMIN_APP, 'icon.png'),
  await sharp(await squareIcon(256)).png(PNG_DERIVED).toBuffer(),
);
console.log('\nadmin/src/app/icon.png          256x256  tab icon');

// The sidebar lockup: the same tile as the tab icon, so the two agree. It
// carries its own ground rather than sitting on transparency, because the pin
// is orange on navy and would strand on the admin's light theme.
//
// Imported by name from admin/src/components/jasora-mark.tsx, so the filename
// here and the src there move together or the sidebar shows a broken image.
mkdirSync(ADMIN_PUBLIC, { recursive: true });
writeFileSync(
  join(ADMIN_PUBLIC, 'jasora-mark.png'),
  await sharp(await squareIcon(256)).png(PNG_DERIVED).toBuffer(),
);
console.log('admin/public/jasora-mark.png    256x256  sidebar lockup');

/**
 * Build a real multi-size .ico. Safari's SVG-favicon support is patchy and
 * some tooling still asks for favicon.ico by path, so both are shipped.
 * The format is a small header plus one directory entry per image; PNG
 * payloads inside an ICO are understood by every browser still in use.
 */
async function buildIco(sizes) {
  // ensureAlpha + palette:false are load-bearing. Next.js parses this file at
  // build time and its ICO decoder rejects anything that is not 8-bit RGBA
  // ("The PNG is not in RGBA format!"), which takes the whole admin app down
  // with a 500. removeAlpha() alone yields 3-channel RGB, and sharp will
  // happily emit a palette PNG for artwork this simple.
  const pngs = await Promise.all(
    sizes.map(async (size) =>
      sharp(await squareIcon(size))
        .ensureAlpha()
        .png({ ...PNG_MASTER, palette: false })
        .toBuffer(),
    ),
  );

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(sizes.length, 4);

  let offset = 6 + sizes.length * 16;
  const entries = sizes.map((size, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette count
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(pngs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...pngs]);
}

const ico = await buildIco([16, 32, 48]);
writeFileSync(join(ADMIN_APP, 'favicon.ico'), ico);
console.log(`admin/src/app/favicon.ico       16/32/48  ${ico.length} bytes`);

// ------------------------------------------------------------------- report

const safe = await checkSafeZone(foreground);
console.log(
  `\nLockup ${W}x${H} on ${hex(GROUND)}.` +
    `\nBands: pin ${PIN_BAND.width}x${PIN_BAND.height}, wordmark ${WORDMARK.width}x${WORDMARK.height}, ` +
    `tagline ${TAGLINE.width}x${TAGLINE.height}.` +
    `\nPin ${PIN.width}x${PIN.height} at (${PIN.left},${PIN.top}). Navy ${hex(NAVY)}.` +
    `\nSafe zone: ${safe.pct.toFixed(2)}% of the foreground falls outside the guaranteed circle.` +
    `\n\napp.json should carry splash backgroundColor ${hex(GROUND)} and adaptiveIcon ${hex(NAVY)}.`,
);
if (safe.pct > 0.05) {
  console.error(
    `  !! The launcher's circular mask would clip the pin. Lower FOREGROUND_FRACTION\n` +
      `     (currently ${FOREGROUND_FRACTION}) until this is 0.`,
  );
  process.exitCode = 1;
}
console.log('\nDone. Rebuild the app for these to reach a device.');
