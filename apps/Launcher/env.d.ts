/// <reference types="vite/client" />

/**
 * Deklarasi variabel ENV khusus Launcher supaya TypeScript tidak bawel.
 * Semua opsional: jika kosong, LauncherBtn fallback ke localhost:<port>.
 */
interface ImportMetaEnv {
  readonly VITE_URL_0SETTING?: string
  readonly VITE_URL_1MENG?: string
  readonly VITE_URL_3DATABASE?: string
  readonly VITE_URL_4EXTRA?: string
  readonly VITE_URL_5RARA?: string

  /** Paksa renderer: 'auto' | 'pixi' | 'dom' (opsional) */
  readonly VITE_RENDERER?: 'auto' | 'pixi' | 'dom'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
