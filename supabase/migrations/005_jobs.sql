-- Village Life, Phase 8: sistem pekerjaan (petani, pedagang, pekerja bangunan), inventaris, pasar.
-- Jalankan SETELAH 001-004. Supabase Dashboard > SQL Editor > New query > tempel seluruh isi > Run. Aman dijalankan ulang.

insert into public.economy_config (key, value) values
  ('job_switch_cooldown_s', 600),     -- jeda ganti pekerjaan (detik)
  ('npc_sell_daily_cap',    500000),  -- batas uang dari penjualan ke pasar per pemain per 24 jam
  ('wage_daily_cap',        300000),  -- batas upah proyek per pemain per 24 jam
  ('trader_stock_cap',      200),     -- batas stok per barang yang boleh dibeli pedagang
  ('inventory_cap_per_item', 500),    -- batas isi inventaris per barang
  ('work_pool_size',        6),       -- jumlah proyek terbuka yang selalu tersedia
  ('market_rate_per_min',   30)       -- maksimal transaksi pasar per pemain per menit
on conflict (key) do nothing;

create table if not exists public.jobs (id text primary key, name text not null, description text not null, enabled boolean not null default true);
insert into public.jobs (id, name, description) values
  ('petani', 'Petani', 'Menanam, merawat, dan memanen tanaman di lahan pertanian milik sendiri, lalu menjual hasilnya ke pasar.'),
  ('pedagang', 'Pedagang', 'Membeli barang di pasar grosir saat harga murah dan menjual saat harga tinggi.'),
  ('pekerja_bangunan', 'Pekerja Bangunan', 'Mengerjakan proyek konstruksi desa dan menerima upah setelah proyek selesai.')
on conflict (id) do update set name = excluded.name, description = excluded.description;

create table if not exists public.player_jobs (
  player_id  uuid primary key references public.profiles(id) on delete cascade,
  job_id     text references public.jobs(id),     -- NULL = tidak bekerja
  changed_at timestamptz not null default now()
);

create table if not exists public.item_catalog (
  id text primary key, name text not null, category text not null default 'hasil_panen',
  base_price bigint not null check (base_price > 0),
  volatility_pct int not null default 15 check (volatility_pct between 0 and 50),   -- naik-turun harga +/- sekian persen
  period_s int not null default 3600 check (period_s >= 60),                        -- panjang satu siklus harga (detik)
  phase real not null default 0
);
insert into public.item_catalog (id, name, base_price, volatility_pct, period_s, phase) values
  ('padi', 'Padi', 1250, 15, 3600, 0), ('jagung', 'Jagung', 1500, 18, 2700, 1.3),
  ('sayuran', 'Sayuran', 1000, 20, 1800, 2.1), ('cabai', 'Cabai', 2500, 25, 2400, 4.0)
on conflict (id) do nothing;

create table if not exists public.inventory (
  player_id uuid not null references public.profiles(id) on delete cascade,
  item_id   text not null references public.item_catalog(id),
  qty       bigint not null default 0 check (qty >= 0),
  primary key (player_id, item_id)
);

create table if not exists public.crops (
  id text primary key, item_id text not null references public.item_catalog(id), name text not null,
  seed_cost bigint not null check (seed_cost > 0), grow_s int not null check (grow_s > 0),
  care_slots int not null check (care_slots between 1 and 8), base_yield int not null check (base_yield > 0)
);
insert into public.crops (id, item_id, name, seed_cost, grow_s, care_slots, base_yield) values
  ('sayuran', 'sayuran', 'Sayuran', 6000, 180, 2, 10), ('cabai', 'cabai', 'Cabai', 9000, 300, 3, 8),
  ('jagung', 'jagung', 'Jagung', 10000, 420, 3, 15), ('padi', 'padi', 'Padi', 14000, 600, 4, 24)
on conflict (id) do nothing;

