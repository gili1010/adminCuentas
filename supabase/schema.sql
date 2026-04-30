create table if not exists public.movements (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('expense', 'income', 'receivable', 'card')),
  description text not null,
  amount numeric(14, 2) not null check (amount > 0),
  due_date date,
  person text,
  card_name text,
  installment_label text,
  notes text,
  paid boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now()
);

alter table public.movements
add column if not exists paid boolean not null default false;

create index if not exists movements_user_due_idx on public.movements (user_id, due_date);
create index if not exists movements_user_type_idx on public.movements (user_id, type);

alter table public.movements enable row level security;

create policy "Users can read own movements"
on public.movements
for select
using (auth.uid() = user_id);

create policy "Users can insert own movements"
on public.movements
for insert
with check (auth.uid() = user_id);

create policy "Users can update own movements"
on public.movements
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own movements"
on public.movements
for delete
using (auth.uid() = user_id);
