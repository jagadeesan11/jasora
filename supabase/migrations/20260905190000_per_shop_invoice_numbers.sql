-- Phase 6 of multi-tenancy: invoice numbering, per shop.
--
-- private.invoice_counters is keyed on financial_year alone, so two shops
-- completing a job in the same year would draw from one series: MC/2026-27/0009
-- and the next shop's 0010, interleaved. Numbers on a bill of supply are a
-- legal record, and two businesses cannot share a sequence.
--
-- The prefix moves too. It was the literal 'MC/' in the function; it is now
-- shops.invoice_prefix, which phase 1 constrained to be unique — which is what
-- lets invoices.number stay globally unique while each shop counts from one.
--
-- The second half of this migration matters more than the numbering. The
-- invoice trigger built its seller block — the name and address printed at the
-- top of every bill — from the app_settings singleton. Left alone, all ten
-- shops would have issued bills under one shop's letterhead.

-- Written to converge from any starting point. An earlier attempt at this
-- migration failed partway through on a syntax error and did NOT roll back:
-- the column had been added, the key already swapped. A migration that assumes
-- it runs exactly once, on a clean table, cannot be re-run after that.
do $mig$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'private' and table_name = 'invoice_counters'
       and column_name = 'shop_id'
  ) then
    alter table private.invoice_counters add column shop_id uuid references public.shops(id);
  end if;

  update private.invoice_counters
     set shop_id = (select id from public.shops where slug = 'moto-ceramic')
   where shop_id is null;

  alter table private.invoice_counters alter column shop_id set not null;

  -- Swap the key only if it is still the single-column one.
  if exists (
    select 1 from pg_constraint
     where conname = 'invoice_counters_pkey'
       and conrelid = 'private.invoice_counters'::regclass
       and array_length(conkey, 1) = 1
  ) then
    alter table private.invoice_counters drop constraint invoice_counters_pkey;
    alter table private.invoice_counters add primary key (shop_id, financial_year);
  end if;
end;
$mig$;

drop function if exists private.next_invoice_number(timestamptz);

create or replace function private.next_invoice_number(p_shop uuid, at timestamptz)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := (at at time zone 'Asia/Kolkata')::date;
  start_year int := case when extract(month from d) >= 4
                         then extract(year from d)::int
                         else extract(year from d)::int - 1 end;
  fy text := start_year || '-' || right((start_year + 1)::text, 2);
  n int;
  prefix text;
begin
  select invoice_prefix into strict prefix from public.shops where id = p_shop;

  -- Still one atomic upsert, so numbering stays gap-free: the row is locked
  -- for the duration, and two completions in the same shop and year queue
  -- rather than racing. The key gains shop_id, so each shop counts alone.
  insert into private.invoice_counters (shop_id, financial_year, last_number)
  values (p_shop, fy, 1)
  on conflict (shop_id, financial_year)
    do update set last_number = private.invoice_counters.last_number + 1
  returning last_number into n;

  return prefix || '/' || fy || '/' || lpad(n::text, 4, '0');
end;
$$;

create or replace function private.raise_invoice_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.services%rowtype;
  sh public.shops%rowtype;
  p public.profiles%rowtype;
  addon_lines jsonb := '[]'::jsonb;
  addon_total numeric(10, 2) := 0;
  service_amount numeric(10, 2);
  items jsonb;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;
  if exists (select 1 from public.invoices where booking_id = new.id) then
    return new;
  end if;

  select * into s from public.services where id = new.service_id;
  -- The letterhead. Read from the booking's own shop, not the singleton:
  -- otherwise every shop's bills carry one shop's name and address.
  select * into sh from public.shops where id = new.shop_id;
  select * into p from public.profiles where id = new.user_id;

  select coalesce(jsonb_agg(jsonb_build_object('description', a.name, 'amount', a.price)), '[]'::jsonb),
         coalesce(sum(a.price), 0)
    into addon_lines, addon_total
    from public.addons a
   where a.id = any(new.addon_ids);

  -- The booking's total is what was agreed and is authoritative. The service
  -- line is the remainder after add-ons, so the printed lines always sum to
  -- the amount actually charged even if an add-on's price changed since.
  service_amount := new.total_price - addon_total;

  if service_amount < 0 then
    -- Add-on prices moved enough to make the split nonsense. One honest line
    -- beats a breakdown that implies a discount nobody gave.
    items := jsonb_build_array(
      jsonb_build_object('description', coalesce(s.name, 'Service'), 'amount', new.total_price)
    );
  else
    items := jsonb_build_array(
      jsonb_build_object('description', coalesce(s.name, 'Service'), 'amount', service_amount)
    ) || addon_lines;
  end if;

  insert into public.invoices (booking_id, shop_id, number, line_items, total, payment_method, seller, buyer)
  values (
    new.id,
    new.shop_id,
    private.next_invoice_number(new.shop_id, now()),
    items,
    new.total_price,
    new.payment_method,
    jsonb_build_object(
      'name', coalesce(sh.name, 'Nexora'),
      'address_line', sh.address_line,
      'city', sh.city,
      'postal_code', sh.postal_code,
      'phone', sh.support_phone,
      'email', sh.support_email
    ),
    jsonb_build_object(
      'name', coalesce(new.contact_name, p.name),
      'phone', coalesce(new.contact_phone, p.phone),
      'address_line', coalesce(new.service_address, p.address_line),
      'city', coalesce(new.service_city, p.city),
      'postal_code', coalesce(new.service_postal_code, p.postal_code)
    )
  );

  return new;
end;
$$;
