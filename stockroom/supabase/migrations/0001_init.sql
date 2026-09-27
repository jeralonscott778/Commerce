-- Stockroom: one database for all client stores (shared mode).
-- Every table has store_id, and row-level security makes sure a team only sees its own store.
-- The public website can read products, collections, zones and pages. It never reads orders or customers.
-- Website orders, payments and WhatsApp orders are created by server functions (Edge Functions).

create extension if not exists pgcrypto;

-- ============ stores and team ============
create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tagline text not null default '',
  initials text not null default '',
  accent text not null default '#1F5E4B',
  domain text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  currency text not null default 'GHS' check (currency in ('GHS','NGN','USD')),
  low_stock_at int not null default 5,
  tax_rate numeric not null default 0,
  tax_included boolean not null default true,
  business_type text not null default 'retail' check (business_type in ('retail','restaurant','services')),
  storefront jsonb not null default '{}'::jsonb,     -- announcement, hero, SEO, password, socials
  settings jsonb not null default '{}'::jsonb,       -- reservations, POS, WhatsApp options
  free_delivery_over numeric,
  next_order_number int not null default 1001,
  created_at timestamptz not null default now()
);

create table store_members (
  store_id uuid not null references stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'orders' check (role in ('owner','admin','orders','products','marketing','developer')),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create or replace function is_member(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from store_members m where m.store_id = sid and m.user_id = auth.uid())
$$;

create or replace function is_manager(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from store_members m where m.store_id = sid and m.user_id = auth.uid() and m.role in ('owner','admin','developer'))
$$;

-- Secrets (payment secret keys, WhatsApp token). No policies = nobody can read them from the browser.
-- Only server functions (service role) read them. Managers can write through set_store_secret().
create table store_secrets (
  store_id uuid not null references stores(id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (store_id, key)
);

-- ============ catalogue ============
create table collections (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  title text not null,
  description text not null default '',
  handle text not null,
  visible boolean not null default true,
  position int not null default 0,
  unique (store_id, handle)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('active','draft','archived')),
  images text[] not null default '{}',
  hue int not null default 200,
  category text not null default '',
  product_type text not null default '',
  vendor text not null default '',
  tags text[] not null default '{}',
  collection_ids uuid[] not null default '{}',
  options jsonb not null default '[]'::jsonb,        -- [{name, values[]}]
  modifiers jsonb not null default '[]'::jsonb,      -- restaurant add-ons: [{name, required, max, choices:[{name, price}]}]
  handle text not null,
  seo_title text not null default '',
  seo_description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, handle)
);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  title text not null default 'Default',
  options text[] not null default '{}',
  sku text not null default '',
  price numeric not null default 0 check (price >= 0),
  compare_at numeric,
  cost numeric,
  stock int not null default 0,
  track_stock boolean not null default true,
  position int not null default 0
);
create index on product_variants (product_id);

-- ============ customers ============
create table customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  email text not null default '',
  phone text not null default '',
  address jsonb not null default '{}'::jsonb,
  accepts_email boolean not null default false,
  accepts_whatsapp boolean not null default false,
  tags text[] not null default '{}',
  note text not null default '',
  created_at timestamptz not null default now()
);
create index on customers (store_id, phone);
create index on customers (store_id, email);

create table segments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  rule jsonb not null
);

-- ============ orders ============
create table orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  number int not null,
  created_at timestamptz not null default now(),
  customer_id uuid references customers(id) on delete set null,
  customer_name text not null default '',
  phone text not null default '',
  email text not null default '',
  address jsonb not null default '{}'::jsonb,
  channel text not null default 'online' check (channel in ('online','whatsapp','pos','phone','instagram','walk-in')),
  service text not null default 'delivery' check (service in ('delivery','pickup','dine_in','takeaway')),
  items jsonb not null default '[]'::jsonb,          -- snapshot of what was bought
  subtotal numeric not null default 0,
  discount_code text,
  discount_amount numeric not null default 0,
  gift_card_code text,
  gift_card_amount numeric not null default 0,
  delivery_method text not null default '',
  delivery_fee numeric not null default 0,
  service_charge numeric not null default 0,
  tip numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  payment_method text not null default 'cash',
  payment_status text not null default 'pending' check (payment_status in ('paid','pending','partially_refunded','refunded','voided')),
  payment_reference text,
  refunded numeric not null default 0,
  fulfilment_status text not null default 'unfulfilled' check (fulfilment_status in ('unfulfilled','fulfilled','cancelled')),
  delivery_status text not null default 'none' check (delivery_status in ('none','packed','out_for_delivery','delivered','picked_up')),
  kitchen_status text check (kitchen_status in ('new','preparing','ready','served')),
  table_id uuid,
  carrier text not null default '',
  tracking text not null default '',
  tags text[] not null default '{}',
  note text not null default '',
  staff_name text,
  staff_id uuid,
  shift_id uuid,
  timeline jsonb not null default '[]'::jsonb,
  unique (store_id, number)
);
create index on orders (store_id, created_at desc);

