-- ZAMAK: 번역권을 라이트/프로 2종으로 분리
--
-- Run this once in the Supabase SQL editor, after 0003_beta_signup_credit.sql.
--
-- Why two balances: pro runs at HIGH thinking and is billed at the output
-- rate, so it costs several times what lite does. One shared balance would let
-- a beta user spend cheap-path credits on the expensive path.
--
-- Migration safety: existing balances move to lite_balance. Nobody loses a
-- credit, and nobody is handed a pro credit they did not have.

-- ------------------------------------------------------ credits: 2 balances ---

alter table public.credits
  add column if not exists lite_balance integer not null default 0
    check (lite_balance >= 0),
  add column if not exists pro_balance integer not null default 0
    check (pro_balance >= 0);

-- Carry the old single balance over exactly once. The `balance` column is kept
-- (not dropped) so a rollback does not lose data; nothing reads it after this.
update public.credits
   set lite_balance = balance
 where lite_balance = 0
   and balance > 0;

comment on column public.credits.balance is
  'DEPRECATED — superseded by lite_balance/pro_balance in 0004. Kept for rollback.';

-- ------------------------------------------------- signup grant (라이트3 프로1) ---

create or replace function public.grant_signup_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.credits (user_id, balance, lite_balance, pro_balance)
  values (new.id, 0, 3, 1)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- The trigger itself is unchanged (0001 created it); replacing the function is
-- enough. Re-declared here so this file is self-contained if run on a fresh DB.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.grant_signup_credit();

-- ------------------------------------------------------ jobs: model column ---

-- begin_translation_job records which model a job used; the history screen
-- shows it, and it is the only record of what a credit was spent on.
alter table public.translation_jobs
  add column if not exists model text;

-- ------------------------------------------- spend one credit (모델별 잔액) ---

-- Replaces the single-argument version from 0001. The old signature is dropped
-- so a stale client cannot silently spend from the wrong balance.
drop function if exists public.begin_translation_job(integer);

create or replace function public.begin_translation_job(
  p_total_blocks integer,
  p_model text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_job_id  uuid;
  v_kind    text;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_total_blocks is null or p_total_blocks <= 0 then
    raise exception 'invalid block count' using errcode = '22023';
  end if;

  -- The caller passes a model id; the mapping to a balance lives here too so
  -- a client cannot pick which balance to drain.
  v_kind := case when p_model = 'gemini-3.1-pro-preview' then 'pro' else 'lite' end;

  -- Single statement per branch: the row lock serialises concurrent requests,
  -- so the last credit cannot be spent twice.
  if v_kind = 'pro' then
    update public.credits
       set pro_balance = pro_balance - 1,
           updated_at = now()
     where user_id = v_user_id
       and pro_balance > 0;
  else
    update public.credits
       set lite_balance = lite_balance - 1,
           updated_at = now()
     where user_id = v_user_id
       and lite_balance > 0;
  end if;

  if not found then
    -- The kind is carried in the message so the route can tell the user which
    -- balance ran out without a second query.
    raise exception 'insufficient credits: %', v_kind using errcode = 'P0001';
  end if;

  insert into public.translation_jobs (user_id, total_blocks, model)
  values (v_user_id, p_total_blocks, p_model)
  returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function public.begin_translation_job(integer, text) from public;
grant execute on function public.begin_translation_job(integer, text) to authenticated;

-- ------------------------------------------------- settle_order grant by kind ---

-- The task-3 brief assumed a `grant_credits(order_id, payment_key, credits,
-- amount)` function over a `purchases` table. Neither exists in this repo:
-- 0002_payments.sql's real granting function is `settle_order`, over the
-- `orders` table. This section amends `settle_order` in place instead of the
-- brief's `grant_credits` — the actual file wins.
--
-- Only the credits insert/update changes: a `p_kind` parameter picks which
-- balance accumulates. Everything else (row lock, paid-status early return,
-- amount-mismatch check, return shape) is untouched.
--
-- Default 'lite' is deliberate, not a placeholder: today's three packs
-- (starter/standard/bulk, see app/config/packs.ts) are all priced against
-- lite economics, so an existing caller that passes nothing keeps behaving
-- exactly as it does today.
--
-- NOTE for whoever wires up pro packs later: pro's unit cost runs several
-- times lite's (HIGH thinking, billed at the output rate), so a pro pack
-- cannot reuse lite pricing. Nobody should pass p_kind => 'pro' from a route
-- until the owner has made that pricing call — see docs/TODO.md.
drop function if exists public.settle_order(text, text, integer, text, text);

create or replace function public.settle_order(
  p_order_id    text,
  p_payment_key text,
  p_amount      integer,
  p_method      text,
  p_receipt_url text,
  p_kind        text default 'lite'
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

  if p_kind = 'pro' then
    insert into public.credits (user_id, pro_balance)
    values (v_user_id, v_order.credits)
    on conflict (user_id) do update
       set pro_balance = public.credits.pro_balance + excluded.pro_balance,
           updated_at  = now();
  else
    insert into public.credits (user_id, lite_balance)
    values (v_user_id, v_order.credits)
    on conflict (user_id) do update
       set lite_balance = public.credits.lite_balance + excluded.lite_balance,
           updated_at   = now();
  end if;

  return query select v_order.credits, false;
end;
$$;

revoke all on function public.settle_order(text, text, integer, text, text, text) from public;
grant execute on function public.settle_order(text, text, integer, text, text, text) to authenticated;
