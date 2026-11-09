-- Village Life, Phase 4: rumah pemain. Jalankan SETELAH 001_auth_profiles.sql.
-- Supabase Dashboard > SQL Editor > New query > tempel seluruh isi file ini > Run. Aman dijalankan ulang.

-- Slot rumah di desa (data dunia). Koordinat sama dengan tata letak di game (dibuat otomatis dari layout.ts).
create table if not exists public.home_slots (
  id   text primary key,
  sort int  not null unique,   -- urutan pengisian: slot terdekat dari pusat desa diisi lebih dulu
  x    real not null,
  z    real not null
);

-- Kepemilikan rumah. PRIMARY KEY player_id = satu rumah per pemain. UNIQUE slot_id = satu slot hanya satu pemilik.
create table if not exists public.player_homes (
  player_id   uuid primary key references public.profiles(id) on delete cascade,
  slot_id     text not null unique references public.home_slots(id),
  color       text not null check (color ~ '^#[0-9a-f]{6}$'),
  assigned_at timestamptz not null default now()
);

alter table public.home_slots   enable row level security;
alter table public.player_homes enable row level security;
-- Tidak ada akses langsung dari browser. Semua lewat fungsi di bawah.
revoke all on public.home_slots   from anon, authenticated;
revoke all on public.player_homes from anon, authenticated;

insert into public.home_slots (id, sort, x, z) values
  ('R-10', 1, -26, -2),
  ('R-06', 2, -26, -14),
  ('R-14', 3, -26, 22),
  ('R-02', 4, -26, -26),
  ('R-18', 5, -26, 34),
  ('R-09', 6, -44, -2),
  ('R-05', 7, -44, -14),
  ('R-13', 8, -44, 22),
  ('R-01', 9, -44, -26),
  ('R-17', 10, -44, 34),
  ('R-11', 11, -56, -2),
  ('R-07', 12, -56, -14),
  ('R-15', 13, -56, 22),
  ('R-03', 14, -56, -26),
  ('R-19', 15, -56, 34),
  ('R-12', 16, -74, -2),
  ('R-08', 17, -74, -14),
  ('R-16', 18, -74, 22),
  ('R-04', 19, -74, -26),
  ('R-20', 20, -74, 34)
on conflict (id) do update set sort = excluded.sort, x = excluded.x, z = excluded.z;

-- Memberi rumah ke pemain yang sedang login. Idempotent: jika sudah punya, mengembalikan rumah yang sama.
-- Aman untuk pendaftaran bersamaan: kunci per pemain + FOR UPDATE SKIP LOCKED + UNIQUE sebagai pengaman terakhir.
create or replace function public.claim_home() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_slot  text;
  v_tries int := 0;
  v_colors text[] := array['#e7c9a0','#c97b63','#9fb9d6','#e0c36a','#b5d19a','#d8a6c4'];
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform pg_advisory_xact_lock(hashtext('claim_home:' || v_uid::text));
  if not exists (select 1 from public.profiles where id = v_uid and status = 'aktif') then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
  select slot_id into v_slot from public.player_homes where player_id = v_uid;
  if found then return v_slot; end if;
  loop
    v_tries := v_tries + 1;
    select s.id into v_slot from public.home_slots s
      where not exists (select 1 from public.player_homes h where h.slot_id = s.id)
      order by s.sort for update skip locked limit 1;
    if v_slot is null then
      -- Kosong karena penuh, atau karena semua slot kosong sedang dikunci transaksi lain?
      if v_tries < 20 and exists (select 1 from public.home_slots s where not exists (select 1 from public.player_homes h where h.slot_id = s.id)) then
        perform pg_sleep(0.05);
        continue;
      end if;
      raise exception 'VILLAGE_FULL';
    end if;
    begin
      insert into public.player_homes (player_id, slot_id, color)
        values (v_uid, v_slot, v_colors[1 + abs(hashtext(v_uid::text)) % array_length(v_colors, 1)]);
      return v_slot;
    exception when unique_violation then
      select slot_id into v_slot from public.player_homes where player_id = v_uid;
      if found then return v_slot; end if;
      if v_tries >= 20 then raise; end if;
    end;
  end loop;
end $$;
revoke all on function public.claim_home() from public, anon;
grant execute on function public.claim_home() to authenticated;

-- Daftar semua rumah yang sudah dimiliki (untuk digambar di dunia). Tidak membocorkan email atau ID pemain.
create or replace function public.get_homes() returns table (slot_id text, owner_name text, color text, is_mine boolean)
language sql security definer set search_path = '' stable as $$
  select h.slot_id, p.display_name, h.color, h.player_id = auth.uid()
  from public.player_homes h join public.profiles p on p.id = h.player_id
  where auth.uid() is not null;
$$;
revoke all on function public.get_homes() from public, anon;
grant execute on function public.get_homes() to authenticated;