-- Tanaman yang sedang tumbuh. Satu petak (land_id, cell) hanya satu tanaman. Petak = kotak 4x4 m di lahan pertanian.
create table if not exists public.plantings (
  id uuid primary key default gen_random_uuid(),
  land_id text not null references public.land_plots(id) on delete cascade,
  cell int not null check (cell >= 0),
  crop_id text not null references public.crops(id),
  planter_id uuid,
  planted_at timestamptz not null default clock_timestamp(),
  ready_at timestamptz not null,
  care_mask int not null default 0,
  unique (land_id, cell)
);

create table if not exists public.work_templates (
  id int generated always as identity primary key, title text not null unique, duration_s int not null check (duration_s > 0),
  wage bigint not null check (wage > 0), site_x real not null, site_z real not null
);
insert into public.work_templates (title, duration_s, wage, site_x, site_z) values
  ('Perbaikan jalan desa', 60, 25000, 0, 20), ('Pasang pagar balai desa', 90, 40000, 0, -46),
  ('Perbaikan jembatan', 120, 60000, 0, 52), ('Bersihkan lapangan', 45, 18000, 18, -20),
  ('Bangun gudang pasar', 150, 80000, 20, 26), ('Perkuat tanggul sungai', 100, 50000, 30, 44),
  ('Cat ulang rumah warga', 75, 32000, -35, 10), ('Tanam pohon peneduh', 50, 20000, 10, 10)
on conflict (title) do nothing;

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(), template_id int references public.work_templates(id),
  title text not null check (char_length(title) <= 60), site_x real not null, site_z real not null,
  duration_s int not null, wage bigint not null,
  status text not null default 'terbuka' check (status in ('terbuka','dikerjakan','selesai')),
  worker_id uuid, accepted_at timestamptz, done_at timestamptz, created_at timestamptz not null default now()
);
-- Satu pekerja hanya boleh mengerjakan satu proyek pada satu waktu.
create unique index if not exists work_orders_one_active_idx on public.work_orders (worker_id) where status = 'dikerjakan';
create index if not exists work_orders_status_idx on public.work_orders (status);

alter table public.jobs enable row level security; alter table public.player_jobs enable row level security;
alter table public.item_catalog enable row level security; alter table public.inventory enable row level security;
alter table public.crops enable row level security; alter table public.plantings enable row level security;
alter table public.work_templates enable row level security; alter table public.work_orders enable row level security;
revoke all on public.jobs, public.player_jobs, public.item_catalog, public.inventory, public.crops, public.plantings,
  public.work_templates, public.work_orders from anon, authenticated;

-- Jika lahan kembali ke desa, tanaman di atasnya hilang (tidak bisa jadi hadiah gratis bagi pembeli berikutnya).
-- Jika berpindah ke pemain lain, tanaman ikut lahan.
create or replace function public.clear_plantings_on_village() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is null and old.owner_id is not null then delete from public.plantings where land_id = new.id; end if;
  return new;
end $$;
drop trigger if exists land_to_village_clears_plantings on public.land_plots;
create trigger land_to_village_clears_plantings after update of owner_id on public.land_plots
  for each row execute function public.clear_plantings_on_village();

-- ===== Fungsi internal (tidak dapat dipanggil dari browser) =====
create or replace function public._require_active(p_uid uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_uid and status = 'aktif') then raise exception 'ACCOUNT_FROZEN'; end if;
end $$;
create or replace function public._require_job(p_uid uuid, p_job text) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_active(p_uid);
  if not exists (select 1 from public.player_jobs where player_id = p_uid and job_id = p_job) then raise exception 'WRONG_JOB'; end if;
end $$;
-- Harga pasar: gelombang sinus menurut waktu server, dibulatkan per menit. Klien tidak pernah menentukan harga.
create or replace function public._market_price(p_item text, p_at timestamptz) returns bigint language sql stable security definer set search_path = '' as $$
  select greatest(1, round(i.base_price * (1 + (i.volatility_pct / 100.0) *
    sin((2 * pi() * (floor(extract(epoch from p_at) / 60) * 60)::double precision / i.period_s + i.phase)::double precision)::numeric)))::bigint
  from public.item_catalog i where i.id = p_item;
