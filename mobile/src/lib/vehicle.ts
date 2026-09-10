/**
 * Reading a vehicle out of a customer asset's free-form attributes.
 *
 * The keys are `vehicle_make`, `vehicle_model`, `vehicle_registration`,
 * `vehicle_fuel` and `vehicle_size`. Two screens
 * had been reaching for `make` and `model`, which do not exist — so both came
 * back undefined and the label quietly fell through to the only key that did
 * match, printing the size where the vehicle should be. It looked like a
 * mapping bug rather than a missing field, because "SUV" is a plausible answer
 * to "which vehicle".
 *
 * Centralised here so the key names are written once.
 */

export type VehicleAttributes = Record<string, string> | null | undefined;

/** Sizes are stored lowercase; only this one is an initialism. */
const SIZE_LABELS: Record<string, string> = {
  suv: 'SUV',
  muv: 'MUV',
};

/** Same again for fuels, for the assets booked before the field was a list. */
const FUEL_LABELS: Record<string, string> = {
  cng: 'CNG',
  ev: 'Electric',
  lpg: 'LPG',
};

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * "Maruti Suzuki Baleno". Make and model only — the size is a separate field
 * and repeating it here is what produced "Maruti Suzuki Baleno SUV" beside a
 * column already headed Size.
 */
export function vehicleLabel(attrs: VehicleAttributes): string | null {
  const parts = [attrs?.vehicle_make, attrs?.vehicle_model]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p));

  if (parts.length === 0) return null;
  // Left alone. Makes come from a list now and are already spelled the way the
  // manufacturer spells them, and the ones booked before that list existed were
  // typed by hand as "tata" or "KIA" — title-casing those would turn a genuine
  // initialism into "Kia" and still not agree with the list.
  return parts.join(' ');
}

/**
 * "TN09AB1234". Upper-cased because a number plate is, however it was typed,
 * and a shop scanning a list of jobs should not have to read two spellings of
 * the same registration.
 */
export function vehicleRegistration(attrs: VehicleAttributes): string | null {
  const raw = attrs?.vehicle_registration?.trim();
  if (!raw) return null;
  return raw.toUpperCase();
}

/** "Petrol", "CNG", "Electric". Null when nobody recorded one. */
export function vehicleFuel(attrs: VehicleAttributes): string | null {
  const raw = attrs?.vehicle_fuel?.trim();
  if (!raw) return null;
  return FUEL_LABELS[raw.toLowerCase()] ?? titleCase(raw);
}

/** "SUV", "Sedan", "Hatchback". Null when nobody recorded one. */
export function vehicleSize(attrs: VehicleAttributes): string | null {
  const raw = attrs?.vehicle_size?.trim();
  if (!raw) return null;
  return SIZE_LABELS[raw.toLowerCase()] ?? titleCase(raw);
}
