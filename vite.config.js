import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Production build is served from https://cuervino.github.io/cyclo-code-versailles/
  // (GitHub Pages), so assets need that base. Local dev stays at root `/` to keep
  // the URL and the hash router clean.
  base: command === 'build' ? '/cyclo-code-versailles/' : '/',
  plugins: [react()],
}))