create table draft_orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  number int not null,
  created_at timestamptz not null default now(),
  customer_id uuid references customers(id) on delete set null,
  customer_name text not null default '',
  phone text not null default '',
  items jsonb not null default '[]'::jsonb,
  discount_amount numeric not null default 0,
  delivery_method text not null default '',
  delivery_fee numeric not null default 0,
  note text not null default '',
  channel text not null default 'whatsapp'
);

create table abandoned_checkouts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  customer_name text not null default '',
  phone text not null default '',
  email text not null default '',
  items jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  reminded_at timestamptz,
  recovered boolean not null default false
);

-- ============ marketing ============
create table discounts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  method text not null default 'code' check (method in ('code','automatic')),
  code text not null default '',
  title text not null default '',
  type text not null check (type in ('percent','fixed','free_delivery','buy_x_get_y')),
  value numeric not null default 0,
  buy_qty int not null default 2,
  get_qty int not null default 1,
  applies_to text not null default 'all',               -- 'all' or a collection id
  min_spend numeric not null default 0,
  eligibility text not null default 'everyone' check (eligibility in ('everyone','first_order')),
  usage_limit int not null default 0,
  once_per_customer boolean not null default false,
  starts_at date not null default current_date,
  ends_at date,
  paused boolean not null default false,
  uses int not null default 0
);
create unique index discounts_code_unique on discounts (store_id, upper(code)) where method = 'code';

create table gift_cards (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  code text not null,
  initial_value numeric not null,
  balance numeric not null,
  customer_id uuid references customers(id) on delete set null,
  customer_name text not null default '',
  expires_at date,
  disabled boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (store_id, code)
);

-- ============ setup ============
create table delivery_zones (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  areas text not null default '',
  fee numeric not null default 0,
  eta text not null default '',
  active boolean not null default true,
  position int not null default 0
);

create table payment_settings (   -- public keys and switches only; secret keys go in store_secrets
  store_id uuid not null references stores(id) on delete cascade,
  provider text not null check (provider in ('paystack','flutterwave','stripe','cod')),
  enabled boolean not null default false,
  test_mode boolean not null default true,
  public_key text not null default '',
  cod_fee numeric not null default 0,
  cod_zones text[] not null default '{}',
  primary key (store_id, provider)
);

create table pages (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  title text not null,
  body text not null default '',
  visible boolean not null default true
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  at timestamptz not null default now(),
  text text not null,
  link text not null default '',
  read boolean not null default false
);

-- ============ restaurant: POS staff, shifts, tables, reservations ============
create table pos_staff (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  role text not null default 'cashier' check (role in ('cashier','waiter','kitchen','manager')),
  pin_hash text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  staff_id uuid not null references pos_staff(id) on delete cascade,
  staff_name text not null default '',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  opening_float numeric not null default 0,
  cash_counted numeric,
  expected_cash numeric,
  note text not null default ''
);

create table dining_tables (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  area text not null default 'Main',
  seats int not null default 4,
  status text not null default 'free' check (status in ('free','seated','ordered','bill','reserved')),
  position int not null default 0
);

create table reservations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  phone text not null default '',
  email text not null default '',
  party_size int not null check (party_size > 0),
  starts_at timestamptz not null,
  duration_min int not null default 90,
  table_id uuid references dining_tables(id) on delete set null,
  status text not null default 'booked' check (status in ('booked','seated','completed','cancelled','no_show')),
  deposit_amount numeric not null default 0,
  deposit_paid boolean not null default false,
  notes text not null default '',
  source text not null default 'website',
  created_at timestamptz not null default now()
);
create index on reservations (store_id, starts_at);

-- ============ WhatsApp ============
create table wa_conversations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  phone text not null,
  name text not null default '',
  state jsonb not null default '{}'::jsonb,           -- the bot's cart and step
  needs_human boolean not null default false,
  last_message_at timestamptz not null default now(),
  unique (store_id, phone)
);

create table wa_messages (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  conversation_id uuid not null references wa_conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  body text not null,
  at timestamptz not null default now()
);
create index on wa_messages (conversation_id, at);