$$;
create or replace function public._inv_add(p_uid uuid, p_item text, p_qty bigint) returns void language plpgsql security definer set search_path = '' as $$
declare v_cur bigint;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'QTY_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtext('inv:' || p_uid::text));
  select qty into v_cur from public.inventory where player_id = p_uid and item_id = p_item;
  if coalesce(v_cur, 0) + p_qty > public._cfg('inventory_cap_per_item', 500) then raise exception 'INVENTORY_FULL'; end if;
  insert into public.inventory (player_id, item_id, qty) values (p_uid, p_item, p_qty)
    on conflict (player_id, item_id) do update set qty = public.inventory.qty + excluded.qty;
end $$;
create or replace function public._inv_take(p_uid uuid, p_item text, p_qty bigint) returns void language plpgsql security definer set search_path = '' as $$
declare v_cur bigint;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'QTY_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtext('inv:' || p_uid::text));
  select qty into v_cur from public.inventory where player_id = p_uid and item_id = p_item for update;
  if coalesce(v_cur, 0) < p_qty then raise exception 'NOT_ENOUGH_ITEMS'; end if;
  update public.inventory set qty = qty - p_qty where player_id = p_uid and item_id = p_item;
end $$;
create or replace function public._work_maintain() returns void language plpgsql security definer set search_path = '' as $$
declare v_open bigint; v_t public.work_templates; v_pool bigint := public._cfg('work_pool_size', 6);
begin
  perform pg_advisory_xact_lock(hashtext('work_pool'));
  update public.work_orders set status = 'terbuka', worker_id = null, accepted_at = null
    where status = 'dikerjakan' and accepted_at + make_interval(secs => duration_s * 3) < clock_timestamp();   -- ditinggalkan: dibuka lagi
  delete from public.work_orders where status = 'selesai' and done_at < clock_timestamp() - interval '7 days';
  select count(*) into v_open from public.work_orders where status = 'terbuka';
  while v_open < v_pool loop
    select * into v_t from public.work_templates order by random() limit 1;
    exit when not found;
    insert into public.work_orders (template_id, title, site_x, site_z, duration_s, wage) values (v_t.id, v_t.title, v_t.site_x, v_t.site_z, v_t.duration_s, v_t.wage);
    v_open := v_open + 1;
  end loop;
end $$;

-- ===== Pekerjaan =====
create or replace function public.get_my_job() returns table (job_id text, changed_at timestamptz, can_change_at timestamptz)
language plpgsql security definer set search_path = '' stable as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return query select pj.job_id, pj.changed_at, pj.changed_at + make_interval(secs => public._cfg('job_switch_cooldown_s', 600)::int)
    from public.player_jobs pj where pj.player_id = v_uid;
  if not found then return query select null::text, null::timestamptz, now(); end if;
end $$;

create or replace function public.choose_job(p_job_id text) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_cur public.player_jobs; v_left numeric;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform pg_advisory_xact_lock(hashtext('jobuser:' || v_uid::text));
  perform public._require_active(v_uid);
  if p_job_id is not null and not exists (select 1 from public.jobs where id = p_job_id and enabled) then raise exception 'JOB_NOT_FOUND'; end if;
  select * into v_cur from public.player_jobs where player_id = v_uid;
  if found then
    if v_cur.job_id is not distinct from p_job_id then return; end if;
    v_left := extract(epoch from (v_cur.changed_at + make_interval(secs => public._cfg('job_switch_cooldown_s', 600)::int) - clock_timestamp()));
    if v_left > 0 then raise exception 'JOB_COOLDOWN:%', ceil(v_left); end if;
  end if;
  update public.work_orders set status = 'terbuka', worker_id = null, accepted_at = null where worker_id = v_uid and status = 'dikerjakan';
  insert into public.player_jobs (player_id, job_id, changed_at) values (v_uid, p_job_id, clock_timestamp())
    on conflict (player_id) do update set job_id = excluded.job_id, changed_at = excluded.changed_at;
end $$;

-- ===== Inventaris dan katalog =====
create or replace function public.get_inventory() returns table (item_id text, name text, qty bigint)
language plpgsql security definer set search_path = '' stable as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return query select i.item_id, c.name, i.qty from public.inventory i join public.item_catalog c on c.id = i.item_id
    where i.player_id = auth.uid() and i.qty > 0 order by c.name;
