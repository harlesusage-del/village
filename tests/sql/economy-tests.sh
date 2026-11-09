#!/bin/bash
# Tes ekonomi di PostgreSQL asli (butuh stub Supabase: tests/supabase-stub.sql, migrasi 001-003). Jalankan sebagai root: bash tests/sql/economy-tests.sh
DB=vl; PASS=0; FAIL=0
psqlf() { su postgres -c "psql -At -q -d $DB -v ON_ERROR_STOP=0 -f $1" 2>&1; }
uid() { printf "00000000-0000-0000-0000-%012d" "$1"; }
# as N "SQL" : jalankan SQL sebagai pemain ke-N (role authenticated). Mengembalikan hasil atau baris ERROR.
as() { local n=$1 f; f=$(mktemp /tmp/q.XXXXXX.sql); chmod 644 $f; printf "set role authenticated;\nset request.jwt.claim.sub = '%s';\n%s\n" "$(uid $n)" "$2" > $f; psqlf $f | grep -v "^SET$" | sed 's/^psql:[^ ]* //' ; rm -f $f; }
asanon() { local f; f=$(mktemp /tmp/q.XXXXXX.sql); chmod 644 $f; printf "set role anon;\n%s\n" "$1" > $f; psqlf $f | grep -v "^SET$" | sed 's/^psql:[^ ]* //'; rm -f $f; }
root() { local f; f=$(mktemp /tmp/q.XXXXXX.sql); chmod 644 $f; echo "$1" > $f; psqlf $f | sed 's/^psql:[^ ]* //'; rm -f $f; }
ok() { if [ "$2" = "1" ]; then PASS=$((PASS+1)); echo "OK    $1 ${3:+ [$3]}"; else FAIL=$((FAIL+1)); echo "GAGAL $1 ${3:+ [$3]}"; fi; }
has() { [[ "$1" == *"$2"* ]] && echo 1 || echo 0; }
bal() { as $1 "select public.get_wallet();" | tail -1; }
key() { printf "key-%s-%s" "$1" "$(tr -d - < /proc/sys/kernel/random/uuid)"; }   # kunci unik tiap panggilan (aman di subshell)
# setbal N TARGET: atur saldo lewat jalur buku besar yang sah (cetak/bakar uang), supaya audit tetap seimbang.
setbal() { local cur d; cur=$(bal $1); d=$(( $2 - cur )); if [ $d -gt 0 ]; then root "select public.ledger_move('$(uid $1)',null,'$(uid $1)',$d,'gaji','tes','$(key s)');" >/dev/null; elif [ $d -lt 0 ]; then root "select public.ledger_move('$(uid $1)','$(uid $1)',null,$((-d)),'pajak','tes','$(key s)');" >/dev/null; fi; }

root "delete from auth.users; truncate public.transactions; update public.economy_config set value=10 where key='transfer_rate_per_min';" >/dev/null
root "insert into auth.users(id,email,raw_user_meta_data) select ('00000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'e'||g||'@x.id',jsonb_build_object('display_name','Pemain'||g) from generate_series(1,6) g;" >/dev/null

echo "== saldo awal"
b=$(bal 1); ok "pemain baru langsung punya dompet berisi saldo awal 1.000.000" $([ "$b" = "1000000" ] && echo 1 || echo 0) "saldo=$b"
n=$(root "select count(*) from public.transactions where kind='saldo_awal'"); ok "saldo awal tercatat tepat 1x per pemain di buku besar" $([ "$n" = "6" ] && echo 1 || echo 0) "baris=$n"
root "insert into public.player_wallets(player_id) values('$(uid 1)') on conflict do nothing; select public.ledger_move('$(uid 1)',null,'$(uid 1)',999,'saldo_awal','x','saldo_awal');" > /tmp/r.txt
ok "saldo awal tidak bisa diberikan dua kali (idempotent)" $([ "$(bal 1)" = "1000000" ] && echo 1 || echo 0)

echo "== transfer biasa"
r=$(as 1 "select public.transfer_money('Pemain2', 100000, 'beli beras', '$(key a)');"); ok "transfer berhasil mengembalikan id transaksi" $([[ "$r" =~ ^[0-9a-f-]{36}$ ]] && echo 1 || echo 0) "$r"
ok "saldo pengirim berkurang dan penerima bertambah tepat" $([ "$(bal 1)" = "900000" ] && [ "$(bal 2)" = "1100000" ] && echo 1 || echo 0) "$(bal 1) / $(bal 2)"
h=$(as 2 "select direction||'|'||counterparty||'|'||amount||'|'||memo from public.get_transactions(5) where kind='transfer';")
ok "riwayat penerima: masuk dari Pemain1 dengan catatan" $([ "$h" = "masuk|Pemain1|100000|beli beras" ] && echo 1 || echo 0) "$h"
ok "nama penerima tidak peka huruf besar/kecil dan spasi" $(has "$(as 1 "select public.transfer_money('  pEMAIN3 ', 10, '', '$(key b)');")" "ERROR" | sed 's/1/0/;t;s/0/1/')

