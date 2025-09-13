/**
 * sbEdge — helper generik untuk memanggil Supabase Edge Functions.
 * Dipakai lintas app. Tidak menyentuh folder /supabase lokal.
 *
 * Pemakaian:
 *   import { readSbEnvOrThrow } from '@shared/utils/sbEnv'
 *   import { makeEdgeClient } from '@shared/utils/sbEdge'
 *
 *   const env = readSbEnvOrThrow('1Meng')
 *   const edge = makeEdgeClient(env)
 *   const r = await edge.call('user-hub', { ping: true })
 *   if (!r.ok) console.error(r.error)
 */

import type { SbEnv } from './sbEnv'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type EdgeCallOptions = {
  method?: HttpMethod        // default POST
  query?: Record<string, string | number | boolean | null | undefined>
  headers?: Record<string, string>
  timeoutMs?: number         // default 15000
  /** Access token user (kalau login). Jika tidak ada, pakai anon key. */
  accessToken?: string | null
}

export type EdgeOk<T = unknown> = {
  ok: true
  status: number
  data: T
  headers: Headers
}

export type EdgeErr = {
  ok: false
  status: number
  error: { message: string; detail?: unknown }
  headers: Headers
  rawText?: string
}

export type EdgeResp<T = unknown> = EdgeOk<T> | EdgeErr

function toQuery(q?: EdgeCallOptions['query']): string {
  if (!q) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) {
    if (v === null || v === undefined) continue
    sp.append(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

function guessJson(text: string): any | undefined {
  try { return JSON.parse(text) } catch { return undefined }
}

export function makeEdgeClient(env: SbEnv) {
  const base = env.functionsBase
  const anonKey = env.anonKey

  async function call<T = unknown>(fn: string, body?: unknown, opts?: EdgeCallOptions): Promise<EdgeResp<T>> {
    const method = (opts?.method ?? 'POST').toUpperCase() as HttpMethod
    const url = `${base}/${fn}${toQuery(opts?.query)}`
    const headers: Record<string, string> = {
      'apikey': anonKey,
      'authorization': `Bearer ${opts?.accessToken ?? anonKey}`,
      ...(opts?.headers ?? {})
    }
    // Set content-type kalau ada body dan belum di-set custom
    const hasBody = body !== undefined && body !== null && method !== 'GET'
    if (hasBody && !('content-type' in Object.keys(headers).reduce((a, k) => (a[k.toLowerCase()] = k, a), {} as Record<string,string>))) {
      headers['content-type'] = 'application/json'
    }

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), Math.max(1, opts?.timeoutMs ?? 15000))

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: hasBody ? (headers['content-type']?.includes('json') ? JSON.stringify(body) : (body as BodyInit)) : undefined,
        signal: ctrl.signal
      })
      clearTimeout(timer)

      const ct = res.headers.get('content-type') || ''
      const text = await res.text()
      const json = ct.includes('application/json') ? guessJson(text) : guessJson(text) // coba parse kalau kebetulan JSON

      if (res.ok) {
        return { ok: true, status: res.status, data: (json as T) ?? (text as unknown as T), headers: res.headers }
      } else {
        const message = (json && (json.error || json.message)) || text || `HTTP ${res.status}`
        return { ok: false, status: res.status, error: { message, detail: json }, headers: res.headers, rawText: text }
      }
    } catch (e: any) {
      clearTimeout(timer)
      return { ok: false, status: 0, error: { message: e?.message || 'Network/Abort error', detail: e } , headers: new Headers() }
    }
  }

  return { call }
}
