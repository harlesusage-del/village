Village Life - Phase 2

Cara paling mudah: buka file dist/index.html atau Village-Life-Phase1.html dengan klik dua kali di Chrome atau Firefox.

Untuk mengembangkan: pasang Node.js, lalu di folder ini jalankan npm install dan npm run dev, atau ./jalankan.sh
Setelah mengubah kode, jalankan npm run build untuk membuat ulang dist/index.html

Phase 3 (akun): jalankan supabase/migrations/001_auth_profiles.sql di Supabase SQL Editor, lalu isi Project URL dan anon key
di layar awal game, atau salin .env.example menjadi .env.local. Jangan pernah memakai service_role key di sini.

Phase 4 (rumah): jalankan supabase/migrations/002_player_homes.sql SETELAH 001. Setiap pemain otomatis mendapat satu rumah (20 slot, R-01..R-20)
dan muncul di depan rumahnya setiap login. Tes: npx tsx tests/world.test.ts dan npx tsx tests/auth.test.ts

Phase 5 (multiplayer): ada DUA program yang harus berjalan bersamaan.
  1) Game server:  ./jalankan-server.sh   (folder gameserver, port 2567, isi gameserver/.env dari .env.example)
  2) Game (klien): ./jalankan.sh           (buka http://localhost:5173)
KUNCI RAHASIA: SUPABASE_SERVICE_ROLE_KEY hanya boleh ada di gameserver/.env. Jangan taruh di folder game (klien), jangan diunggah ke GitHub, jangan dikirim ke siapa pun.
Tes otomatis (di folder gameserver): npx tsx test/multiplayer.test.ts, test/client-net.test.ts, test/auth-server.test.ts
Produksi: situs https harus memakai server wss:// (bukan ws://). Atur alamat server lewat VITE_GAME_SERVER_URL saat build, atau ?server=wss://alamat di URL.

Phase 6 (ekonomi): jalankan supabase/migrations/003_economy.sql SETELAH 001 dan 002. Pemain lama otomatis mendapat dompet dan saldo awal.
Atur parameter ekonomi (tanpa mengubah kode) di SQL Editor, contoh: update public.economy_config set value = 2000000 where key = 'starting_balance';
Pemeriksaan kesehatan ekonomi (admin): select * from public.audit_economy();   -> kolom balanced harus true.
Tes SQL di PostgreSQL asli: bash tests/sql/economy-tests.sh (butuh PostgreSQL lokal + tests/supabase-stub.sql). Tes klien: npx tsx tests/economy.test.ts

Phase 7 (lahan): jalankan supabase/migrations/004_land.sql SETELAH 001-003. Katalog 37 lahan dibuat otomatis dari tata letak desa.
Atur harga dan aturan tanpa mengubah kode (SQL Editor), contoh:
  update public.land_plots set base_price = 900000 where id = 'P-01';
  update public.economy_config set value = 0 where key = 'village_buyback_pct';   -- matikan jual ke desa
  update public.economy_config set value = 5 where key = 'max_lands_per_player';
Tes SQL: bash tests/sql/land-tests.sh. Tes klien: npx tsx tests/land.test.ts dan tests/layout.test.ts

Phase 8 (pekerjaan): jalankan supabase/migrations/005_jobs.sql SETELAH 001-004. Tiga pekerjaan: petani, pedagang, pekerja bangunan.
Atur keseimbangan tanpa mengubah kode (SQL Editor), contoh:
  update public.crops set grow_s = 60 where id = 'padi';                          -- percepat tanam (detik)
  update public.economy_config set value = 1000000 where key = 'npc_sell_daily_cap';   -- batas uang dari penjualan ke pasar / 24 jam
  update public.economy_config set value = 300000 where key = 'wage_daily_cap';        -- batas upah proyek / 24 jam
  update public.work_templates set wage = 30000 where title = 'Perbaikan jalan desa';
Tes SQL: bash tests/sql/jobs-tests.sh. Tes klien: npx tsx tests/jobs.test.ts
Catatan: aksi pekerjaan belum mewajibkan pemain berada di lokasi (server pemain belum terhubung ke aksi database); batas waktu, kepemilikan, dan batas harian sudah dijaga database.
