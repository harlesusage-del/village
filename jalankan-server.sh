#!/bin/bash
# Menjalankan game server multiplayer (Phase 5). Butuh Node.js 18+.
cd "$(dirname "$0")/gameserver"
[ -d node_modules ] || npm install
if [ ! -f .env ]; then cp .env.example .env; echo "File .env dibuat dari contoh. Isi dulu SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY (atau ALLOW_GUESTS=true untuk uji tanpa akun), lalu jalankan ulang."; exit 1; fi
npm start
