#!/usr/bin/env bash
# Menjalankan emulator dengan data tersimpan: akun, database, dan file unggahan dipulihkan dari
# ./emulator-data dan disimpan lagi saat emulator dimatikan dengan Ctrl+C (jangan tutup paksa terminalnya).
cd "$(dirname "$0")/.." || exit 1
ARGS=(--project demo-mua-putri --export-on-exit=./emulator-data)
if [ -f ./emulator-data/firebase-export-metadata.json ]; then ARGS+=(--import=./emulator-data); fi
exec npx firebase emulators:start "${ARGS[@]}"
