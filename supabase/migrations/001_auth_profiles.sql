-- Village Life, Phase 3: akun dan profil pemain.
-- Cara pakai: Supabase Dashboard > SQL Editor > New query > tempel seluruh isi file ini > Run.
-- Aman dijalankan ulang.

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (display_name ~ '^[A-Za-z0-9_]{3,16}$'),
  role         text not null default 'penduduk' check (role in ('penduduk', 'kepala_desa')),
  status       text not null default 'aktif' check (status in ('aktif', 'dibekukan')),
  created_at   timestamptz not null default now()
);
-- Nama pemain unik tanpa membedakan huruf besar/kecil.
create unique index if not exists profiles_display_name_lower_idx on public.profiles (lower(display_name));
-- Hanya satu Kepala Desa.
create unique index if not exists profiles_single_kepala_desa_idx on public.profiles (role) where role = 'kepala_desa';

alter table public.profiles enable row level security;

drop policy if exists "profil sendiri dapat dibaca" on public.profiles;
create policy "profil sendiri dapat dibaca" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "nama sendiri dapat diubah" on public.profiles;
create policy "nama sendiri dapat diubah" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Hak akses tingkat kolom: pemain hanya boleh mengubah display_name. Role/status tidak bisa diubah dari browser.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Profil dibuat otomatis saat akun baru terdaftar. Email tidak pernah disalin ke tabel ini.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text := new.raw_user_meta_data ->> 'display_name';
begin
  if v_name is null or v_name !~ '^[A-Za-z0-9_]{3,16}$' then
    raise exception 'Nama pemain tidak valid';
  end if;
  insert into public.profiles (id, display_name) values (new.id, v_name);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Cek ketersediaan nama sebelum mendaftar.
create or replace function public.is_display_name_available(p_name text) returns boolean
language sql security definer set search_path = '' stable as $$
  select not exists (select 1 from public.profiles where lower(display_name) = lower(p_name));
$$;
revoke all on function public.is_display_name_available(text) from public;
grant execute on function public.is_display_name_available(text) to anon, authenticated;

-- Menjadikan seseorang Kepala Desa (Pak Lurah). Jalankan MANUAL di SQL Editor setelah akunnya terdaftar,
-- ganti emailnya. Tidak ada jalur dari browser untuk mengubah role.
--   update public.profiles set role = 'kepala_desa'
--   where id = (select id from auth.users where email = 'emailkamu@contoh.com');