-- ============ security ============
do $$
declare t text;
begin
  foreach t in array array['collections','products','product_variants','customers','segments','orders','draft_orders','abandoned_checkouts','discounts','gift_cards','delivery_zones','payment_settings','pages','notifications','pos_staff','shifts','dining_tables','reservations','wa_conversations','wa_messages']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "team can manage" on %I for all to authenticated using (is_member(store_id)) with check (is_member(store_id))', t);
  end loop;
end $$;

alter table store_secrets enable row level security;   -- deliberately no policies

alter table stores enable row level security;
create policy "team can read store" on stores for select to authenticated using (is_member(id));
create policy "managers can update store" on stores for update to authenticated using (is_manager(id)) with check (is_manager(id));

alter table store_members enable row level security;
create policy "team can see team" on store_members for select to authenticated using (is_member(store_id));
create policy "managers can change roles" on store_members for update to authenticated using (is_manager(store_id)) with check (is_manager(store_id));
create policy "managers can remove members" on store_members for delete to authenticated using (is_manager(store_id) and role <> 'owner');

-- What the public website (Framer) may read directly.
create policy "website reads active products" on products for select to anon using (status = 'active');
create policy "website reads variants of active products" on product_variants for select to anon
  using (exists (select 1 from products p where p.id = product_id and p.status = 'active'));
create policy "website reads visible collections" on collections for select to anon using (visible);
create policy "website reads active zones" on delivery_zones for select to anon using (active);
create policy "website reads visible pages" on pages for select to anon using (visible);
create policy "website reads enabled payment options" on payment_settings for select to anon using (enabled);

-- ============ functions ============
-- Store details for the website (without private fields such as the storefront password).
create or replace function get_public_store(sid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'name', name, 'tagline', tagline, 'accent', accent, 'domain', domain, 'email', email, 'phone', phone,
    'currency', currency, 'free_delivery_over', free_delivery_over, 'business_type', business_type,
    'storefront', storefront - 'password', 'reservations', settings -> 'reservations')
  from stores where id = sid
$$;

