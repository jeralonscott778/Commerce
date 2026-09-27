-- Website checkouts are kept here until they are paid. Unpaid ones become "abandoned checkouts".
alter table abandoned_checkouts
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists provider text not null default '',
  add column if not exists completed boolean not null default false,
  add column if not exists order_id uuid;
create index if not exists abandoned_open on abandoned_checkouts (store_id, completed, created_at desc);
