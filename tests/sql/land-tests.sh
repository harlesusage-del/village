#!/bin/bash
# Tes sistem lahan di PostgreSQL asli. Jalankan sebagai root: bash tests/sql/land-tests.sh
source "$(dirname "$0")/lib.sh"
price() { as $1 "select buy_price from public.get_lands() where id='$2';" | tail -1; }
owner() { root "select coalesce((select display_name from public.profiles where id=owner_id),'DESA') from public.land_plots where id='$1';"; }
buy() { as $1 "select public.buy_land('$2', $3, '${4:-$(key b)}');"; }
cfgset() { root "update public.economy_config set value=$2 where key='$1';" >/dev/null; }
resetworld() { root "truncate public.land_ownership; update public.land_plots set owner_id=null,listed_price=null,purchased_at=null,disputed=false,build_obligation=false;" >/dev/null; for u in $(seq 1 12); do setbal $u 5000000; done; }

root "delete from auth.users; truncate public.transactions;" >/dev/null
for k in village_buyback_pct:70 max_lands_per_player:10 land_rate_per_min:100 max_listing_multiplier:10 transfer_rate_per_min:1000; do cfgset ${k%%:*} ${k##*:}; done
root "insert into auth.users(id,email,raw_user_meta_data) select ('00000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'e'||g||'@x.id',jsonb_build_object('display_name','Pemain'||g) from generate_series(1,12) g;" >/dev/null
resetworld

echo "== peta lahan"
n=$(as 1 "select count(*) from public.get_lands();"); ok "peta memuat 37 lahan" $(eq "$n" 37) "$n"
n=$(as 1 "select count(*) from public.get_lands() where status='desa';"); ok "16 lahan tersedia dibeli dari desa" $(eq "$n" 16) "$n"
ok "lahan rumah dan warung tidak dijual (tidak ada harga beli)" $(eq "$(as 1 "select count(*) from public.get_lands() where (restricted) and buy_price is not null;")" 0)
ok "harga dasar = luas x tarif (P-01 12x12 pertanian = 720.000)" $(eq "$(price 1 P-01)" 720000)

echo "== beli dari desa"
B0=$(bal 1); r=$(buy 1 P-01 720000)
ok "beli P-01 berhasil (id transaksi)" $(isuuid "$r") "$r"
ok "saldo berkurang tepat sebesar harga" $(eq "$(bal 1)" $((B0-720000)))
ok "pemilik tercatat Pemain1" $(eq "$(owner P-01)" Pemain1)
ok "status P-01 bagi pembeli = milik_saya, bagi pemain lain = dimiliki tanpa harga beli" $(eq "$(as 1 "select status from public.get_lands() where id='P-01';")|$(as 2 "select status||'/'||coalesce(buy_price::text,'-') from public.get_lands() where id='P-01';")" "milik_saya|dimiliki/-")
ok "riwayat kepemilikan tercatat (beli_dari_desa)" $(eq "$(root "select kind||'|'||price from public.land_ownership where land_id='P-01';")" "beli_dari_desa|720000")
ok "uang masuk ke sistem (dibakar), tercatat pembelian_lahan" $(eq "$(root "select kind||'|'||(receiver_id is null)::text from public.transactions where memo='Lahan P-01';")" "pembelian_lahan|true")

echo "== penolakan"
t() { local who=$1 land=$2 exp=$3 code=$4 before; before=$(bal $who); r=$(buy $who $land $exp); ok "$5" $(has "$r" "$code") "saldo tetap=$(eq "$(bal $who)" "$before")"; }
t 2 P-01 720000 LAND_NOT_FOR_SALE "lahan milik pemain lain (tidak dijual) ditolak"
t 1 P-01 720000 ALREADY_OWNER "membeli lahan sendiri ditolak"
t 2 P-02 1 PRICE_CHANGED "harga yang dilihat tidak sama dengan harga server -> dibatalkan"
t 2 R-01 400000 LAND_NOT_FOR_SALE "lahan rumah tidak bisa dibeli"
t 2 D-01 1 LAND_NOT_FOR_SALE "lahan milik desa (warung) tidak bisa dibeli"
t 2 X-99 1 LAND_NOT_FOUND "lahan tidak ada ditolak"
ok "kunci idempotensi tidak valid ditolak" $(has "$(as 2 "select public.buy_land('P-02', 720000, 'abc');")" KEY_INVALID)
setbal 3 100000; r=$(buy 3 P-02 $(price 3 P-02))
ok "saldo kurang -> INSUFFICIENT_FUNDS" $(has "$r" INSUFFICIENT_FUNDS)
ok "atomik: lahan tetap milik desa, saldo utuh, tanpa riwayat" $(eq "$(owner P-02)|$(bal 3)|$(root "select count(*) from public.land_ownership where land_id='P-02'")|$(root "select count(*) from public.transactions where memo='Lahan P-02'")" "DESA|100000|0|0")
setbal 3 5000000

echo "== anti ganda"
K=$(key d); r1=$(buy 2 P-02 720000 $K); B1=$(bal 2); r2=$(buy 2 P-02 720000 $K)
ok "kunci sama dikirim ulang -> transaksi sama" $(eq "$r1" "$r2")
ok "uang tidak terpotong dua kali, lahan tetap milik pembeli" $(and $(eq "$(bal 2)" $B1) $(eq "$(owner P-02)" Pemain2))
ok "kunci sama untuk lahan lain ditolak (KEY_REUSED)" $(has "$(buy 2 L-01 432000 $K)" KEY_REUSED)

echo "== balapan: 10 pemain membeli lahan yang sama bersamaan"
for land in K-01 K-02 K-03; do
  resetworld; P=$(price 3 $land); minted0=$(root "select burned from public.audit_economy();")
  for u in $(seq 3 12); do ( buy $u $land $P > /tmp/race$u.out ) & done; wait
  succ=0; for u in $(seq 3 12); do grep -qE '^[0-9a-f-]{36}$' /tmp/race$u.out && succ=$((succ+1)); done
  paid=0; for u in $(seq 3 12); do [ "$(bal $u)" != "5000000" ] && paid=$((paid+1)); done
  burned=$(( $(root "select burned from public.audit_economy();") - minted0 ))
  ok "$land: tepat 1 dari 10 pembeli berhasil" $(eq "$succ|$paid|$burned" "1|1|$P") "berhasil=$succ yang_membayar=$paid dibakar=$burned"
  ok "$land: 1 pemilik, 1 baris riwayat" $(eq "$(root "select count(*) from public.land_ownership where land_id='$land'")" 1)
done

echo "== klik ganda pemain yang sama (10x, kunci sama)"
resetworld; K=$(key e); for i in $(seq 1 10); do ( buy 4 T-01 $(price 4 T-01) $K > /tmp/dbl$i.out ) & done; wait
ids=$(for i in $(seq 1 10); do cat /tmp/dbl$i.out; done | sort -u | wc -l)
ok "10 klik bersamaan -> 1 transaksi, 1 pemotongan" $(eq "$ids|$(owner T-01)|$(root "select count(*) from public.transactions where memo='Lahan T-01'")" "1|Pemain4|1") "id unik=$ids"

echo "== batas kepemilikan di bawah balapan"
resetworld; cfgset max_lands_per_player 2
for L in D-03 D-04 U-01 U-02 L-01; do ( buy 5 $L $(price 5 $L) > /tmp/lim$L.out ) & done; wait
n=$(root "select count(*) from public.land_plots where owner_id='$(uid 5)'"); ok "5 pembelian bersamaan dengan batas 2 -> tepat 2 lahan" $(eq "$n" 2) "dimiliki=$n"
r=$(buy 5 K-01 $(price 5 K-01)); ok "pembelian ke-3 ditolak (LAND_LIMIT)" $(has "$r" LAND_LIMIT)
cfgset max_lands_per_player 10

echo "== batas laju pembelian"
resetworld; cfgset land_rate_per_min 2
buy 6 P-03 $(price 6 P-03) >/dev/null; buy 6 P-04 $(price 6 P-04) >/dev/null
ok "pembelian ke-3 dalam semenit ditolak (RATE_LIMITED)" $(has "$(buy 6 P-05 $(price 6 P-05))" RATE_LIMITED)
cfgset land_rate_per_min 100

echo "== jual ke pemain lain (listing)"
resetworld; buy 1 P-01 720000 >/dev/null
ok "bukan pemilik tidak bisa memasang listing" $(has "$(as 2 "select public.set_land_listing('P-01', 800000);")" NOT_OWNER)
for pr in 0 -5 7200001; do ok "harga listing tidak valid ditolak ($pr)" $(has "$(as 1 "select public.set_land_listing('P-01', $pr);")" LISTING_PRICE_INVALID); done
as 1 "select public.set_land_listing('P-01', 900000);" >/dev/null
ok "listing terlihat pemain lain: status dijual dengan harga" $(eq "$(as 7 "select status||'/'||buy_price from public.get_lands() where id='P-01';")" "dijual/900000")
ok "membeli dengan harga lama ditolak (PRICE_CHANGED)" $(has "$(buy 7 P-01 720000)" PRICE_CHANGED)
ok "penjual tidak bisa membeli listing sendiri" $(has "$(buy 1 P-01 900000)" ALREADY_OWNER)
S0=$(bal 1); Bb=$(bal 7); sup0=$(root "select minted||'|'||burned from public.audit_economy();")
setbal 8 1000; ok "pembeli saldo kurang -> ditolak dan listing utuh" $(and $(has "$(buy 8 P-01 900000)" INSUFFICIENT_FUNDS) $(eq "$(owner P-01)" Pemain1))
sup0=$(root "select minted||'|'||burned from public.audit_economy();"); S0=$(bal 1)
r=$(buy 7 P-01 900000); ok "pembelian listing berhasil" $(isuuid "$r")
ok "penjual menerima 900.000, pembeli membayar 900.000" $(eq "$(bal 1)|$(bal 7)" "$((S0+900000))|$((Bb-900000))")
ok "pemilik baru Pemain7, listing hilang" $(eq "$(owner P-01)|$(root "select listed_price is null from public.land_plots where id='P-01'")" "Pemain7|t")
ok "jual antar-pemain tidak mencetak/membakar uang" $(eq "$(root "select minted||'|'||burned from public.audit_economy();")" "$sup0")
ok "riwayat: beli_dari_pemain" $(eq "$(root "select kind from public.land_ownership where land_id='P-01' order by id desc limit 1")" beli_dari_pemain)
as 7 "select public.set_land_listing('P-01', 800000);" >/dev/null; as 7 "select public.set_land_listing('P-01', null);" >/dev/null
ok "listing dibatalkan -> tidak bisa dibeli lagi" $(has "$(buy 9 P-01 800000)" LAND_NOT_FOR_SALE)

echo "== jual ke desa"
B0=$(bal 7); r=$(as 7 "select public.sell_land_to_village('P-01', '$(key v)');")
ok "jual ke desa berhasil" $(isuuid "$r")
ok "menerima 70% harga dasar (504.000), lahan kembali ke desa" $(eq "$(bal 7)|$(owner P-01)" "$((B0+504000))|DESA")
K=$(key w); as 2 "select public.set_land_listing('P-02', 800000);" >/dev/null; r1=$(as 2 "select public.sell_land_to_village('P-02', '$K');"); B2=$(bal 2); r2=$(as 2 "select public.sell_land_to_village('P-02', '$K');")
ok "jual ke desa idempotent (kunci sama, 1 pembayaran)" $(and $(eq "$r1" "$r2") $(eq "$(bal 2)" $B2))
ok "listing ikut terhapus saat dijual ke desa" $(eq "$(root "select listed_price is null from public.land_plots where id='P-02'")" t)
ok "bukan pemilik tidak bisa jual ke desa" $(has "$(as 3 "select public.sell_land_to_village('P-03', '$(key v)');")" NOT_OWNER)
buy 3 D-03 $(price 3 D-03) >/dev/null
cfgset village_buyback_pct 0; ok "buyback dimatikan -> BUYBACK_DISABLED" $(has "$(as 3 "select public.sell_land_to_village('D-03', '$(key v)');")" BUYBACK_DISABLED); cfgset village_buyback_pct 70
root "update public.land_plots set disputed=true where id='D-03';" >/dev/null; ok "lahan sengketa tidak bisa dijual" $(has "$(as 3 "select public.sell_land_to_village('D-03', '$(key v)');")" LAND_DISPUTED)
root "update public.land_plots set disputed=false, build_obligation=true where id='D-03';" >/dev/null; ok "kewajiban pembangunan menghalangi penjualan" $(has "$(as 3 "select public.sell_land_to_village('D-03', '$(key v)');")" BUILD_OBLIGATION)
ok "lahan sengketa/ber-kewajiban juga tidak bisa dipasang listing" $(has "$(as 3 "select public.set_land_listing('D-03', 5000000);")" BUILD_OBLIGATION)
root "update public.land_plots set build_obligation=false where id='D-03';" >/dev/null

echo "== balapan: pemilik jual ke desa vs pemain lain beli listing (5 putaran)"
bad=0
for round in 1 2 3 4 5; do
  resetworld; buy 9 U-02 $(price 9 U-02) >/dev/null; X=$(( $(root "select base_price from public.land_plots where id='U-02'") + 1000 ))
  as 9 "select public.set_land_listing('U-02', $X);" >/dev/null
  ( buy 10 U-02 $X > /tmp/rb.out ) & ( as 9 "select public.sell_land_to_village('U-02', '$(key v)');" > /tmp/rs.out ) & wait
  b=$(grep -cE '^[0-9a-f-]{36}$' /tmp/rb.out); s=$(grep -cE '^[0-9a-f-]{36}$' /tmp/rs.out); o=$(owner U-02)
  if [ "$((b+s))" != "1" ]; then bad=$((bad+1)); elif [ "$b" = "1" ] && [ "$o" != "Pemain10" ]; then bad=$((bad+1)); elif [ "$s" = "1" ] && [ "$o" != "DESA" ]; then bad=$((bad+1)); fi
  ok "putaran $round: tepat satu yang berhasil, kepemilikan sesuai pemenang" $(eq "$((b+s))" 1) "beli=$b jual_desa=$s pemilik=$o"
done

echo "== keamanan"
for tbl in land_plots land_ownership; do ok "SELECT langsung $tbl ditolak" $(has "$(as 1 "select * from public.$tbl limit 1;")" "permission denied"); done
ok "UPDATE kepemilikan langsung ditolak" $(has "$(as 1 "update public.land_plots set owner_id='$(uid 1)' where id='L-01';")" "permission denied")
ok "INSERT riwayat langsung ditolak" $(has "$(as 1 "insert into public.land_ownership(land_id,price,kind) values('L-01',1,'beli_dari_desa');")" "permission denied")
ok "fungsi internal _cfg tidak bisa dipanggil pemain" $(has "$(as 1 "select public._cfg('max_lands_per_player',1);")" "permission denied")
for fn in "get_lands()" "buy_land('L-01',1,'abcdefgh')" "sell_land_to_village('L-01','abcdefgh')" "set_land_listing('L-01',1)"; do ok "anon ditolak: $fn" $(has "$(asanon "select * from public.$fn;")" "permission denied"); done
ok "tanpa login (uid null) ditolak" $(has "$(root "set role authenticated; select * from public.get_lands();")" NOT_AUTHENTICATED)
ok "riwayat kepemilikan tidak bisa diubah" $(and $(has "$(root "update public.land_ownership set price=1;")" LEDGER_IMMUTABLE) $(has "$(root "delete from public.land_ownership;")" LEDGER_IMMUTABLE))
root "update public.profiles set status='dibekukan' where display_name='Pemain11';" >/dev/null
ok "akun dibekukan tidak bisa beli/jual/listing" $(and $(has "$(buy 11 L-01 432000)" ACCOUNT_FROZEN) $(has "$(as 11 "select public.sell_land_to_village('L-01','$(key v)');")" ACCOUNT_FROZEN) $(has "$(as 11 "select public.set_land_listing('L-01',1);")" ACCOUNT_FROZEN))
sig=$(root "select string_agg(proname||'('||pg_get_function_identity_arguments(oid)||')', ' | ' order by proname) from pg_proc where proname in ('buy_land','sell_land_to_village','set_land_listing','get_lands') and pronamespace='public'::regnamespace;")
ok "nama parameter RPC sesuai yang dipakai klien" $(eq "$sig" "buy_land(p_land_id text, p_expected_price bigint, p_key text) | get_lands() | sell_land_to_village(p_land_id text, p_key text) | set_land_listing(p_land_id text, p_price bigint)") "$sig"

echo "== integritas akhir"
ok "audit ekonomi seimbang" $(eq "$(root "select balanced from public.audit_economy();")" t)
ok "tidak ada saldo negatif" $(eq "$(root "select count(*) from public.player_wallets where balance<0")" 0)
inc=$(root "select count(*) from public.land_plots l where l.owner_id is not null and coalesce((select to_id from public.land_ownership o where o.land_id=l.id order by o.id desc limit 1),'00000000-0000-0000-0000-000000000000') <> l.owner_id;")
ok "setiap lahan berpemilik cocok dengan baris riwayat terakhir" $(eq "$inc" 0) "tidak cocok=$inc"
inc2=$(root "select count(*) from public.land_plots l where l.owner_id is null and (select to_id from public.land_ownership o where o.land_id=l.id order by o.id desc limit 1) is not null;")
ok "lahan milik desa tidak punya pemilik di riwayat terakhir" $(eq "$inc2" 0) "tidak cocok=$inc2"
echo; echo "RINGKASAN LAHAN: lulus=$PASS gagal=$FAIL"
