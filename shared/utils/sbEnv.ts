/**
 * sbEnv — pembaca ENV Supabase (shared, lintas app)
 * Wajib tersedia di setiap app:
 *   - VITE_SUPABASE_URL
 *   - VITE_SUPABASE_ANON_KEY
 *   - VITE_SUPABASE_FUNCTIONS_BASE  (format: https://<project-ref>.supabase.co/functions/v1)
 *
 * Catatan:
 * - Tidak menyentuh folder /supabase. Ini cuma baca ENV dan normalisasi.
 * - Jika variabel belum diisi, fungsi `readSbEnvOrThrow` akan melempar error
 *   supaya ketahuan cepat saat dev.
 */

export type SbEnv = {
  url: string               // example: https://xxxxx.supabase.co
  anonKey: string           // anon public key
  functionsBase: string     // example: https://xxxxx.supabase.co/functions/v1
}

function normUrl(u: string): string {
  // hapus spasi & trailing slash berlebih
  const s = (u || '').trim()
  return s.replace(/\/+$/g, '')
}

function requireEnv(name: string, value: string | undefined, appLabel?: string): string {
  if (!value || !value.trim()) {
    const scope = appLabel ? ` for ${appLabel}` : ''
    const msg = `[sbEnv] Missing ${name}${scope}.`
    console.error(msg)
    throw new Error(msg)
  }
  return value.trim()
}

/**
 * Baca ENV dan lempar error kalau belum lengkap.
 * `appLabel` hanya untuk log (isi nama app saat memanggil).
 */
export function readSbEnvOrThrow(appLabel?: string): SbEnv {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (import.meta as any).env as Record<string, string | undefined>

  const url = normUrl(requireEnv('VITE_SUPABASE_URL', env.VITE_SUPABASE_URL, appLabel))
  const anonKey = requireEnv('VITE_SUPABASE_ANON_KEY', env.VITE_SUPABASE_ANON_KEY, appLabel)
  const functionsBase = normUrl(requireEnv('VITE_SUPABASE_FUNCTIONS_BASE', env.VITE_SUPABASE_FUNCTIONS_BASE, appLabel))

  // Validasi ringan agar tidak salah format
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`[sbEnv] VITE_SUPABASE_URL invalid${appLabel ? ` for ${appLabel}` : ''}: ${url}`)
  }
  if (!/^https?:\/\//i.test(functionsBase) || !/\/functions\/v1$/i.test(functionsBase)) {
    throw new Error(
      `[sbEnv] VITE_SUPABASE_FUNCTIONS_BASE harus berakhir dengan "/functions/v1"${
        appLabel ? ` for ${appLabel}` : ''
      }: ${functionsBase}`
    )
  }

  return { url, anonKey, functionsBase }
}

/**
 * Cek cepat apakah ENV lengkap tanpa melempar.
 */
export function hasSbEnv(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (import.meta as any).env as Record<string, string | undefined>
  return Boolean(
    env.VITE_SUPABASE_URL &&
    env.VITE_SUPABASE_ANON_KEY &&
    env.VITE_SUPABASE_FUNCTIONS_BASE
  )
}
