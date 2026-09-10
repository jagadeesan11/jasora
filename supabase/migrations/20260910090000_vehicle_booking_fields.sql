-- What a car-care booking asks about the car.
--
-- Make was a free-text box, so the same manufacturer arrived as "maruti",
-- "Maruti Suzuki", "MARUTI" and "msil". Nothing downstream can group those,
-- and a shop reading its own jobs list has to translate every row. A list
-- settles it at the point of entry, which is the only place it can be settled
-- without guessing later.
--
-- Model stays free text on purpose. An exhaustive model list is a second
-- dataset to maintain and it goes stale every launch, while the shop only
-- needs the model at the level of "Swift" — the hint says so, and the variant,
-- trim and year it used to attract are noise to everyone who reads them.
--
-- Registration and fuel are new. The plate is what a shop calls the car once
-- it is in the bay, and fuel decides whether a job is even doable — an EV has
-- no exhaust to treat and a CNG cylinder changes what can be done to the boot.
--
-- Per-shop: every shop has its own template row since the tenant split, so
-- this walks them all. Fields the shop added itself, vehicle_size included,
-- are carried across untouched and keep their order — a shop that renamed a
-- size or added a field of its own does not lose it here.

do $$
declare
  template record;
  -- Alphabetical, because the app searches this list rather than scrolling it,
  -- and "Other" last so it reads as the fallback it is.
  makes constant jsonb := '[
    "Audi", "BMW", "BYD", "Chevrolet", "Citroen", "Datsun", "Fiat", "Force",
    "Ford", "Honda", "Hyundai", "Isuzu", "Jaguar", "Jeep", "Kia", "Land Rover",
    "Lexus", "Mahindra", "Maruti Suzuki", "Mercedes-Benz", "MG", "Mini",
    "Nissan", "Porsche", "Renault", "Skoda", "Tata", "Toyota", "Volkswagen",
    "Volvo", "Other"
  ]'::jsonb;
  rebuilt jsonb;
begin
  for template in select id, fields from public.input_templates loop
    -- Only vehicle templates. A future vertical's template has no make field
    -- and has no business growing a registration number.
    continue when not exists (
      select 1 from jsonb_array_elements(template.fields) as f
      where f->>'name' = 'vehicle_make'
    );

    rebuilt := jsonb_build_array(
      jsonb_build_object(
        'name', 'vehicle_make',
        'label', 'Vehicle Make',
        'type', 'select',
        'required', true,
        'options', makes
      ),
      jsonb_build_object(
        'name', 'vehicle_model',
        'label', 'Vehicle Model',
        'type', 'text',
        'required', true,
        'hint', 'The model only — no variant, trim or year. Swift, Creta, Nexon.'
      ),
      jsonb_build_object(
        'name', 'vehicle_registration',
        'label', 'Registration Number',
        'type', 'text',
        'required', true,
        'hint', 'As on the number plate, e.g. TN09AB1234.'
      ),
      jsonb_build_object(
        'name', 'vehicle_fuel',
        'label', 'Fuel',
        'type', 'select',
        'required', true,
        'options', '["Petrol", "Diesel", "CNG", "Electric"]'::jsonb
      )
    );

    select rebuilt || coalesce(jsonb_agg(f order by ord), '[]'::jsonb)
      into rebuilt
      from jsonb_array_elements(template.fields) with ordinality as kept(f, ord)
     where f->>'name' not in (
       'vehicle_make', 'vehicle_model', 'vehicle_registration', 'vehicle_fuel'
     );

    update public.input_templates set fields = rebuilt where id = template.id;
  end loop;
end $$;

-- Assets booked before today keep whatever they recorded. A make typed as
-- "tata" is still the truth about that booking, and rewriting history to match
-- a list drawn up afterwards would make the record less accurate, not more.
