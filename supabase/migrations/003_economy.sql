-- Village Life, Phase 6: ekonomi dasar (dompet, buku besar transaksi, transfer aman).
-- Jalankan SETELAH 001 dan 002. Supabase Dashboard > SQL Editor > New query > tempel seluruh isi > Run. Aman dijalankan ulang.
-- Mata uang: rupiah bulat (bigint), tanpa desimal agar tidak ada selisih pembulatan.

-- Parameter ekonomi yang dapat diatur tanpa mengubah kode game.
create table if not exists public.economy_config (
  key   text primary key,
  value bigint not null check (value >= 0)
);
insert into public.economy_config (key, value) values
  ('starting_balance',     1000000),   -- saldo awal pemain baru
  ('min_transfer',         1),
  ('max_transfer',         5000000),   -- batas satu kali kirim
  ('transfer_rate_per_min', 10)        -- maksimal transfer per pemain per menit
on conflict (key) do nothing;

-- Dompet: satu per pemain. Saldo tidak boleh negatif (dijaga database, bukan hanya aplikasi).
create table if not exists public.player_wallets (
  player_id  uuid primary key references public.profiles(id) on delete cascade,
  balance    bigint not null default 0 check (balance >= 0 and balance <= 1000000000000000),
  updated_at timestamptz not null default now()
);

-- Buku besar: hanya bisa ditambah (append-only). sender_id NULL = uang masuk dari sistem; receiver_id NULL = uang keluar ke sistem/desa.
-- Tidak memakai foreign key ke profiles agar riwayat tetap utuh walau akun dihapus.
create table if not exists public.transactions (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('pembelian','penjualan','transfer','gaji','pajak','pembelian_lahan','biaya_pembangunan','pengembalian_dana','saldo_awal')),
  actor_id        uuid not null,                 -- pemain yang memulai tindakan (pemilik kunci idempotensi)
  sender_id       uuid,
  receiver_id     uuid,
  amount          bigint not null check (amount > 0),
  memo            text not null default '' check (char_length(memo) <= 100),
  status          text not null default 'selesai' check (status = 'selesai'),
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) between 1 and 64),
  created_at      timestamptz not null default clock_timestamp(),
  check (sender_id is not null or receiver_id is not null),
  check (sender_id is distinct from receiver_id)
);
-- Satu kunci hanya boleh menghasilkan satu transaksi per pemain.
create unique index if not exists transactions_actor_key_idx on public.transactions (actor_id, idempotency_key) where idempotency_key is not null;
create index if not exists transactions_sender_idx   on public.transactions (sender_id, created_at desc);
create index if not exists transactions_receiver_idx on public.transactions (receiver_id, created_at desc);

create or replace function public.forbid_ledger_change() returns trigger language plpgsql as $$
begin raise exception 'LEDGER_IMMUTABLE'; end $$;
drop trigger if exists transactions_immutable on public.transactions;
create trigger transactions_immutable before update or delete on public.transactions
  for each row execute function public.forbid_ledger_change();

alter table public.economy_config enable row level security;
alter table public.player_wallets enable row level security;
alter table public.transactions   enable row level security;
revoke all on public.economy_config, public.player_wallets, public.transactions from anon, authenticated;

