import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
// Build menghasilkan satu file index.html mandiri yang bisa dibuka langsung (klik dua kali).
export default defineConfig({ plugins: [react(), viteSingleFile()], base: './' })
