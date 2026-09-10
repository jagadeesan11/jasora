import { vehicleFuel, vehicleLabel, vehicleRegistration, vehicleSize } from '@/lib/vehicle';

// Exactly as the rows are stored in customer_assets.
const REAL = { vehicle_make: 'Maruti Suzuki', vehicle_size: 'suv', vehicle_model: 'Baleno' };

describe('vehicleLabel', () => {
  it('reads the real key names', () => {
    expect(vehicleLabel(REAL)).toBe('Maruti Suzuki Baleno');
  });

  it('never falls back to the size — the bug this replaces', () => {
    // Make and model missing. The old code joined whatever was left, so the
    // "Vehicle" field printed "suv".
    expect(vehicleLabel({ vehicle_size: 'suv' })).toBeNull();
  });

  it('ignores the legacy `make`/`model` keys, which were never stored', () => {
    expect(vehicleLabel({ make: 'Tata', model: 'Seirra' })).toBeNull();
  });

  it('copes with only one half recorded', () => {
    expect(vehicleLabel({ vehicle_make: 'Tata' })).toBe('Tata');
    expect(vehicleLabel({ vehicle_model: 'XUV700' })).toBe('XUV700');
  });

  it('leaves the make as typed, so KIA does not become Kia', () => {
    expect(vehicleLabel({ vehicle_make: 'KIA', vehicle_model: 'test' })).toBe('KIA test');
  });

  it('returns null rather than an empty string for nothing at all', () => {
    expect(vehicleLabel({})).toBeNull();
    expect(vehicleLabel(null)).toBeNull();
    expect(vehicleLabel(undefined)).toBeNull();
    expect(vehicleLabel({ vehicle_make: '   ' })).toBeNull();
  });
});

describe('vehicleSize', () => {
  it('keeps initialisms upper case', () => {
    expect(vehicleSize(REAL)).toBe('SUV');
    expect(vehicleSize({ vehicle_size: 'MUV' })).toBe('MUV');
  });

  it('title-cases the ordinary ones', () => {
    expect(vehicleSize({ vehicle_size: 'sedan' })).toBe('Sedan');
    expect(vehicleSize({ vehicle_size: 'hatchback' })).toBe('Hatchback');
  });

  it('tidies a multi-word size however it was stored', () => {
    expect(vehicleSize({ vehicle_size: 'luxury_sedan' })).toBe('Luxury Sedan');
  });

  it('returns null when nobody recorded one', () => {
    expect(vehicleSize({})).toBeNull();
    expect(vehicleSize(null)).toBeNull();
  });
});

describe('vehicleRegistration', () => {
  it('upper-cases the plate however it was typed', () => {
    expect(vehicleRegistration({ vehicle_registration: 'tn09ab1234' })).toBe('TN09AB1234');
    expect(vehicleRegistration({ vehicle_registration: ' KA 05 MG 2255 ' })).toBe('KA 05 MG 2255');
  });

  it('returns null when nobody recorded one', () => {
    // Every booking taken before the field existed.
    expect(vehicleRegistration({})).toBeNull();
    expect(vehicleRegistration({ vehicle_registration: '  ' })).toBeNull();
    expect(vehicleRegistration(null)).toBeNull();
  });
});

describe('vehicleFuel', () => {
  it('keeps the spelling the list uses', () => {
    expect(vehicleFuel({ vehicle_fuel: 'Petrol' })).toBe('Petrol');
    expect(vehicleFuel({ vehicle_fuel: 'CNG' })).toBe('CNG');
  });

  it('tidies what was typed before the field was a list', () => {
    expect(vehicleFuel({ vehicle_fuel: 'diesel' })).toBe('Diesel');
    expect(vehicleFuel({ vehicle_fuel: 'cng' })).toBe('CNG');
    expect(vehicleFuel({ vehicle_fuel: 'ev' })).toBe('Electric');
  });

  it('returns null when nobody recorded one', () => {
    expect(vehicleFuel({})).toBeNull();
    expect(vehicleFuel(null)).toBeNull();
  });
});
