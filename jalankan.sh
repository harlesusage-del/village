#!/bin/bash
# Jalankan mode pengembangan di Linux Mint. Butuh Node.js 18 atau lebih baru.
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
npm run dev
