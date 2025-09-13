import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const MODULE = 'm1_meng'
const DEFAULT_SCHEMA = 'm1_meng'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const schema = (import.meta.env.VITE_SUPABASE_SCHEMA as string | undefined) || DEFAULT_SCHEMA

function assertEnv() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY for 1Meng')
    throw new Error('Supabase env missing')
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __sb__: Record<string, SupabaseClient | undefined> | undefined
}

export function getSupabase(): SupabaseClient {
  assertEnv()
  const key = `${MODULE}:${schema}:${supabaseUrl}`
  globalThis.__sb__ ||= {}
  if (!globalThis.__sb__[key]) {
    globalThis.__sb__[key] = createClient(supabaseUrl!, supabaseAnonKey!, {
      db: { schema },
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
    if (import.meta.env.DEV) console.info(`[supabase] client ready (${MODULE}) schema=${schema}`)
  }
  return globalThis.__sb__[key]!
}

export const supabase = getSupabase()
export const SCHEMA = schema