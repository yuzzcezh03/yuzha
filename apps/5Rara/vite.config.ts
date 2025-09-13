import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const r = (p: string) => path.resolve(path.dirname(fileURLToPath(import.meta.url)), p)
const monorepoRoot = r('../..')

// Vite 7, ESM. Alias @shared -> root/shared.
// Force port: 5173, host 0.0.0.0, strictPort ON, allowedHosts sesuai contohmu.
export default defineConfig({
  root: r('.'),
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(monorepoRoot, 'shared')
    }
  },
  
  server: {
    host: '0.0.0.0',
    port: 5500,
    strictPort: true,
    allowedHosts: [
      'localhost'
    ]
  },
  preview: {
    host: '0.0.0.0',
    port: 5500
  },
  build: {
    target: 'es2020',
    sourcemap: false
  }
})