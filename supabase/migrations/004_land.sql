-- Village Life, Phase 7: sistem lahan. Jalankan SETELAH 001, 002, dan 003.
-- Supabase Dashboard > SQL Editor > New query > tempel seluruh isi file ini > Run. Aman dijalankan ulang.

-- Parameter lahan (dapat diubah admin tanpa mengubah kode game).
insert into public.economy_config (key, value) values
  ('village_buyback_pct',     70),   -- desa membeli kembali lahan pemain seharga % dari harga dasar. 0 = fitur dimatikan.
  ('max_lands_per_player',    10),   -- batas jumlah lahan (di luar rumah) per pemain, mencegah penimbunan
  ('land_rate_per_min',        5),   -- maksimal pembelian lahan per pemain per menit
  ('max_listing_multiplier',  10)    -- harga jual ke pemain lain maksimal sekian kali harga dasar
on conflict (key) do nothing;

-- Katalog lahan. owner_id NULL = milik desa. Lahan rumah dikelola sistem rumah (Phase 4) dan tidak dijual.
create table if not exists public.land_plots (
  id               text primary key,
  type             text not null check (type in ('rumah','perdagangan','usaha','pertanian','perkebunan','peternakan','kosong')),
  x real not null, z real not null, w real not null, d real not null,
  base_price       bigint not null check (base_price >= 0),
  owner_id         uuid references public.profiles(id) on delete set null,   -- akun dihapus -> lahan kembali ke desa
  listed_price     bigint check (listed_price is null or listed_price > 0),   -- harga jika dijual ke pemain lain
  purchased_at     timestamptz,
  restricted       boolean not null default false,   -- penggunaan dibatasi: tidak boleh dijual
  disputed         boolean not null default false,   -- sedang sengketa
  build_obligation boolean not null default false,   -- ada kewajiban pembangunan yang belum selesai
  check (listed_price is null or owner_id is not null)
);
create index if not exists land_plots_owner_idx on public.land_plots (owner_id);