echo "== penolakan"
for t in "Pemain2|0|AMOUNT_INVALID" "Pemain2|-5|AMOUNT_INVALID" "Pemain2|5000001|AMOUNT_TOO_LARGE" "Pemain1|100|SELF_TRANSFER" "TidakAda|100|RECIPIENT_NOT_FOUND" "Pemain2|2000000|INSUFFICIENT_FUNDS"; do
  IFS='|' read nm am er <<< "$t"; before="$(bal 1)"
  r=$(as 1 "select public.transfer_money('$nm', $am, '', '$(key c)');")
  ok "ditolak: $er" $(has "$r" "$er") "saldo tetap $( [ "$(bal 1)" = "$before" ] && echo ya || echo TIDAK)"
done
ok "kunci idempotensi terlalu pendek ditolak" $(has "$(as 1 "select public.transfer_money('Pemain2',1,'','abc');")" KEY_INVALID)
ok "kunci idempotensi kosong (null) ditolak" $(has "$(as 1 "select public.transfer_money('Pemain2',1,'',null);")" KEY_INVALID)
ok "saldo tidak berubah setelah semua penolakan" $([ "$(bal 1)" = "899990" ] && echo 1 || echo 0) "$(bal 1)"

echo "== anti transaksi ganda"
K=$(key d); r1=$(as 1 "select public.transfer_money('Pemain2', 50000, '', '$K');"); r2=$(as 1 "select public.transfer_money('Pemain2', 50000, '', '$K');")
ok "kunci sama dikirim ulang -> id transaksi sama" $([ "$r1" = "$r2" ] && echo 1 || echo 0)
ok "uang hanya terpotong sekali" $([ "$(bal 1)" = "849990" ] && echo 1 || echo 0) "$(bal 1)"
ok "kunci sama dengan jumlah berbeda ditolak (KEY_REUSED)" $(has "$(as 1 "select public.transfer_money('Pemain2', 99999, '', '$K');")" KEY_REUSED)
K2=$(key e); for i in $(seq 1 12); do ( as 1 "select public.transfer_money('Pemain4', 7000, '', '$K2');" > /tmp/dup$i.out ) & done; wait
ids=$(cat /tmp/dup{1..12}.out 2>/dev/null | sort -u | wc -l); ids=$(for i in $(seq 1 12); do cat /tmp/dup$i.out; done | sort -u | wc -l)
ok "12 klik bersamaan dengan kunci sama -> 1 transaksi saja" $([ "$ids" = "1" ] && [ "$(bal 4)" = "1007000" ] && echo 1 || echo 0) "id unik=$ids saldo4=$(bal 4)"

echo "== batas laju"
for i in $(seq 1 10); do as 3 "select public.transfer_money('Pemain6', 1, '', '$(key f)');" >/dev/null; done
ok "transfer ke-11 dalam semenit ditolak (RATE_LIMITED)" $(has "$(as 3 "select public.transfer_money('Pemain6', 1, '', '$(key g)');")" RATE_LIMITED)

echo "== balapan (concurrency)"
root "update public.economy_config set value=1000 where key='transfer_rate_per_min'; delete from public.player_wallets where false;" >/dev/null
setbal 5 1000000
for i in $(seq 1 20); do ( as 5 "select public.transfer_money('Pemain6', 150000, '', '$(key h)');" > /tmp/ov$i.out ) & done; wait
succ=0; for i in $(seq 1 20); do grep -qE '^[0-9a-f-]{36}$' /tmp/ov$i.out && succ=$((succ+1)); done
ok "20 transfer bersamaan @150rb dari saldo 1jt -> tepat 6 berhasil" $([ "$succ" = "6" ] && [ "$(bal 5)" = "100000" ] && echo 1 || echo 0) "berhasil=$succ saldo=$(bal 5)"
setbal 4 1000000
for i in $(seq 1 20); do ( root "select public.ledger_move('$(uid 4)','$(uid 4)','$(uid 6)',150000,'transfer','',  'direct-$i-aaaaaaaa');" > /tmp/ld$i.out ) & done; wait
succ=0; for i in $(seq 1 20); do grep -qE '^[0-9a-f-]{36}$' /tmp/ld$i.out && succ=$((succ+1)); done
ok "ledger_move langsung, 20 paralel -> tepat 6 berhasil (tanpa kunci per-pemain)" $([ "$succ" = "6" ] && [ "$(bal 4)" = "100000" ] && echo 1 || echo 0) "berhasil=$succ saldo=$(bal 4)"
setbal 1 1000000; setbal 2 1000000
for i in $(seq 1 40); do ( as 1 "select public.transfer_money('Pemain2', 100, '', '$(key x1)');" > /tmp/xa$i.out ) & ( as 2 "select public.transfer_money('Pemain1', 100, '', '$(key x2)');" > /tmp/xb$i.out ) & done; wait
succ=0; dead=0; for f in /tmp/xa*.out /tmp/xb*.out; do grep -qE '^[0-9a-f-]{36}$' $f && succ=$((succ+1)); grep -qi deadlock $f && dead=$((dead+1)); done
ok "80 transfer silang bersamaan (rawan deadlock): semua berhasil, 0 deadlock" $([ "$succ" = "80" ] && [ "$dead" = "0" ] && [ "$(bal 1)" = "1000000" ] && echo 1 || echo 0) "berhasil=$succ deadlock=$dead saldo1=$(bal 1)"