-- Creates a new store and makes the signed-in user its owner.
create or replace function create_store(store_name text, owner_name text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into stores (name, initials) values (store_name, upper(left(regexp_replace(store_name, '[^A-Za-z]', '', 'g'), 2))) returning id into sid;
  insert into store_members (store_id, user_id, name, email, role)
    values (sid, auth.uid(), owner_name, coalesce((select email from auth.users where id = auth.uid()), ''), 'owner');
  insert into payment_settings (store_id, provider, enabled, test_mode) values (sid,'paystack',false,true),(sid,'flutterwave',false,true),(sid,'stripe',false,true),(sid,'cod',true,false);
  insert into delivery_zones (store_id, name, areas, fee, eta, position) values
    (sid,'Greater Accra','Accra, Tema',30,'1–2 days',0),(sid,'Ashanti','Kumasi',45,'2–3 days',1),(sid,'Rest of Ghana','All other regions',60,'3–5 days',2),(sid,'Store pickup','',0,'Same day',3);
  return sid;
end $$;

-- Adds someone who already has an account to a store's team.
create or replace function add_member(sid uuid, member_email text, member_role text, member_name text default '') returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_manager(sid) then raise exception 'Only owners and admins can add staff'; end if;
  if member_role not in ('admin','orders','products','marketing','developer') then raise exception 'Unknown role'; end if;
  select id into uid from auth.users where lower(email) = lower(member_email);
  if uid is null then return 'no_account'; end if;
  insert into store_members (store_id, user_id, name, email, role) values (sid, uid, member_name, lower(member_email), member_role)
    on conflict (store_id, user_id) do update set role = excluded.role;
  return 'added';
end $$;

create or replace function set_store_secret(sid uuid, secret_key text, secret_value text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_manager(sid) then raise exception 'Only owners and admins can change keys'; end if;
  if secret_key not in ('paystack_secret','flutterwave_secret','stripe_secret','whatsapp_token','whatsapp_verify_token','whatsapp_app_secret') then raise exception 'Unknown key'; end if;
  insert into store_secrets (store_id, key, value) values (sid, secret_key, secret_value)
    on conflict (store_id, key) do update set value = excluded.value, updated_at = now();
end $$;

create or replace function has_store_secret(sid uuid, secret_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_member(sid) and exists (select 1 from store_secrets where store_id = sid and key = secret_key)
$$;

-- Next order number for a store, safe when two orders arrive at the same moment.
create or replace function next_order_number(sid uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_member(sid) and coalesce(auth.role(), '') <> 'service_role' then raise exception 'not allowed'; end if;
  update stores set next_order_number = next_order_number + 1 where id = sid returning next_order_number - 1 into n;
  return n;
end $$;

-- POS: set a staff PIN (stored hashed) and check a PIN at the till.
create or replace function set_staff_pin(staff uuid, pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if pin !~ '^[0-9]{4,6}$' then raise exception 'PIN must be 4 to 6 digits'; end if;
  update pos_staff set pin_hash = crypt(pin, gen_salt('bf')) where id = staff and is_manager(store_id);
  if not found then raise exception 'Not allowed'; end if;
end $$;

create or replace function check_staff_pin(staff uuid, pin text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from pos_staff where id = staff and active and is_member(store_id) and pin_hash <> '' and pin_hash = crypt(pin, pin_hash))
$$;

-- Reservations: which start times are free on a day, for the public booking form.
create or replace function available_slots(sid uuid, day date, party int) returns table (slot timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  cfg jsonb := coalesce((select settings -> 'reservations' from stores where id = sid), '{}'::jsonb);
  open_t time := coalesce((cfg ->> 'opens')::time, '12:00');
  close_t time := coalesce((cfg ->> 'closes')::time, '22:00');
  step int := coalesce((cfg ->> 'slot_minutes')::int, 30);
  dur int := coalesce((cfg ->> 'duration_minutes')::int, 90);
  cap int := coalesce((cfg ->> 'max_covers')::int, 40);
  maxp int := coalesce((cfg ->> 'max_party')::int, 8);
  t timestamptz;
begin
  if party > maxp or coalesce((cfg ->> 'enabled')::boolean, false) = false then return; end if;
  t := (day + open_t) at time zone 'Africa/Accra';
  while t + make_interval(mins => dur) <= (day + close_t) at time zone 'Africa/Accra' loop
    if t > now() + interval '1 hour' and
       coalesce((select sum(r.party_size) from reservations r where r.store_id = sid and r.status in ('booked','seated')
         and r.starts_at < t + make_interval(mins => dur) and r.starts_at + make_interval(mins => r.duration_min) > t), 0) + party <= cap then
      slot := t; return next;
    end if;
    t := t + make_interval(mins => step);
  end loop;
end $$;

create or replace function book_table(sid uuid, guest_name text, guest_phone text, guest_email text, party int, at timestamptz, notes text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid; dur int;
begin
  if length(trim(guest_name)) = 0 or length(trim(guest_phone)) < 7 then raise exception 'Name and phone are required'; end if;
  if not exists (select 1 from available_slots(sid, (at at time zone 'Africa/Accra')::date, party) s where s.slot = at) then raise exception 'That time is no longer available'; end if;
  dur := coalesce((select (settings -> 'reservations' ->> 'duration_minutes')::int from stores where id = sid), 90);
  insert into reservations (store_id, name, phone, email, party_size, starts_at, duration_min, notes, source)
    values (sid, guest_name, guest_phone, coalesce(guest_email, ''), party, at, dur, coalesce(notes, ''), 'website') returning id into rid;
  insert into notifications (store_id, text, link) values (sid, format('New booking: %s, %s people', guest_name, party), '/reservations');
  return rid;
end $$;

-- Lets a customer check their order status on the website with the order id from their receipt.
create or replace function get_order_status(oid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('number', number, 'payment_status', payment_status, 'fulfilment_status', fulfilment_status,
    'delivery_status', delivery_status, 'total', total, 'items', items, 'created_at', created_at)
  from orders where id = oid
$$;

create or replace function touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
create trigger products_touch before update on products for each row execute function touch_updated_at();

revoke execute on function is_member(uuid), is_manager(uuid), create_store(text, text), add_member(uuid, text, text, text), set_store_secret(uuid, text, text), set_staff_pin(uuid, text), check_staff_pin(uuid, text), next_order_number(uuid), has_store_secret(uuid, text) from public, anon;
grant execute on function is_member(uuid), is_manager(uuid), create_store(text, text), add_member(uuid, text, text, text), set_store_secret(uuid, text, text), set_staff_pin(uuid, text), check_staff_pin(uuid, text), next_order_number(uuid), has_store_secret(uuid, text) to authenticated, service_role;

-- Product images: public read, team upload into a folder named after the store id.
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true) on conflict do nothing;
create policy "team uploads images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and is_member(((storage.foldername(name))[1])::uuid));
create policy "team deletes images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and is_member(((storage.foldername(name))[1])::uuid));

-- Live updates in the dashboard (new orders, bookings, WhatsApp messages).
alter publication supabase_realtime add table orders, notifications, reservations, wa_conversations, wa_messages;