-- INTI EKONOMI. Satu-satunya jalur uang berpindah. Tidak dapat dipanggil dari browser; hanya fungsi lain di database.
-- Atomik (satu transaksi database), kunci dompet berurutan agar tidak deadlock, idempotent lewat p_key.
create or replace function public.ledger_move(
  p_actor uuid, p_sender uuid, p_receiver uuid, p_amount bigint, p_kind text, p_memo text, p_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_old public.transactions; v_bal bigint; v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'AMOUNT_INVALID'; end if;
  if p_sender is null and p_receiver is null then raise exception 'ACCOUNT_INVALID'; end if;
  if p_sender is not distinct from p_receiver then raise exception 'SELF_TRANSFER'; end if;
  if p_key is not null then
    perform pg_advisory_xact_lock(hashtext('ledger:' || p_actor::text || ':' || p_key));
    select * into v_old from public.transactions where actor_id = p_actor and idempotency_key = p_key;
    if found then
      if v_old.sender_id is distinct from p_sender or v_old.receiver_id is distinct from p_receiver
         or v_old.amount <> p_amount or v_old.kind <> p_kind then raise exception 'KEY_REUSED'; end if;
      return v_old.id;   -- permintaan ulang: hasil yang sama, uang tidak dipindah lagi
    end if;
  end if;
  -- Kunci dompet yang terlibat dalam urutan id yang sama untuk semua transaksi.
  perform 1 from public.player_wallets
    where player_id = any (array_remove(array[p_sender, p_receiver], null)) order by player_id for update;
  if p_sender is not null then
    select balance into v_bal from public.player_wallets where player_id = p_sender;
    if not found then raise exception 'WALLET_MISSING'; end if;
    if v_bal < p_amount then raise exception 'INSUFFICIENT_FUNDS'; end if;
    update public.player_wallets set balance = balance - p_amount, updated_at = now() where player_id = p_sender;
  end if;
  if p_receiver is not null then
    update public.player_wallets set balance = balance + p_amount, updated_at = now() where player_id = p_receiver;
    if not found then raise exception 'WALLET_MISSING'; end if;
  end if;
  insert into public.transactions (kind, actor_id, sender_id, receiver_id, amount, memo, idempotency_key)
    values (p_kind, p_actor, p_sender, p_receiver, p_amount, coalesce(p_memo, ''), p_key) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.ledger_move(uuid, uuid, uuid, bigint, text, text, text) from public, anon, authenticated;

-- Dompet otomatis untuk setiap profil baru, lengkap dengan saldo awal (tercatat di buku besar, hanya sekali).
create or replace function public.create_wallet_for_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_start bigint;
begin
  insert into public.player_wallets (player_id, balance) values (new.id, 0) on conflict do nothing;
  select value into v_start from public.economy_config where key = 'starting_balance';
  if coalesce(v_start, 0) > 0 then
    perform public.ledger_move(new.id, null, new.id, v_start, 'saldo_awal', 'Saldo awal', 'saldo_awal');
  end if;
  return new;
end $$;
drop trigger if exists on_profile_created_wallet on public.profiles;
create trigger on_profile_created_wallet after insert on public.profiles
  for each row execute function public.create_wallet_for_profile();

-- Pemain yang sudah terdaftar sebelum migrasi ini mendapat dompet dan saldo awal.
do $$
declare r record; v_start bigint;
begin
  select value into v_start from public.economy_config where key = 'starting_balance';
  for r in select id from public.profiles loop
    insert into public.player_wallets (player_id, balance) values (r.id, 0) on conflict do nothing;
    if coalesce(v_start, 0) > 0 and not exists (select 1 from public.transactions where actor_id = r.id and idempotency_key = 'saldo_awal') then
      perform public.ledger_move(r.id, null, r.id, v_start, 'saldo_awal', 'Saldo awal', 'saldo_awal');
    end if;
  end loop;
end $$;

-- ===== Fungsi untuk pemain (dipanggil dari browser lewat RPC) =====
create or replace function public.get_wallet() returns bigint
language plpgsql security definer set search_path = '' stable as $$
declare v_uid uuid := auth.uid(); v_bal bigint;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select balance into v_bal from public.player_wallets where player_id = v_uid;
  if not found then raise exception 'WALLET_MISSING'; end if;
  return v_bal;
end $$;

create or replace function public.get_transactions(p_limit int default 30, p_before timestamptz default null)
returns table (id uuid, kind text, direction text, amount bigint, counterparty text, memo text, created_at timestamptz)
language plpgsql security definer set search_path = '' stable as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return query
    select t.id, t.kind,
           case when t.receiver_id = v_uid then 'masuk' else 'keluar' end,
           t.amount,
           coalesce(p.display_name, case when t.sender_id is null or t.receiver_id is null then 'Sistem desa' else 'Pemain dihapus' end),
           t.memo, t.created_at
    from public.transactions t
    left join public.profiles p on p.id = case when t.receiver_id = v_uid then t.sender_id else t.receiver_id end
    where (t.sender_id = v_uid or t.receiver_id = v_uid)
      and (p_before is null or t.created_at < p_before)
    order by t.created_at desc, t.id desc
    limit greatest(1, least(coalesce(p_limit, 30), 100));
end $$;

create or replace function public.get_economy_config() returns table (key text, value bigint)
language sql security definer set search_path = '' stable as $$
  select key, value from public.economy_config where auth.uid() is not null;
$$;

-- Kirim uang ke pemain lain. p_key = kunci idempotensi dari klien (uuid baru per percobaan pembayaran).
create or replace function public.transfer_money(p_to_name text, p_amount bigint, p_memo text, p_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_to uuid; v_status text; v_min bigint; v_max bigint; v_rate bigint; v_recent bigint;
  v_memo text := left(regexp_replace(coalesce(trim(p_memo), ''), '[\x00-\x1f\x7f]', '', 'g'), 100);
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'KEY_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtext('transfer:' || v_uid::text));   -- transfer satu pemain diproses berurutan
  select status into v_status from public.profiles where id = v_uid;
  if v_status is distinct from 'aktif' then raise exception 'ACCOUNT_FROZEN'; end if;
  select id into v_to from public.profiles where lower(display_name) = lower(trim(coalesce(p_to_name, ''))) and status = 'aktif';
  if v_to is null then raise exception 'RECIPIENT_NOT_FOUND'; end if;
  if v_to = v_uid then raise exception 'SELF_TRANSFER'; end if;
  select value into v_min  from public.economy_config where key = 'min_transfer';
  select value into v_max  from public.economy_config where key = 'max_transfer';
  select value into v_rate from public.economy_config where key = 'transfer_rate_per_min';
  if p_amount is null or p_amount < coalesce(v_min, 1) then raise exception 'AMOUNT_INVALID'; end if;
  if p_amount > coalesce(v_max, 0) then raise exception 'AMOUNT_TOO_LARGE'; end if;
  -- Permintaan ulang dengan kunci yang sama tidak dihitung ke batas laju (hasilnya sama, tidak ada uang bergerak).
  if not exists (select 1 from public.transactions where actor_id = v_uid and idempotency_key = p_key) then
    select count(*) into v_recent from public.transactions
      where sender_id = v_uid and kind = 'transfer' and created_at > clock_timestamp() - interval '1 minute';
    if v_recent >= coalesce(v_rate, 10) then raise exception 'RATE_LIMITED'; end if;
  end if;
  return public.ledger_move(v_uid, v_uid, v_to, p_amount, 'transfer', v_memo, p_key);
end $$;

revoke all on function public.get_wallet(), public.get_economy_config(), public.get_transactions(int, timestamptz),
  public.transfer_money(text, bigint, text, text) from public, anon;
grant execute on function public.get_wallet(), public.get_economy_config(), public.get_transactions(int, timestamptz),
  public.transfer_money(text, bigint, text, text) to authenticated;

-- Pemeriksaan kesehatan ekonomi untuk admin (jalankan manual di SQL Editor): total saldo harus sama dengan uang yang dicetak dikurangi yang dibuang.
create or replace function public.audit_economy() returns table (total_balances bigint, minted bigint, burned bigint, balanced boolean)
language sql security definer set search_path = '' stable as $$
  with w as (select coalesce(sum(balance), 0)::bigint s from public.player_wallets),
       m as (select coalesce(sum(amount) filter (where sender_id is null), 0)::bigint minted,
                    coalesce(sum(amount) filter (where receiver_id is null), 0)::bigint burned from public.transactions)
  select w.s, m.minted, m.burned, w.s = m.minted - m.burned from w, m;
$$;
revoke all on function public.audit_economy() from public, anon, authenticated;
-- Contoh pemakaian:  select * from public.audit_economy();