echo "== integritas total"
a=$(root "select balanced||'|'||total_balances||'|'||minted||'|'||burned from public.audit_economy();")
ok "audit: total saldo = uang dicetak - dibuang (seimbang)" $(has "$a" "true|") "$a"
neg=$(root "select count(*) from public.player_wallets where balance<0"); ok "tidak ada saldo negatif" $([ "$neg" = "0" ] && echo 1 || echo 0)
ok "saldo negatif ditolak constraint database" $(has "$(root "update public.player_wallets set balance=-1 where player_id='$(uid 1)';")" "violates check")

echo "== keamanan"
for tbl in player_wallets transactions economy_config; do ok "pemain tidak bisa SELECT langsung $tbl" $(has "$(as 1 "select * from public.$tbl limit 1;")" "permission denied"); done
ok "pemain tidak bisa UPDATE saldo langsung" $(has "$(as 1 "update public.player_wallets set balance=999999999 where player_id='$(uid 1)';")" "permission denied")
ok "pemain tidak bisa INSERT transaksi langsung" $(has "$(as 1 "insert into public.transactions(kind,actor_id,receiver_id,amount) values('gaji','$(uid 1)','$(uid 1)',999999);")" "permission denied")
ok "pemain tidak bisa memanggil ledger_move" $(has "$(as 1 "select public.ledger_move('$(uid 1)',null,'$(uid 1)',999999,'gaji','','zz-zz-zz-zz');")" "permission denied")
ok "pemain tidak bisa memanggil audit_economy" $(has "$(as 1 "select * from public.audit_economy();")" "permission denied")
for fn in "get_wallet()" "transfer_money('Pemain1',1,'','abcdefgh')" "get_transactions(5)" "get_economy_config()"; do ok "anon ditolak: $fn" $(has "$(asanon "select * from public.$fn;")" "permission denied"); done
ok "tanpa login (uid null) ditolak" $(has "$(root "set role authenticated; select public.get_wallet();")" "NOT_AUTHENTICATED")
other=$(as 6 "select count(*) from public.get_transactions(100) where memo='beli beras';"); ok "pemain tidak melihat transaksi orang lain" $([ "$other" = "0" ] && echo 1 || echo 0) "baris=$other"
ok "buku besar tidak bisa diubah (UPDATE)" $(has "$(root "update public.transactions set amount=1;")" LEDGER_IMMUTABLE)
ok "buku besar tidak bisa dihapus (DELETE)" $(has "$(root "delete from public.transactions;")" LEDGER_IMMUTABLE)

echo "== akun dibekukan, catatan, tanda tangan fungsi"
root "update public.profiles set status='dibekukan' where display_name='Pemain5';" >/dev/null
ok "akun dibekukan tidak bisa mengirim" $(has "$(as 5 "select public.transfer_money('Pemain1',1,'','$(key z)');")" ACCOUNT_FROZEN)
ok "akun dibekukan tidak bisa menerima (penerima dianggap tidak ada)" $(has "$(as 1 "select public.transfer_money('Pemain5',1,'','$(key z2)');")" RECIPIENT_NOT_FOUND)
as 1 "select public.transfer_money('Pemain2', 1, E'ba\\x01d\\ttext$(printf 'x%.0s' $(seq 1 150))', '$(key m)');" >/dev/null
m=$(root "select length(memo)||'|'||(memo ~ '[\\x00-\\x1f]')::text from public.transactions where kind='transfer' order by created_at desc limit 1;")
ok "catatan: karakter kontrol dibuang dan dipotong 100 karakter" $([ "$m" = "100|false" ] && echo 1 || echo 0) "$m"
sig=$(root "select string_agg(proname||':'||pg_get_function_identity_arguments(oid), ' | ' order by proname) from pg_proc where proname in ('transfer_money','get_transactions') and pronamespace='public'::regnamespace;")
ok "nama parameter RPC cocok dengan yang dipakai klien" $([ "$sig" = "get_transactions:p_limit integer, p_before timestamp with time zone | transfer_money:p_to_name text, p_amount bigint, p_memo text, p_key text" ] && echo 1 || echo 0) "$sig"
echo; echo "RINGKASAN: lulus=$PASS gagal=$FAIL"
