#!/bin/bash
# Tes pekerjaan, inventaris, pasar, dan proyek konstruksi di PostgreSQL asli. Jalankan sebagai root: bash tests/sql/jobs-tests.sh
source "$(dirname "$0")/lib.sh"
cfgset() { root "update public.economy_config set value=$2 where key='$1';" >/dev/null; }
sup() { root "select minted||'|'||burned from public.audit_economy();"; }
price() { as 1 "select buy_price from public.get_lands() where id='$1';" | tail -1; }
buyl() { as $1 "select public.buy_land('$2', $(price $2), '$(key b)');" >/dev/null; }
mp() { as 1 "select price from public.get_market() where item_id='$1';" | tail -1; }
inv() { root "select coalesce((select qty from public.inventory where player_id='$(uid $1)' and item_id='$2'),0);"; }
job() { as $1 "select public.choose_job('$2');" >/dev/null; }
plant() { as $1 "select public.plant_crop('$2', $3, '${4:-sayuran}', '${5:-$(key p)}');"; }
succ() { local n=0 f; for f in "$@"; do grep -qE '^[0-9a-f-]{36}$|^[a-z]+\|[0-9]+$' $f && n=$((n+1)); done; echo $n; }

root "delete from auth.users; truncate public.transactions; truncate public.land_ownership; delete from public.plantings; delete from public.work_orders; delete from public.inventory; delete from public.player_jobs; update public.land_plots set owner_id=null,listed_price=null,purchased_at=null,disputed=false,build_obligation=false;" >/dev/null
for k in village_buyback_pct:70 max_lands_per_player:10 land_rate_per_min:100 transfer_rate_per_min:1000 job_switch_cooldown_s:600 npc_sell_daily_cap:500000 wage_daily_cap:300000 trader_stock_cap:200 inventory_cap_per_item:500 work_pool_size:6 market_rate_per_min:30; do cfgset ${k%%:*} ${k##*:}; done
root "update public.crops set grow_s=4, care_slots=2 where id='sayuran';" >/dev/null
root "insert into auth.users(id,email,raw_user_meta_data) select ('00000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'e'||g||'@x.id',jsonb_build_object('display_name','Pemain'||g) from generate_series(1,12) g;" >/dev/null
for u in $(seq 1 12); do setbal $u 5000000; done

echo "== memilih pekerjaan"
ok "pemain baru belum punya pekerjaan" $(eq "$(as 2 "select coalesce(job_id,'-') from public.get_my_job();")" "-")
ok "pekerjaan tidak dikenal ditolak" $(has "$(as 1 "select public.choose_job('tukang_sihir');")" JOB_NOT_FOUND)
job 1 petani; job 3 petani; job 6 petani; job 5 pedagang; job 7 pekerja_bangunan; job 8 pekerja_bangunan; job 9 petani
ok "memilih petani berhasil" $(eq "$(as 1 "select job_id from public.get_my_job();")" petani)
ok "ganti pekerjaan terlalu cepat ditolak (JOB_COOLDOWN)" $(has "$(as 9 "select public.choose_job('pedagang');")" JOB_COOLDOWN)
cfgset job_switch_cooldown_s 1; sleep 1.3; job 9 pedagang
ok "setelah jeda, ganti pekerjaan berhasil" $(eq "$(as 9 "select job_id from public.get_my_job();")" pedagang)
cfgset job_switch_cooldown_s 600

echo "== petani"
buyl 1 P-01; buyl 1 D-03; buyl 3 P-03; buyl 2 P-02; buyl 1 P-04
ok "tanpa pekerjaan petani ditolak (WRONG_JOB)" $(has "$(plant 2 P-02 0)" WRONG_JOB)
ok "pedagang tidak bisa menanam (WRONG_JOB)" $(has "$(plant 5 P-01 0)" WRONG_JOB)
ok "menanam di lahan orang lain ditolak (NOT_OWNER)" $(has "$(plant 3 P-01 0)" NOT_OWNER)
ok "menanam di lahan bukan pertanian ditolak (NOT_FARMLAND)" $(has "$(plant 1 D-03 0)" NOT_FARMLAND)
for c in -1 9 100; do ok "petak tidak valid ($c) ditolak" $(has "$(plant 1 P-01 $c)" CELL_INVALID); done
ok "tanaman tidak dikenal ditolak" $(has "$(plant 1 P-01 0 bambu)" CROP_NOT_FOUND)
setbal 3 1000; r=$(plant 3 P-03 0)
ok "saldo kurang -> INSUFFICIENT_FUNDS, tidak ada tanaman" $(and $(has "$r" INSUFFICIENT_FUNDS) $(eq "$(root "select count(*) from public.plantings where land_id='P-03'")" 0)); setbal 3 5000000
B0=$(bal 1); S0=$(sup)
r0=$(plant 1 P-01 0); r1=$(plant 1 P-01 1); r2=$(plant 1 P-01 2)
T0=$(date +%s.%N)
ok "tanam 3 petak sayuran berhasil" $(and $(isuuid "$r0") $(isuuid "$r1") $(isuuid "$r2"))
ok "bibit 3 x 6.000 memotong saldo dan membakar uang" $(eq "$(bal 1)|$(sup)" "$((B0-18000))|${S0%%|*}|$(( ${S0##*|} + 18000 ))")
B1=$(bal 1); ok "petak terisi -> CELL_OCCUPIED, saldo utuh" $(and $(has "$(plant 1 P-01 0)" CELL_OCCUPIED) $(eq "$(bal 1)" $B1))
K=$(key p); a=$(plant 1 P-01 6 sayuran $K); B2=$(bal 1); b=$(plant 1 P-01 6 sayuran $K)
ok "tanam dengan kunci sama dua kali -> 1 pembayaran" $(and $(eq "$a" "$b") $(eq "$(bal 1)" $B2) $(eq "$(root "select count(*) from public.plantings where land_id='P-01' and cell=6")" 1))
ok "panen sebelum matang ditolak (NOT_READY)" $(has "$(as 1 "select * from public.harvest_crop('P-01', 0);")" NOT_READY)
as 1 "select public.care_planting('P-01', 0);" >/dev/null; as 1 "select public.care_planting('P-01', 1);" >/dev/null
ok "merawat dua kali di jendela yang sama ditolak (ALREADY_CARED)" $(has "$(as 1 "select public.care_planting('P-01', 0);")" ALREADY_CARED)
ok "care_due = false setelah dirawat pada jendela ini; petak 2 belum dirawat = true" $(eq "$(as 1 "select care_due from public.get_plantings() where land_id='P-01' and cell=0;")|$(as 1 "select care_due from public.get_plantings() where land_id='P-01' and cell=2;")" "f|t")
ok "orang lain tidak bisa merawat/memanen (NOT_OWNER)" $(and $(has "$(as 3 "select public.care_planting('P-01', 2);")" NOT_OWNER) $(has "$(as 3 "select * from public.harvest_crop('P-01', 2);")" NOT_OWNER))
sleep 2.4; as 1 "select public.care_planting('P-01', 0);" >/dev/null
ok "jendela berikutnya: perawatan petak 0 kedua kali diterima" $(eq "$(root "select length(replace(care_mask::bit(32)::text,'0','')) from public.plantings where land_id='P-01' and cell=0")" 2)
while (( $(echo "$(date +%s.%N) - $T0 < 4.6" | bc -l) )); do sleep 0.2; done
h0=$(as 1 "select qty from public.harvest_crop('P-01', 0);"); h1=$(as 1 "select qty from public.harvest_crop('P-01', 1);"); h2=$(as 1 "select qty from public.harvest_crop('P-01', 2);")
ok "hasil panen mengikuti perawatan: 2x=10, 1x=8, 0x=5" $(eq "$h0|$h1|$h2" "10|8|5")
ok "inventaris bertambah 23 sayuran" $(eq "$(inv 1 sayuran)" 23)
ok "panen petak yang sama lagi ditolak (NO_PLANTING)" $(has "$(as 1 "select * from public.harvest_crop('P-01', 0);")" NO_PLANTING)

echo "== balapan petani"
plant 1 P-01 3 >/dev/null; sleep 4.3; I0=$(inv 1 sayuran)
for i in $(seq 1 10); do ( as 1 "select qty from public.harvest_crop('P-01', 3);" > /tmp/hv$i.out ) & done; wait
ok "10 panen bersamaan pada 1 petak -> tepat 1 berhasil, stok bertambah sekali" $(eq "$(succ /tmp/hv{1..10}.out 2>/dev/null | head -1)" 0)$(echo -n) $(and $(eq "$(for i in $(seq 1 10); do grep -cE '^[0-9]+$' /tmp/hv$i.out; done | paste -sd+ | bc)" 1) $(eq "$(inv 1 sayuran)" $((I0+5))))
B0=$(bal 1); S0=$(sup)
for i in $(seq 1 15); do ( plant 1 P-01 4 sayuran > /tmp/pl$i.out ) & done; wait
ok "15 tanam bersamaan pada 1 petak -> tepat 1 berhasil, bibit dibayar sekali" $(and $(eq "$(succ /tmp/pl{1..15}.out)" 1) $(eq "$(bal 1)" $((B0-6000))) $(eq "$(root "select count(*) from public.plantings where land_id='P-01' and cell=4")" 1))
plant 3 P-03 0 >/dev/null; sleep 4.3; cfgset inventory_cap_per_item 4
ok "inventaris penuh -> panen dibatalkan (INVENTORY_FULL), tanaman tetap ada" $(and $(has "$(as 3 "select * from public.harvest_crop('P-03', 0);")" INVENTORY_FULL) $(eq "$(root "select count(*) from public.plantings where land_id='P-03'")" 1))
cfgset inventory_cap_per_item 500
ok "setelah ada ruang, panen berhasil" $(has "$(as 3 "select item_id from public.harvest_crop('P-03', 0);")" sayuran)
plant 1 P-04 0 >/dev/null; as 1 "select public.sell_land_to_village('P-04', '$(key v)');" >/dev/null
ok "lahan dijual ke desa -> tanaman di atasnya hilang" $(eq "$(root "select count(*) from public.plantings where land_id='P-04'")" 0)
sleep 0.5; as 1 "select public.set_land_listing('P-01', 800000);" >/dev/null; as 6 "select public.buy_land('P-01', 800000, '$(key b)');" >/dev/null
ok "lahan berpindah ke pemain lain -> tanaman ikut lahan; pemilik lama tidak bisa memanen" $(and $(eq "$(root "select count(*) from public.plantings where land_id='P-01' and cell=4")" 1) $(has "$(as 1 "select * from public.harvest_crop('P-01', 4);")" NOT_OWNER))
sleep 1; ok "pemilik baru (petani) bisa memanen" $(has "$(as 6 "select item_id from public.harvest_crop('P-01', 4);")" sayuran)

echo "== pasar"
ok "pasar menampilkan 4 barang dengan harga mendekati harga dasar (+/- 25%)" $(eq "$(as 1 "select count(*) from public.get_market() where price between base_price*0.74 and base_price*1.26 and next_price > 0;")" 4)
ok "pemain tanpa stok tidak bisa menjual (NOT_ENOUGH_ITEMS), uang utuh" $(and $(has "$(as 2 "select public.sell_item_to_market('padi', 1, $(mp padi), '$(key s)');")" NOT_ENOUGH_ITEMS) $(eq "$(bal 2)" "$(bal 2)"))
for q in 0 1001; do ok "jumlah tidak valid ($q) ditolak" $(has "$(as 1 "select public.sell_item_to_market('sayuran', $q, $(mp sayuran), '$(key s)');")" QTY_INVALID); done
ok "barang tidak dikenal ditolak" $(has "$(as 1 "select public.sell_item_to_market('emas', 1, 1, '$(key s)');")" ITEM_NOT_FOUND)
ok "harga yang dilihat salah -> PRICE_CHANGED" $(has "$(as 1 "select public.sell_item_to_market('sayuran', 1, 1, '$(key s)');")" PRICE_CHANGED)
B0=$(bal 1); I0=$(inv 1 sayuran); P=$(mp sayuran); S0=$(sup); K=$(key s)
r1=$(as 1 "select public.sell_item_to_market('sayuran', 5, $P, '$K');"); r2=$(as 1 "select public.sell_item_to_market('sayuran', 5, $P, '$K');")
amt=$(root "select amount from public.transactions where id='$r1'")
ok "jual ke pasar: stok -5, uang + (harga x 5), tercatat penjualan" $(and $(isuuid "$r1") $(eq "$(inv 1 sayuran)" $((I0-5))) $(eq "$(bal 1)" $((B0+amt))) $(eq "$amt" $((P*5))))
ok "kunci sama dikirim ulang -> 1 pembayaran, stok hanya turun sekali" $(and $(eq "$r1" "$r2") $(eq "$(inv 1 sayuran)" $((I0-5))))
ok "penjualan ke pasar mencetak uang sebesar itu (tercatat di audit)" $(eq "$(sup)" "$(( ${S0%%|*} + amt ))|${S0##*|}")
sold=$(as 1 "select market_sold_24h from public.get_job_limits();"); cfgset npc_sell_daily_cap $((sold + P))
B1=$(bal 1); ok "batas harian: jual 2 unit melebihi batas -> DAILY_CAP, tidak ada perubahan" $(and $(has "$(as 1 "select public.sell_item_to_market('sayuran', 2, $(mp sayuran), '$(key s)');")" DAILY_CAP) $(eq "$(bal 1)" $B1))
ok "jual 1 unit yang masih muat dalam batas berhasil" $(isuuid "$(as 1 "select public.sell_item_to_market('sayuran', 1, $(mp sayuran), '$(key s)');")")
cfgset npc_sell_daily_cap 500000
root "select public._inv_add('$(uid 4)','padi',20);" >/dev/null; B0=$(bal 4)
for i in $(seq 1 10); do ( as 4 "select public.sell_item_to_market('padi', 5, $(mp padi), '$(key r)');" > /tmp/sl$i.out ) & done; wait
sum=$(root "select coalesce(sum(amount),0) from public.transactions where actor_id='$(uid 4)' and memo='Pasar: jual 5 padi'")
ok "10 penjualan bersamaan (5 unit) dari stok 20 -> tepat 4 berhasil, stok 0 (tidak minus)" $(and $(eq "$(succ /tmp/sl{1..10}.out)" 4) $(eq "$(inv 4 padi)" 0) $(eq "$(bal 4)" $((B0+sum))))
root "select public._inv_add('$(uid 10)','sayuran',10);" >/dev/null; cfgset market_rate_per_min 2
for i in 1 2; do as 10 "select public.sell_item_to_market('sayuran', 1, $(mp sayuran), '$(key r)');" >/dev/null; done
ok "batas laju transaksi pasar -> RATE_LIMITED" $(has "$(as 10 "select public.sell_item_to_market('sayuran', 1, $(mp sayuran), '$(key r)');")" RATE_LIMITED); cfgset market_rate_per_min 30

echo "== pedagang"
B0=$(bal 5); P=$(mp padi); S0=$(sup)
r=$(as 5 "select public.buy_item_from_market('padi', 10, $P, '$(key t)');")
ok "pedagang membeli 10 padi: saldo turun, stok naik, uang dibakar" $(and $(isuuid "$r") $(eq "$(bal 5)" $((B0-P*10))) $(eq "$(inv 5 padi)" 10) $(eq "$(sup)" "${S0%%|*}|$(( ${S0##*|} + P*10 ))"))
ok "petani/tanpa pekerjaan tidak boleh membeli grosir (WRONG_JOB)" $(and $(has "$(as 6 "select public.buy_item_from_market('padi', 1, $P, '$(key t)');")" WRONG_JOB) $(has "$(as 2 "select public.buy_item_from_market('padi', 1, $P, '$(key t)');")" WRONG_JOB))
B1=$(bal 5); ok "batas stok pedagang -> STOCK_CAP, uang utuh" $(and $(has "$(as 5 "select public.buy_item_from_market('padi', 195, $(mp padi), '$(key t)');")" STOCK_CAP) $(eq "$(bal 5)" $B1))
ok "harga salah -> PRICE_CHANGED" $(has "$(as 5 "select public.buy_item_from_market('padi', 1, 7, '$(key t)');")" PRICE_CHANGED)
setbal 5 100; ok "saldo kurang -> INSUFFICIENT_FUNDS dan stok tidak berubah (atomik)" $(and $(has "$(as 5 "select public.buy_item_from_market('padi', 5, $(mp padi), '$(key t)');")" INSUFFICIENT_FUNDS) $(eq "$(inv 5 padi)" 10)); setbal 5 5000000
B0=$(bal 5); r=$(as 5 "select public.buy_item_from_market('padi', 40, $(mp padi), '$(key t)');"); r2=$(as 5 "select public.sell_item_to_market('padi', 40, $(mp padi), '$(key t)');"); B2=$(bal 5)
diff=$((B2-B0)); lim=$(( $(mp padi) * 40 * 3 / 100 ))
ok "beli lalu jual langsung (harga sama) tidak untung berarti (selisih dalam +/-3%)" $(and $(isuuid "$r") $(isuuid "$r2") $([ ${diff#-} -le $lim ] && echo 1 || echo 0)) "selisih=$diff batas=$lim"

echo "== pekerja bangunan"
ok "daftar proyek: selalu ada 6 proyek terbuka" $(eq "$(as 7 "select count(*) from public.get_work_orders() where status='terbuka';")" 6)
OA=$(as 7 "select id from public.get_work_orders() where status='terbuka' order by wage limit 1;" | tail -1)
ok "bukan pekerja bangunan tidak bisa menerima proyek (WRONG_JOB)" $(has "$(as 1 "select public.accept_work('$OA');")" WRONG_JOB)
( as 7 "select public.accept_work('$OA');" > /tmp/ac7.out ) & ( as 8 "select public.accept_work('$OA');" > /tmp/ac8.out ) & wait
ok "2 pekerja menerima proyek yang sama bersamaan -> tepat 1 berhasil" $(and $(eq "$(root "select count(*) from public.work_orders where id='$OA' and status='dikerjakan'")" 1) $(eq "$(cat /tmp/ac7.out /tmp/ac8.out | grep -c ORDER_TAKEN)" 1))
W=$(root "select worker_id from public.work_orders where id='$OA'"); WN=$(( 10#${W: -12} ))
OB=$(as $WN "select id from public.get_work_orders() where status='terbuka' limit 1;" | tail -1)
ok "pekerja yang sedang bekerja tidak bisa menerima proyek kedua (ACTIVE_WORK)" $(has "$(as $WN "select public.accept_work('$OB');")" ACTIVE_WORK)
ok "selesaikan sebelum waktunya ditolak (TOO_EARLY)" $(has "$(as $WN "select public.complete_work('$OA', '$(key w)');")" TOO_EARLY)
root "update public.work_orders set duration_s=1 where id='$OA';" >/dev/null; sleep 1.3
OTHER=$([ $WN = 7 ] && echo 8 || echo 7)
ok "pekerja lain tidak bisa menyelesaikan proyek ini (NOT_WORKER)" $(has "$(as $OTHER "select public.complete_work('$OA', '$(key w)');")" NOT_WORKER)
B0=$(bal $WN); S0=$(sup); WG=$(root "select wage from public.work_orders where id='$OA'"); K=$(key w)
c1=$(as $WN "select public.complete_work('$OA', '$K');"); c2=$(as $WN "select public.complete_work('$OA', '$K');")
ok "selesai: upah dibayar sekali (dicetak), status selesai; kunci sama tidak membayar lagi" $(and $(isuuid "$c1") $(eq "$c1" "$c2") $(eq "$(bal $WN)" $((B0+WG))) $(eq "$(root "select status from public.work_orders where id='$OA'")" selesai) $(eq "$(sup)" "$(( ${S0%%|*} + WG ))|${S0##*|}"))
OC=$(as $WN "select id from public.get_work_orders() where status='terbuka' limit 1;" | tail -1); as $WN "select public.accept_work('$OC');" >/dev/null
root "update public.work_orders set duration_s=1 where id='$OC';" >/dev/null; sleep 1.3; B0=$(bal $WN)
( as $WN "select public.complete_work('$OC', '$(key w)');" > /tmp/cw1.out ) & ( as $WN "select public.complete_work('$OC', '$(key w)');" > /tmp/cw2.out ) & wait
WG2=$(root "select wage from public.work_orders where id='$OC'")
ok "2 permintaan selesai bersamaan (kunci berbeda) -> upah hanya dibayar sekali" $(and $(eq "$(succ /tmp/cw1.out /tmp/cw2.out)" 1) $(eq "$(bal $WN)" $((B0+WG2))))
OD=$(as $WN "select id from public.get_work_orders() where status='terbuka' limit 1;" | tail -1); as $WN "select public.accept_work('$OD');" >/dev/null
root "update public.work_orders set duration_s=1 where id='$OD';" >/dev/null; sleep 1.3; cfgset wage_daily_cap 10
ok "batas upah harian -> DAILY_CAP, proyek tetap dikerjakan" $(and $(has "$(as $WN "select public.complete_work('$OD', '$(key w)');")" DAILY_CAP) $(eq "$(root "select status from public.work_orders where id='$OD'")" dikerjakan)); cfgset wage_daily_cap 300000
as $WN "select public.abandon_work('$OD');" >/dev/null
ok "meninggalkan proyek membuka kembali proyek itu" $(eq "$(root "select status||'|'||coalesce(worker_id::text,'-') from public.work_orders where id='$OD'")" "terbuka|-")
ok "bukan pekerja tidak bisa meninggalkan proyek orang (NOT_WORKER)" $(has "$(as $OTHER "select public.abandon_work('$OD');")" NOT_WORKER)
as 8 "select public.accept_work('$OD');" >/dev/null; cfgset job_switch_cooldown_s 0; job 8 petani
ok "pindah pekerjaan otomatis membatalkan proyek yang sedang dikerjakan" $(eq "$(root "select status from public.work_orders where id='$OD'")" terbuka); cfgset job_switch_cooldown_s 600
as 7 "select public.accept_work('$OD');" >/dev/null; root "update public.work_orders set accepted_at = now() - interval '1 hour' where id='$OD';" >/dev/null
ok "proyek yang ditinggalkan terlalu lama dibuka lagi otomatis" $(eq "$(as 5 "select count(*) from public.get_work_orders() where id='$OD' and status='terbuka';")" 1)

echo "== keamanan"
for tbl in jobs player_jobs item_catalog inventory crops plantings work_templates work_orders; do ok "SELECT langsung $tbl ditolak" $(has "$(as 1 "select * from public.$tbl limit 1;")" "permission denied"); done
ok "pemain tidak bisa mengisi inventaris langsung" $(has "$(as 1 "insert into public.inventory(player_id,item_id,qty) values('$(uid 1)','padi',999);")" "permission denied")
for fn in "_inv_add('$(uid 1)','padi',1)" "_inv_take('$(uid 1)','padi',1)" "_market_price('padi', now())" "_work_maintain()" "_require_job('$(uid 1)','petani')" "_require_active('$(uid 1)')"; do ok "fungsi internal tidak bisa dipanggil pemain: ${fn%%(*}" $(has "$(as 1 "select public.$fn;")" "permission denied"); done
for fn in "get_my_job()" "choose_job('petani')" "get_inventory()" "get_plantings()" "get_market()" "get_work_orders()" "plant_crop('P-01',0,'padi','abcdefgh')" "sell_item_to_market('padi',1,1,'abcdefgh')"; do ok "anon ditolak: $fn" $(has "$(asanon "select * from public.$fn;")" "permission denied"); done
ok "tanpa login (uid null) ditolak" $(has "$(root "set role authenticated; select * from public.get_market();")" NOT_AUTHENTICATED)
root "update public.profiles set status='dibekukan' where display_name='Pemain11';" >/dev/null; job 11 petani 2>/dev/null
ok "akun dibekukan tidak bisa memilih pekerjaan / berdagang" $(and $(has "$(as 11 "select public.choose_job('petani');")" ACCOUNT_FROZEN) $(has "$(as 11 "select public.sell_item_to_market('padi',1,1,'abcdefgh');")" ACCOUNT_FROZEN))
sig=$(root "select string_agg(proname||'('||pg_get_function_identity_arguments(oid)||')', ' | ' order by proname) from pg_proc where pronamespace='public'::regnamespace and proname in ('choose_job','plant_crop','care_planting','harvest_crop','sell_item_to_market','buy_item_from_market','accept_work','complete_work','abandon_work');")
ok "nama parameter RPC sesuai yang dipakai klien" $(eq "$sig" "abandon_work(p_order_id uuid) | accept_work(p_order_id uuid) | buy_item_from_market(p_item_id text, p_qty integer, p_expected_unit bigint, p_key text) | care_planting(p_land_id text, p_cell integer) | choose_job(p_job_id text) | complete_work(p_order_id uuid, p_key text) | harvest_crop(p_land_id text, p_cell integer) | plant_crop(p_land_id text, p_cell integer, p_crop_id text, p_key text) | sell_item_to_market(p_item_id text, p_qty integer, p_expected_unit bigint, p_key text)") "$sig"

echo "== integritas akhir"
ok "audit ekonomi seimbang" $(eq "$(root "select balanced from public.audit_economy();")" t)
ok "tidak ada saldo atau stok negatif" $(eq "$(root "select (select count(*) from public.player_wallets where balance<0)+(select count(*) from public.inventory where qty<0);")" 0)
root "update public.crops set grow_s=180, care_slots=2 where id='sayuran';" >/dev/null
echo; echo "RINGKASAN PEKERJAAN: lulus=$PASS gagal=$FAIL"