end $$;
create or replace function public.get_crops() returns table (id text, item_id text, name text, seed_cost bigint, grow_s int, care_slots int, base_yield int)
language plpgsql security definer set search_path = '' stable as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return query select c.id, c.item_id, c.name, c.seed_cost, c.grow_s, c.care_slots, c.base_yield from public.crops c order by c.seed_cost;
end $$;

-- ===== Petani =====
create or replace function public.plant_crop(p_land_id text, p_cell int, p_crop_id text, p_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_land public.land_plots; v_crop public.crops; v_old public.transactions; v_memo text; v_cells int; v_tx uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'KEY_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtext('jobuser:' || v_uid::text));
  v_memo := 'Bibit ' || coalesce(p_crop_id, '') || ' ' || coalesce(p_land_id, '') || '#' || coalesce(p_cell::text, '');
  select * into v_old from public.transactions where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_old.memo <> v_memo or v_old.kind <> 'pembelian' then raise exception 'KEY_REUSED'; end if;
    return v_old.id;
  end if;
  perform public._require_job(v_uid, 'petani');
  select * into v_land from public.land_plots where id = p_land_id for share;
  if not found then raise exception 'LAND_NOT_FOUND'; end if;
  if v_land.owner_id is distinct from v_uid then raise exception 'NOT_OWNER'; end if;
  if v_land.type <> 'pertanian' then raise exception 'NOT_FARMLAND'; end if;
  v_cells := floor(v_land.w / 4)::int * floor(v_land.d / 4)::int;
  if p_cell is null or p_cell < 0 or p_cell >= v_cells then raise exception 'CELL_INVALID'; end if;
  select * into v_crop from public.crops where id = p_crop_id;
  if not found then raise exception 'CROP_NOT_FOUND'; end if;
  if exists (select 1 from public.plantings where land_id = p_land_id and cell = p_cell) then raise exception 'CELL_OCCUPIED'; end if;
  v_tx := public.ledger_move(v_uid, v_uid, null, v_crop.seed_cost, 'pembelian', v_memo, p_key);     -- bibit: uang dibakar
  insert into public.plantings (land_id, cell, crop_id, planter_id, ready_at) values (p_land_id, p_cell, p_crop_id, v_uid, clock_timestamp() + make_interval(secs => v_crop.grow_s));
  return v_tx;
exception when unique_violation then raise exception 'CELL_OCCUPIED';
end $$;

-- Perawatan: masa tumbuh dibagi sebanyak care_slots jendela. Tiap jendela boleh dirawat sekali. Semakin banyak jendela terawat, semakin besar panen (50%-100%).
create or replace function public.care_planting(p_land_id text, p_cell int) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_p public.plantings; v_slots int; v_i int; v_total numeric; v_el numeric; v_owner uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform pg_advisory_xact_lock(hashtext('jobuser:' || v_uid::text));
  perform public._require_job(v_uid, 'petani');
  select owner_id into v_owner from public.land_plots where id = p_land_id;
  if v_owner is distinct from v_uid then raise exception 'NOT_OWNER'; end if;
  select * into v_p from public.plantings where land_id = p_land_id and cell = p_cell for update;
  if not found then raise exception 'NO_PLANTING'; end if;
  if clock_timestamp() >= v_p.ready_at then raise exception 'ALREADY_READY'; end if;
  select care_slots into v_slots from public.crops where id = v_p.crop_id;
  v_total := extract(epoch from (v_p.ready_at - v_p.planted_at)); v_el := extract(epoch from (clock_timestamp() - v_p.planted_at));
  v_i := least(v_slots - 1, floor(v_el / (v_total / v_slots)))::int;
  if ((v_p.care_mask >> v_i) & 1) = 1 then raise exception 'ALREADY_CARED'; end if;
  update public.plantings set care_mask = care_mask | (1 << v_i) where id = v_p.id;
end $$;

create or replace function public.harvest_crop(p_land_id text, p_cell int) returns table (item_id text, qty int)
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_p public.plantings; v_c public.crops; v_owner uuid; v_cares int; v_y int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform pg_advisory_xact_lock(hashtext('jobuser:' || v_uid::text));
  perform public._require_job(v_uid, 'petani');
  select owner_id into v_owner from public.land_plots where id = p_land_id;
  if v_owner is distinct from v_uid then raise exception 'NOT_OWNER'; end if;
  select * into v_p from public.plantings where land_id = p_land_id and cell = p_cell for update;
  if not found then raise exception 'NO_PLANTING'; end if;
  if clock_timestamp() < v_p.ready_at then raise exception 'NOT_READY'; end if;
  select * into v_c from public.crops where id = v_p.crop_id;
  v_cares := length(replace(v_p.care_mask::bit(32)::text, '0', ''));
  v_y := greatest(1, round(v_c.base_yield * (0.5 + 0.5 * least(v_cares, v_c.care_slots)::numeric / v_c.care_slots))::int);
  perform public._inv_add(v_uid, v_c.item_id, v_y);      -- jika inventaris penuh, seluruh panen dibatalkan dan tanaman tetap ada
  delete from public.plantings where id = v_p.id;
  return query select v_c.item_id, v_y;
end $$;

create or replace function public.get_plantings() returns table (land_id text, cell int, crop_id text, is_mine boolean, progress real, ready boolean, care_due boolean, cares int, care_slots int, remaining_s int)
language plpgsql security definer set search_path = '' stable as $$
declare v_uid uuid := auth.uid(); v_now timestamptz := clock_timestamp();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return query
  select p.land_id, p.cell, p.crop_id, (l.owner_id = v_uid),
    least(1, greatest(0, extract(epoch from (v_now - p.planted_at)) / nullif(extract(epoch from (p.ready_at - p.planted_at)), 0)))::real,
    v_now >= p.ready_at,
    (l.owner_id = v_uid and v_now < p.ready_at and
      ((p.care_mask >> (least(c.care_slots - 1, floor(extract(epoch from (v_now - p.planted_at)) / (extract(epoch from (p.ready_at - p.planted_at)) / c.care_slots)))::int)) & 1) = 0),
    length(replace(p.care_mask::bit(32)::text, '0', ''))::int, c.care_slots,
    greatest(0, ceil(extract(epoch from (p.ready_at - v_now))))::int
  from public.plantings p join public.land_plots l on l.id = p.land_id join public.crops c on c.id = p.crop_id
  order by p.land_id, p.cell;
end $$;

-- ===== Pasar (pembeli/penjual NPC dengan batas harian) =====
create or replace function public.get_market() returns table (item_id text, name text, base_price bigint, price bigint, next_price bigint, held bigint)
language plpgsql security definer set search_path = '' stable as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return query select i.id, i.name, i.base_price, public._market_price(i.id, clock_timestamp()), public._market_price(i.id, clock_timestamp() + interval '10 minutes'), coalesce(v.qty, 0)
    from public.item_catalog i left join public.inventory v on v.item_id = i.id and v.player_id = v_uid order by i.name;
end $$;

create or replace function public.get_job_limits() returns table (market_sold_24h bigint, market_cap bigint, wage_24h bigint, wage_cap bigint, stock_cap bigint, inv_cap bigint)
language plpgsql security definer set search_path = '' stable as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return query select
    coalesce((select sum(t.amount) from public.transactions t where t.actor_id = v_uid and t.kind = 'penjualan' and t.memo like 'Pasar:%' and t.created_at > clock_timestamp() - interval '24 hours'), 0)::bigint,
    public._cfg('npc_sell_daily_cap', 0),
    coalesce((select sum(t.amount) from public.transactions t where t.actor_id = v_uid and t.kind = 'gaji' and t.memo like 'Upah:%' and t.created_at > clock_timestamp() - interval '24 hours'), 0)::bigint,
    public._cfg('wage_daily_cap', 0), public._cfg('trader_stock_cap', 0), public._cfg('inventory_cap_per_item', 0);
end $$;

create or replace function public.sell_item_to_market(p_item_id text, p_qty int, p_expected_unit bigint, p_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_old public.transactions; v_price bigint; v_amount bigint; v_memo text; v_sold bigint; v_recent bigint;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'KEY_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtext('jobuser:' || v_uid::text));
  v_memo := 'Pasar: jual ' || coalesce(p_qty::text, '') || ' ' || coalesce(p_item_id, '');
  select * into v_old from public.transactions where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_old.memo <> v_memo or v_old.kind <> 'penjualan' or v_old.amount <> p_expected_unit * p_qty then raise exception 'KEY_REUSED'; end if;
    return v_old.id;
  end if;
  perform public._require_active(v_uid);
  if p_qty is null or p_qty < 1 or p_qty > 1000 then raise exception 'QTY_INVALID'; end if;
  v_price := public._market_price(p_item_id, clock_timestamp());
  if v_price is null then raise exception 'ITEM_NOT_FOUND'; end if;
  if p_expected_unit is distinct from v_price then raise exception 'PRICE_CHANGED'; end if;
  v_amount := v_price * p_qty;
  select coalesce(sum(amount), 0) into v_sold from public.transactions where actor_id = v_uid and kind = 'penjualan' and memo like 'Pasar:%' and created_at > clock_timestamp() - interval '24 hours';
  if v_sold + v_amount > public._cfg('npc_sell_daily_cap', 0) then raise exception 'DAILY_CAP'; end if;
  select count(*) into v_recent from public.transactions where actor_id = v_uid and memo like 'Pasar:%' and created_at > clock_timestamp() - interval '1 minute';
  if v_recent >= public._cfg('market_rate_per_min', 30) then raise exception 'RATE_LIMITED'; end if;
  perform public._inv_take(v_uid, p_item_id, p_qty);                                                   -- stok berkurang
  return public.ledger_move(v_uid, null, v_uid, v_amount, 'penjualan', v_memo, p_key);                 -- uang masuk (batas harian di atas)
end $$;

create or replace function public.buy_item_from_market(p_item_id text, p_qty int, p_expected_unit bigint, p_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_old public.transactions; v_price bigint; v_cost bigint; v_memo text; v_held bigint; v_recent bigint;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'KEY_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtext('jobuser:' || v_uid::text));
  v_memo := 'Pasar: beli ' || coalesce(p_qty::text, '') || ' ' || coalesce(p_item_id, '');
  select * into v_old from public.transactions where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_old.memo <> v_memo or v_old.kind <> 'pembelian' or v_old.amount <> p_expected_unit * p_qty then raise exception 'KEY_REUSED'; end if;
    return v_old.id;
  end if;
  perform public._require_job(v_uid, 'pedagang');
  if p_qty is null or p_qty < 1 or p_qty > 1000 then raise exception 'QTY_INVALID'; end if;
  v_price := public._market_price(p_item_id, clock_timestamp());
  if v_price is null then raise exception 'ITEM_NOT_FOUND'; end if;
  if p_expected_unit is distinct from v_price then raise exception 'PRICE_CHANGED'; end if;
  v_cost := v_price * p_qty;
  select coalesce(qty, 0) into v_held from public.inventory where player_id = v_uid and item_id = p_item_id;
  if coalesce(v_held, 0) + p_qty > public._cfg('trader_stock_cap', 0) then raise exception 'STOCK_CAP'; end if;
  select count(*) into v_recent from public.transactions where actor_id = v_uid and memo like 'Pasar:%' and created_at > clock_timestamp() - interval '1 minute';
  if v_recent >= public._cfg('market_rate_per_min', 30) then raise exception 'RATE_LIMITED'; end if;
  perform public._inv_add(v_uid, p_item_id, p_qty);
  return public.ledger_move(v_uid, v_uid, null, v_cost, 'pembelian', v_memo, p_key);                  -- uang dibakar; jika saldo kurang semua dibatalkan
end $$;

-- ===== Pekerja bangunan =====
create or replace function public.get_work_orders() returns table (id uuid, title text, site_x real, site_z real, duration_s int, wage bigint, status text, is_mine boolean, remaining_s int)
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._work_maintain();
  return query select w.id, w.title, w.site_x, w.site_z, w.duration_s, w.wage, w.status, (w.worker_id = v_uid),
      case when w.worker_id = v_uid then greatest(0, ceil(w.duration_s - extract(epoch from (clock_timestamp() - w.accepted_at))))::int else w.duration_s end
    from public.work_orders w where w.status = 'terbuka' or (w.status = 'dikerjakan' and w.worker_id = v_uid)
    order by (w.worker_id = v_uid) desc nulls last, w.wage desc, w.created_at;
end $$;

create or replace function public.accept_work(p_order_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_o public.work_orders;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform pg_advisory_xact_lock(hashtext('jobuser:' || v_uid::text));
  perform public._require_job(v_uid, 'pekerja_bangunan');
  if exists (select 1 from public.work_orders where worker_id = v_uid and status = 'dikerjakan') then raise exception 'ACTIVE_WORK'; end if;
  select * into v_o from public.work_orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_o.status <> 'terbuka' then raise exception 'ORDER_TAKEN'; end if;
  update public.work_orders set status = 'dikerjakan', worker_id = v_uid, accepted_at = clock_timestamp() where id = p_order_id;
end $$;

create or replace function public.complete_work(p_order_id uuid, p_key text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_o public.work_orders; v_old public.transactions; v_el numeric; v_earned bigint; v_tx uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'KEY_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtext('jobuser:' || v_uid::text));
  select * into v_old from public.transactions where actor_id = v_uid and idempotency_key = p_key;
  if found then
    if v_old.kind <> 'gaji' or v_old.memo not like 'Upah:%' then raise exception 'KEY_REUSED'; end if;
    return v_old.id;
  end if;
  perform public._require_job(v_uid, 'pekerja_bangunan');
  select * into v_o from public.work_orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_o.worker_id is distinct from v_uid or v_o.status <> 'dikerjakan' then raise exception 'NOT_WORKER'; end if;
  v_el := extract(epoch from (clock_timestamp() - v_o.accepted_at));
  if v_el < v_o.duration_s then raise exception 'TOO_EARLY:%', ceil(v_o.duration_s - v_el); end if;
  select coalesce(sum(amount), 0) into v_earned from public.transactions where actor_id = v_uid and kind = 'gaji' and memo like 'Upah:%' and created_at > clock_timestamp() - interval '24 hours';
  if v_earned + v_o.wage > public._cfg('wage_daily_cap', 0) then raise exception 'DAILY_CAP'; end if;
  v_tx := public.ledger_move(v_uid, null, v_uid, v_o.wage, 'gaji', 'Upah: ' || v_o.title, p_key);
  update public.work_orders set status = 'selesai', done_at = clock_timestamp() where id = p_order_id;
  return v_tx;
end $$;

create or replace function public.abandon_work(p_order_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.work_orders set status = 'terbuka', worker_id = null, accepted_at = null where id = p_order_id and worker_id = v_uid and status = 'dikerjakan';
  if not found then raise exception 'NOT_WORKER'; end if;
end $$;

revoke all on function public._require_active(uuid), public._require_job(uuid, text), public._market_price(text, timestamptz),
  public._inv_add(uuid, text, bigint), public._inv_take(uuid, text, bigint), public._work_maintain() from public, anon, authenticated;
revoke all on function public.get_my_job(), public.choose_job(text), public.get_inventory(), public.get_crops(), public.plant_crop(text, int, text, text),
  public.care_planting(text, int), public.harvest_crop(text, int), public.get_plantings(), public.get_market(), public.get_job_limits(),
  public.sell_item_to_market(text, int, bigint, text), public.buy_item_from_market(text, int, bigint, text), public.get_work_orders(),
  public.accept_work(uuid), public.complete_work(uuid, text), public.abandon_work(uuid) from public, anon;
grant execute on function public.get_my_job(), public.choose_job(text), public.get_inventory(), public.get_crops(), public.plant_crop(text, int, text, text),
  public.care_planting(text, int), public.harvest_crop(text, int), public.get_plantings(), public.get_market(), public.get_job_limits(),
  public.sell_item_to_market(text, int, bigint, text), public.buy_item_from_market(text, int, bigint, text), public.get_work_orders(),
  public.accept_work(uuid), public.complete_work(uuid, text), public.abandon_work(uuid) to authenticated;
