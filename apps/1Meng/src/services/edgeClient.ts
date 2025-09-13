/**
 * Edge Client (1Meng)
 * - Pakai Supabase Edge Functions existing (tanpa ubah folder /supabase).
 * - ENV wajib: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_FUNCTIONS_BASE.
 * - Otomatis kirim Authorization: Bearer <user access token> kalau user login; fallback anon key.
 */

import { readSbEnvOrThrow } from '@shared/utils/sbEnv'
import { makeEdgeClient, type EdgeResp } from '@shared/utils/sbEdge'
import { supabase } from './supabaseClient'

const env = readSbEnvOrThrow('1Meng')
const edge = makeEdgeClient(env)

async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

/** Panggil fungsi Edge generik. */
export async function callEdge<T = unknown>(
  fn: string,
  payload?: unknown
): Promise<EdgeResp<T>> {
  const token = await getAccessToken()
  return edge.call<T>(fn, payload, { accessToken: token })
}

/** Sanity check: ping user-hub (atau ganti ke function lain yang pasti ada). */
export function edgePing() {
  return callEdge<{ pong: boolean }>('user-hub', { ping: true })
}
