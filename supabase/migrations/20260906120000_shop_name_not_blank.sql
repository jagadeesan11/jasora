-- A shop must have a name.
--
-- The column was `name text not null`, which a single space satisfies. That is
-- exactly what happened: the live shop was saved with name = ' ' and the
-- customer app went blank wherever the shop is named — the sign-in screen, the
-- home header, the help centre, the invoice footer — while the admin panel
-- showed a name field that looked merely empty.
--
-- NOT NULL is the wrong constraint for a display name. What matters is that it
-- has something in it once whitespace is discounted, which is what this says.
-- The form validates too, but the form is one of several ways a row gets
-- written and the only one that can be bypassed by a stale bundle, a script,
-- or the next client.
--
-- Trimmed rather than merely non-empty: ' MC ' is a name someone will type by
-- accident and never see, and it would sort and search differently from 'MC'.

update public.shops set name = 'Unnamed shop' where btrim(name) = '';

alter table public.shops
  add constraint shops_name_not_blank check (btrim(name) <> '');

-- The slug is already constrained to a real pattern and invoice_prefix to
-- ^[A-Z][A-Z0-9]{1,7}$, so neither can go blank the same way.
