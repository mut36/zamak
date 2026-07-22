-- ZAMAK: credit purchases (Toss Payments)
--
-- Run this once in the Supabase SQL editor, after 0001_credits.sql.
--
-- Design notes:
--  * The price is never taken from the client. /api/payments/prepare looks the
--    pack up in app/config/packs.ts and writes the amount into an order row
--    *before* the payment window opens; settlement then refuses any amount that
--    does not match that row. A tampered client can only buy what it paid for.
--  * Settlement is idempotent. The success URL is a plain GET that a user can
--    reload, and Toss can be asked to confirm the same payment twice, so
--    granting credits has to be safe to attempt more than once.
--  * As in 0001, balances are only ever written by a security-definer function.
--    The orders table is readable by its owner and writable by nobody.

-- ----------------------------------------------------------------- orders ---

create table if not exists public.orders (
  -- The orderId handed to Toss. Their format: 6-64 chars of [A-Za-z0-9_-].
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Which pack was bought, as an audit trail. Pack definitions live in code;
  -- credits/amount are copied here so a later price change cannot rewrite
  -- history or retroactively change what an open order is worth.
  pack_id     text not null,
  credits     integer not null check (credits > 0),
  amount      integer not null check (amount > 0), -- KRW, tax inclusive
  status      text not null default 'pending'
              check (status in ('pending', 'paid', 'failed', 'canceled')),
  payment_key text,
  method      text,
  receipt_url text,
  fail_code   text,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);

create index if not exists orders_user_created_idx
  on public.orders (user_id, created_at desc);

alter table public.orders enable row level security;

-- Readable by its owner (purchase history); not writable through the API.
drop policy if exists "orders are readable by their owner" on public.orders;
create policy "orders are readable by their owner"
  on public.orders for select
  using (auth.uid() = user_id);

-- ------------------------------------------------------------ open order ---

-- Creates a pending order and returns its id, which becomes the Toss orderId.
--
-- The caller (an authenticated route handler) supplies credits and amount from
-- the server-side pack table; this function only ensures the row belongs to the
-- session that asked for it.
create or replace function public.create_order(
  p_pack_id text,
  p_credits integer,
  p_amount  integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_order_id text;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_credits is null or p_credits <= 0 or p_amount is null or p_amount <= 0 then
    raise exception 'invalid order' using errcode = '22023';
  end if;

  -- 38 chars of [a-z0-9-], inside Toss's 6-64 window.
  v_order_id := 'zamak-' || replace(gen_random_uuid()::text, '-', '');

  insert into public.orders (id, user_id, pack_id, credits, amount)
  values (v_order_id, v_user_id, p_pack_id, p_credits, p_amount);

  return v_order_id;
end;
$$;

revoke all on function public.create_order(text, integer, integer) from public;
grant execute on function public.create_order(text, integer, integer) to authenticated;

-- --------------------------------------------------------- settle / fail ---

-- Marks an order paid and grants its credits, in one statement.
--
-- Returns (credits_granted, already_settled). A repeat call for an order that
-- is already paid returns (its credits, true) and grants nothing — the success
-- URL is a reloadable GET, so this has to be safe to run twice.
create or replace function public.settle_order(
  p_order_id    text,
  p_payment_key text,
  p_amount      integer,
  p_method      text,
  p_receipt_url text
)
returns table (credits_granted integer, already_settled boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order   public.orders%rowtype;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- The row lock serialises two tabs landing on the success URL at once.
  select * into v_order
    from public.orders
   where id = p_order_id
     and user_id = v_user_id
     for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_order.status = 'paid' then
    return query select v_order.credits, true;
    return;
  end if;

  -- The whole point of writing the amount down before opening the payment
  -- window: what Toss says was paid must match what we asked for.
  if v_order.amount <> p_amount then
    raise exception 'amount mismatch' using errcode = 'P0003';
  end if;

  update public.orders
     set status      = 'paid',
         payment_key = p_payment_key,
         method      = p_method,
         receipt_url = p_receipt_url,
         paid_at     = now()
   where id = p_order_id;

  insert into public.credits (user_id, balance)
  values (v_user_id, v_order.credits)
  on conflict (user_id) do update
     set balance    = public.credits.balance + excluded.balance,
         updated_at = now();

  return query select v_order.credits, false;
end;
$$;

revoke all on function public.settle_order(text, text, integer, text, text) from public;
grant execute on function public.settle_order(text, text, integer, text, text) to authenticated;

-- Records that a payment did not go through. Nothing is granted; this exists so
-- an abandoned order does not sit as 'pending' forever and so the failure code
-- is visible when someone asks why their card did not work.
create or replace function public.fail_order(p_order_id text, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.orders
     set status    = case when p_code = 'PAY_PROCESS_CANCELED'
                          then 'canceled' else 'failed' end,
         fail_code = p_code
   where id = p_order_id
     and user_id = v_user_id
     and status = 'pending';
end;
$$;

revoke all on function public.fail_order(text, text) from public;
grant execute on function public.fail_order(text, text) to authenticated;