-- Riwayat kepemilikan (hanya bisa ditambah).
create table if not exists public.land_ownership (
  id         bigint generated always as identity primary key,
  land_id    text not null references public.land_plots(id),
  from_id    uuid,
  to_id      uuid,
  price      bigint not null check (price >= 0),
  kind       text not null check (kind in ('beli_dari_desa','beli_dari_pemain','jual_ke_desa')),
  tx_id      uuid,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists land_ownership_land_idx on public.land_ownership (land_id, created_at desc);
drop trigger if exists land_ownership_immutable on public.land_ownership;
create trigger land_ownership_immutable before update or delete on public.land_ownership
  for each row execute function public.forbid_ledger_change();

alter table public.land_plots     enable row level security;
alter table public.land_ownership enable row level security;
revoke all on public.land_plots, public.land_ownership from anon, authenticated;

insert into public.land_plots (id, type, x, z, w, d, base_price, restricted) values
  ('R-01', 'rumah', -44, -26, 10, 10, 400000, true),
  ('R-02', 'rumah', -26, -26, 10, 10, 400000, true),
  ('R-03', 'rumah', -56, -26, 10, 10, 400000, true),
  ('R-04', 'rumah', -74, -26, 10, 10, 400000, true),
  ('R-05', 'rumah', -44, -14, 10, 10, 400000, true),
  ('R-06', 'rumah', -26, -14, 10, 10, 400000, true),
  ('R-07', 'rumah', -56, -14, 10, 10, 400000, true),
  ('R-08', 'rumah', -74, -14, 10, 10, 400000, true),
  ('R-09', 'rumah', -44, -2, 10, 10, 400000, true),
  ('R-10', 'rumah', -26, -2, 10, 10, 400000, true),
  ('R-11', 'rumah', -56, -2, 10, 10, 400000, true),
  ('R-12', 'rumah', -74, -2, 10, 10, 400000, true),
  ('R-13', 'rumah', -44, 22, 10, 10, 400000, true),
  ('R-14', 'rumah', -26, 22, 10, 10, 400000, true),
  ('R-15', 'rumah', -56, 22, 10, 10, 400000, true),
  ('R-16', 'rumah', -74, 22, 10, 10, 400000, true),
  ('R-17', 'rumah', -44, 34, 10, 10, 400000, true),
  ('R-18', 'rumah', -26, 34, 10, 10, 400000, true),
  ('R-19', 'rumah', -56, 34, 10, 10, 400000, true),
  ('R-20', 'rumah', -74, 34, 10, 10, 400000, true),
  ('D-01', 'perdagangan', -12, 22, 10, 10, 1200000, true),
  ('D-02', 'perdagangan', -12, 34, 10, 10, 1200000, false),
  ('P-01', 'pertanian', 44, 28, 12, 12, 720000, false),
  ('P-02', 'pertanian', 58, 28, 12, 12, 720000, false),
  ('D-03', 'perdagangan', -19, -45, 10, 10, 1200000, false),
  ('D-04', 'perdagangan', 19, -45, 10, 10, 1200000, false),
  ('U-01', 'usaha', -31, -45, 10, 10, 900000, false),
  ('U-02', 'usaha', 31, -45, 10, 10, 900000, false),
  ('K-01', 'perkebunan', 36, -58, 14, 10, 630000, false),
  ('K-02', 'perkebunan', 51, -58, 14, 10, 630000, false),
  ('K-03', 'perkebunan', 28, -70, 14, 10, 630000, false),
  ('T-01', 'peternakan', -55, -50, 16, 12, 768000, false),
  ('T-02', 'peternakan', -42, -62, 16, 12, 768000, false),
  ('L-01', 'kosong', 13, -66, 12, 12, 432000, false),
  ('P-03', 'pertanian', 72, 28, 12, 12, 720000, false),
  ('P-04', 'pertanian', 44, 39, 12, 10, 600000, false),
  ('P-05', 'pertanian', 58, 39, 12, 10, 600000, false)
on conflict (id) do update set type = excluded.type, x = excluded.x, z = excluded.z, w = excluded.w, d = excluded.d, restricted = excluded.restricted;
-- Catatan: harga dasar sengaja tidak ditimpa saat dijalankan ulang. Ubah harga dengan: update public.land_plots set base_price = ... where id = '...';

create or replace function public._cfg(p_key text, p_default bigint) returns bigint
language sql security definer set search_path = '' stable as $$
  select coalesce((select value from public.economy_config where key = p_key), p_default);
$$;
revoke all on function public._cfg(text, bigint) from public, anon, authenticated;

-- Peta lahan untuk pemain yang login. Pemilik lahan rumah diambil dari data rumah (Phase 4).
create or replace function public.get_lands() returns table (
  id text, type text, x real, z real, w real, d real, base_price bigint, owner_name text, is_mine boolean,
  listed_price bigint, status text, restricted boolean, disputed boolean, build_obligation boolean, buy_price bigint, sell_price bigint)
language plpgsql security definer set search_path = '' stable as $$
declare v_uid uuid := auth.uid(); v_pct bigint;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  v_pct := public._cfg('village_buyback_pct', 0);
  return query
  with ow as (
    select l.id as lid,
           coalesce(po.display_name, hp.display_name) as oname,
           (l.owner_id = v_uid or hp.player_id = v_uid) as mine
    from public.land_plots l
    left join public.profiles po on po.id = l.owner_id
    left join (select h.slot_id, h.player_id, p.display_name from public.player_homes h join public.profiles p on p.id = h.player_id) hp
           on hp.slot_id = l.id and l.type = 'rumah'
  )
  select l.id, l.type, l.x, l.z, l.w, l.d, l.base_price, ow.oname, coalesce(ow.mine, false), l.listed_price,
    case when coalesce(ow.mine, false) then 'milik_saya'
         when l.restricted or l.disputed then (case when ow.oname is not null then 'dimiliki' else 'tidak_dijual' end)
         when l.owner_id is null then 'desa'
         when l.listed_price is not null then 'dijual'
         else 'dimiliki' end,
    l.restricted, l.disputed, l.build_obligation,
    case when coalesce(ow.mine, false) or l.restricted or l.disputed then null
         when l.owner_id is null then l.base_price
         else l.listed_price end,
    case when l.owner_id = v_uid and not l.restricted and not l.disputed and not l.build_obligation and v_pct > 0
         then (l.base_price * v_pct) / 100 else null end
  from public.land_plots l join ow on ow.lid = l.id
  order by l.id;
end $$;

-- Beli lahan dari desa atau dari pemain yang mendaftarkannya dijual.
-- p_expected_price = harga yang dilihat pembeli. Server memakai harga dari tabel; jika beda, dibatalkan (PRICE_CHANGED).
create or replace function public.buy_land(p_land_id text, p_expected_price bigint, p_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_land public.land_plots; v_old public.transactions; v_price bigint; v_seller uuid;
  v_status text; v_count bigint; v_recent bigint; v_tx uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'KEY_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtext('landuser:' || v_uid::text));       -- pembelian satu pemain berurutan
  select * into v_old from public.transactions where actor_id = v_uid and idempotency_key = p_key;
  if found then                                                                -- permintaan ulang: hasil sama, tidak ada perubahan
    if v_old.kind <> 'pembelian_lahan' or v_old.memo <> 'Lahan ' || p_land_id or v_old.amount <> p_expected_price then raise exception 'KEY_REUSED'; end if;
    return v_old.id;
  end if;
  select status into v_status from public.profiles where id = v_uid;
  if v_status is distinct from 'aktif' then raise exception 'ACCOUNT_FROZEN'; end if;
  perform pg_advisory_xact_lock(hashtext('land:' || p_land_id));             -- satu lahan diproses satu per satu
  select * into v_land from public.land_plots where id = p_land_id for update;
  if not found then raise exception 'LAND_NOT_FOUND'; end if;
  if v_land.restricted or v_land.type = 'rumah' or v_land.disputed then raise exception 'LAND_NOT_FOR_SALE'; end if;
  if v_land.owner_id = v_uid then raise exception 'ALREADY_OWNER'; end if;
  if v_land.owner_id is null then v_price := v_land.base_price; v_seller := null;
  elsif v_land.listed_price is not null then v_price := v_land.listed_price; v_seller := v_land.owner_id;
  else raise exception 'LAND_NOT_FOR_SALE'; end if;
  if v_price <= 0 then raise exception 'LAND_NOT_FOR_SALE'; end if;
  if p_expected_price is distinct from v_price then raise exception 'PRICE_CHANGED'; end if;
  select count(*) into v_count from public.land_plots where owner_id = v_uid;
  if v_count >= public._cfg('max_lands_per_player', 10) then raise exception 'LAND_LIMIT'; end if;
  select count(*) into v_recent from public.transactions
    where actor_id = v_uid and kind = 'pembelian_lahan' and created_at > clock_timestamp() - interval '1 minute';
  if v_recent >= public._cfg('land_rate_per_min', 5) then raise exception 'RATE_LIMITED'; end if;
  -- Potong uang dan bayar penjual (atau desa). Jika saldo kurang, seluruh fungsi dibatalkan: lahan tidak berpindah.
  v_tx := public.ledger_move(v_uid, v_uid, v_seller, v_price, 'pembelian_lahan', 'Lahan ' || p_land_id, p_key);
  update public.land_plots set owner_id = v_uid, listed_price = null, purchased_at = now() where id = p_land_id;
  insert into public.land_ownership (land_id, from_id, to_id, price, kind, tx_id)
    values (p_land_id, v_seller, v_uid, v_price, case when v_seller is null then 'beli_dari_desa' else 'beli_dari_pemain' end, v_tx);
  return v_tx;
end $$;

-- Jual lahan kembali ke desa (jika village_buyback_pct > 0).
create or replace function public.sell_land_to_village(p_land_id text, p_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_land public.land_plots; v_old public.transactions; v_pct bigint; v_price bigint; v_status text; v_tx uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'KEY_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtext('landuser:' || v_uid::text));
  select * into v_old from public.transactions where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_old.kind <> 'penjualan' or v_old.memo <> 'Jual lahan ' || p_land_id then raise exception 'KEY_REUSED'; end if;
    return v_old.id;
  end if;
  select status into v_status from public.profiles where id = v_uid;
  if v_status is distinct from 'aktif' then raise exception 'ACCOUNT_FROZEN'; end if;
  perform pg_advisory_xact_lock(hashtext('land:' || p_land_id));
  select * into v_land from public.land_plots where id = p_land_id for update;
  if not found then raise exception 'LAND_NOT_FOUND'; end if;
  if v_land.owner_id is distinct from v_uid then raise exception 'NOT_OWNER'; end if;
  if v_land.restricted then raise exception 'LAND_RESTRICTED'; end if;
  if v_land.disputed then raise exception 'LAND_DISPUTED'; end if;
  if v_land.build_obligation then raise exception 'BUILD_OBLIGATION'; end if;
  v_pct := public._cfg('village_buyback_pct', 0);
  v_price := (v_land.base_price * v_pct) / 100;
  if v_pct <= 0 or v_price <= 0 then raise exception 'BUYBACK_DISABLED'; end if;
  v_tx := public.ledger_move(v_uid, null, v_uid, v_price, 'penjualan', 'Jual lahan ' || p_land_id, p_key);
  update public.land_plots set owner_id = null, listed_price = null, purchased_at = null where id = p_land_id;
  insert into public.land_ownership (land_id, from_id, to_id, price, kind, tx_id) values (p_land_id, v_uid, null, v_price, 'jual_ke_desa', v_tx);
  return v_tx;
end $$;

-- Daftarkan lahan dijual ke pemain lain dengan harga tertentu, atau batalkan (p_price = null).
create or replace function public.set_land_listing(p_land_id text, p_price bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_land public.land_plots; v_status text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform pg_advisory_xact_lock(hashtext('landuser:' || v_uid::text));
  select status into v_status from public.profiles where id = v_uid;
  if v_status is distinct from 'aktif' then raise exception 'ACCOUNT_FROZEN'; end if;
  perform pg_advisory_xact_lock(hashtext('land:' || p_land_id));
  select * into v_land from public.land_plots where id = p_land_id for update;
  if not found then raise exception 'LAND_NOT_FOUND'; end if;
  if v_land.owner_id is distinct from v_uid then raise exception 'NOT_OWNER'; end if;
  if p_price is null then update public.land_plots set listed_price = null where id = p_land_id; return; end if;
  if v_land.restricted then raise exception 'LAND_RESTRICTED'; end if;
  if v_land.disputed then raise exception 'LAND_DISPUTED'; end if;
  if v_land.build_obligation then raise exception 'BUILD_OBLIGATION'; end if;
  if p_price < 1 or p_price > greatest(v_land.base_price, 1) * public._cfg('max_listing_multiplier', 10) then raise exception 'LISTING_PRICE_INVALID'; end if;
  update public.land_plots set listed_price = p_price where id = p_land_id;
end $$;

revoke all on function public.get_lands(), public.buy_land(text, bigint, text), public.sell_land_to_village(text, text),
  public.set_land_listing(text, bigint) from public, anon;
grant execute on function public.get_lands(), public.buy_land(text, bigint, text), public.sell_land_to_village(text, text),
  public.set_land_listing(text, bigint) to authenticated;
