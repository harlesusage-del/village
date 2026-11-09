# Pustaka bantu tes SQL (dipakai land-tests.sh). Butuh PostgreSQL lokal dengan database "vl" dan migrasi 001-004.
DB=vl; PASS=0; FAIL=0
psqlf() { su postgres -c "psql -At -q -d $DB -v ON_ERROR_STOP=0 -f $1" 2>&1; }
uid() { printf "00000000-0000-0000-0000-%012d" "$1"; }
as() { local n=$1 f; f=$(mktemp /tmp/q.XXXXXX.sql); chmod 644 $f; printf "set role authenticated;\nset request.jwt.claim.sub = '%s';\n%s\n" "$(uid $n)" "$2" > $f; psqlf $f | grep -v "^SET$" | sed 's/^psql:[^ ]* //'; rm -f $f; }
asanon() { local f; f=$(mktemp /tmp/q.XXXXXX.sql); chmod 644 $f; printf "set role anon;\n%s\n" "$1" > $f; psqlf $f | grep -v "^SET$" | sed 's/^psql:[^ ]* //'; rm -f $f; }
root() { local f; f=$(mktemp /tmp/q.XXXXXX.sql); chmod 644 $f; echo "$1" > $f; psqlf $f | sed 's/^psql:[^ ]* //'; rm -f $f; }
ok() { if [ "$2" = "1" ]; then PASS=$((PASS+1)); echo "OK    $1${3:+  [$3]}"; else FAIL=$((FAIL+1)); echo "GAGAL $1${3:+  [$3]}"; fi; }
has() { [[ "$1" == *"$2"* ]] && echo 1 || echo 0; }
eq() { [ "$1" = "$2" ] && echo 1 || echo 0; }
isuuid() { [[ "$1" =~ ^[0-9a-f-]{36}$ ]] && echo 1 || echo 0; }
bal() { as $1 "select public.get_wallet();" | tail -1; }
key() { printf "key-%s-%s" "$1" "$(tr -d - < /proc/sys/kernel/random/uuid)"; }
setbal() { local cur d; cur=$(bal $1); d=$(( $2 - cur )); if [ $d -gt 0 ]; then root "select public.ledger_move('$(uid $1)',null,'$(uid $1)',$d,'gaji','tes','$(key s)');" >/dev/null; elif [ $d -lt 0 ]; then root "select public.ledger_move('$(uid $1)','$(uid $1)',null,$((-d)),'pajak','tes','$(key s)');" >/dev/null; fi; }
and() { local x; for x in "$@"; do [ "$x" = 1 ] || { echo 0; return; }; done; echo 1; }   # gabung beberapa pengecekan (semua harus benar)
