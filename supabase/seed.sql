-- Seed data: Car Care vertical (service-app-build-plan.md Phase 1, Prompt 6)
-- Fixed UUIDs so this file is idempotent-ish for local dev resets and so
-- later statements can reference earlier rows without INSERT...RETURNING.

insert into public.input_templates (id, name, fields) values (
  '11111111-1111-1111-1111-111111111111',
  'Car Care Vehicle Info',
  '[
    {"name": "vehicle_make", "label": "Vehicle Make", "type": "select", "required": true,
     "options": ["Audi", "BMW", "BYD", "Chevrolet", "Citroen", "Datsun", "Fiat", "Force",
                 "Ford", "Honda", "Hyundai", "Isuzu", "Jaguar", "Jeep", "Kia", "Land Rover",
                 "Lexus", "Mahindra", "Maruti Suzuki", "Mercedes-Benz", "MG", "Mini",
                 "Nissan", "Porsche", "Renault", "Skoda", "Tata", "Toyota", "Volkswagen",
                 "Volvo", "Other"]},
    {"name": "vehicle_model", "label": "Vehicle Model", "type": "text", "required": true,
     "hint": "The model only — no variant, trim or year. Swift, Creta, Nexon."},
    {"name": "vehicle_registration", "label": "Registration Number", "type": "text", "required": true,
     "hint": "As on the number plate, e.g. TN09AB1234."},
    {"name": "vehicle_fuel", "label": "Fuel", "type": "select", "required": true,
     "options": ["Petrol", "Diesel", "CNG", "Electric"]},
    {"name": "vehicle_size", "label": "Vehicle Size", "type": "select", "required": true, "options": ["hatchback", "sedan", "suv"]}
  ]'::jsonb
);

insert into public.categories (id, name, slug, icon, input_template_id) values (
  '22222222-2222-2222-2222-222222222222',
  'Car Care',
  'car-care',
  'car',
  '11111111-1111-1111-1111-111111111111'
);

insert into public.services (id, category_id, name, description, base_price, pricing_type, duration_minutes) values
  (
    '33333333-3333-3333-3333-333333333331',
    '22222222-2222-2222-2222-222222222222',
    'PPF (Paint Protection Film)',
    'A transparent polyurethane film applied to your car''s paint to protect it from stone chips, scratches, and UV damage while preserving the factory finish.',
    22000, 'tiered', 480
  ),
  (
    '33333333-3333-3333-3333-333333333332',
    '22222222-2222-2222-2222-222222222222',
    'Ceramic Coating',
    'A liquid polymer applied by hand that bonds with your car''s paint, giving long-lasting gloss, hydrophobic water beading, and protection against oxidation.',
    9000, 'tiered', 240
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '22222222-2222-2222-2222-222222222222',
    'Accessories Fitting',
    'Professional fitting of car accessories such as mats, seat covers, and dashboard cameras, with clean wiring and no damage to interior trim.',
    1500, 'tiered', 90
  );

insert into public.pricing_rules (service_id, condition, price) values
  ('33333333-3333-3333-3333-333333333331', '{"vehicle_size": "hatchback"}'::jsonb, 22000),
  ('33333333-3333-3333-3333-333333333331', '{"vehicle_size": "sedan"}'::jsonb, 26000),
  ('33333333-3333-3333-3333-333333333331', '{"vehicle_size": "suv"}'::jsonb, 32000),
  ('33333333-3333-3333-3333-333333333332', '{"vehicle_size": "hatchback"}'::jsonb, 9000),
  ('33333333-3333-3333-3333-333333333332', '{"vehicle_size": "sedan"}'::jsonb, 12000),
  ('33333333-3333-3333-3333-333333333332', '{"vehicle_size": "suv"}'::jsonb, 16000),
  ('33333333-3333-3333-3333-333333333333', '{"vehicle_size": "hatchback"}'::jsonb, 1500),
  ('33333333-3333-3333-3333-333333333333', '{"vehicle_size": "sedan"}'::jsonb, 2000),
  ('33333333-3333-3333-3333-333333333333', '{"vehicle_size": "suv"}'::jsonb, 2800);

insert into public.addons (service_id, name, price, is_multi_select) values
  ('33333333-3333-3333-3333-333333333331', 'Interior detailing', 3500, true),
  ('33333333-3333-3333-3333-333333333331', 'Headlight restoration', 1800, true),
  ('33333333-3333-3333-3333-333333333332', 'Interior detailing', 3500, true),
  ('33333333-3333-3333-3333-333333333332', 'Headlight restoration', 1800, true),
  ('33333333-3333-3333-3333-333333333333', 'Interior detailing', 3500, true),
  ('33333333-3333-3333-3333-333333333333', 'Headlight restoration', 1800, true);
