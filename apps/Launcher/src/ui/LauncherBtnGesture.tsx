import React from 'react'

/**
 * LauncherBtnGesture
 * ------------------------------------------------------------
 * Gestur: HOLD-TAP (long-press) untuk toggle panel tombol.
 * - Satu file khusus Launcher.
 * - Default: tahan jari/kursor >= holdMs tanpa gerak besar → toggle.
 * - Jika panel sedang tampil, HOLD-TAP lagi akan menyembunyikan.
 *
 * Cara pakai cepat:
 *   const g = useLauncherBtnGesture()
 *   <div {...g.bindTargetProps()} className="absolute inset-0" />
 *   {g.open && <YourButtonPanel />}
 *
 * Catatan:
 * - Semua handler dipasang di elemen target yang kamu beri props dari bindTargetProps().
 * - Tidak bergantung file lain. Efek visual diurus file LauncherBtnEffect.tsx.
 */

export type LauncherBtnGestureOptions = {
  /** Durasi tahan minimal (ms) untuk terdeteksi long-press. Default 450 ms. */
  holdMs?: number
  /** Ambang toleransi gerakan saat menahan (px). Default 8 px. */
  moveTolerancePx?: number
}

export type LauncherBtnGesture = {
  /** Status panel tombol (true: tampil). */
  open: boolean
  /** Ganti status secara manual (opsional). */
  setOpen: (v: boolean) => void
  /** Toggle manual (opsional). */
  toggle: () => void
  /**
   * Bind props gestur ke elemen target (mis. overlay full screen).
   * Contoh: <div {...bindTargetProps()} className="absolute inset-0" />
   */
  bindTargetProps: () => React.HTMLAttributes<HTMLElement>
}

type PressState = {
  active: boolean
  id: number | null
  startX: number
  startY: number
  startedAt: number
  timer: number | null
  consumed: boolean // true jika sudah toggle pada siklus ini
}

export function useLauncherBtnGesture(opts?: LauncherBtnGestureOptions): LauncherBtnGesture {
  const holdMs = Math.max(120, Math.floor(opts?.holdMs ?? 450))
  const tol = Math.max(2, Math.floor(opts?.moveTolerancePx ?? 8))

  const [open, setOpen] = React.useState(false)
  const toggle = React.useCallback(() => setOpen(v => !v), [])

  const pressRef = React.useRef<PressState>({
    active: false,
    id: null,
    startX: 0,
    startY: 0,
    startedAt: 0,
    timer: null,
    consumed: false
  })

  const clearTimer = React.useCallback(() => {
    const p = pressRef.current
    if (p.timer !== null) {
      window.clearTimeout(p.timer)
      p.timer = null
    }
  }, [])

  const onPointerDown = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!e.isPrimary) return
    // Pastikan target dapat menerima pointer event
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)

    const p = pressRef.current
    p.active = true
    p.id = e.pointerId
    p.startX = e.clientX
    p.startY = e.clientY
    p.startedAt = performance.now()
    p.consumed = false

    clearTimer()
    p.timer = window.setTimeout(() => {
      // Bila masih aktif dan belum digerakkan jauh, toggle
      if (p.active && !p.consumed) {
        p.consumed = true
        toggle()
      }
    }, holdMs)
  }, [clearTimer, holdMs, toggle])

  const onPointerMove = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
    const p = pressRef.current
    if (!p.active || p.id !== e.pointerId) return
    const dx = e.clientX - p.startX
    const dy = e.clientY - p.startY
    if ((dx * dx + dy * dy) > (tol * tol)) {
      // Terlalu banyak bergerak saat menahan → batalkan hold
      p.active = false
      p.id = null
      p.consumed = false
      clearTimer()
    }
  }, [clearTimer, tol])

  const endPress = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
    const p = pressRef.current
    if (!p.active || (p.id !== null && p.id !== e.pointerId)) return
    p.active = false
    p.id = null
    // Jika timer belum menembak (belum long-press), tidak melakukan apa-apa (bukan toggle).
    clearTimer()
    // Lepas capture jika sempat dipasang
    try { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId) } catch {}
  }, [clearTimer])

  const bindTargetProps = React.useCallback((): React.HTMLAttributes<HTMLElement> => {
    return {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPress,
      onPointerCancel: endPress
    }
  }, [onPointerDown, onPointerMove, endPress])

  // Bersih-bersih saat unmount
  React.useEffect(() => {
    return () => clearTimer()
  }, [clearTimer])

  return { open, setOpen, toggle, bindTargetProps }
}

/* ================================================
 * Komponen pembungkus (opsional)
 * - Pasang overlay tak terlihat yang menerima gestur.
 * - Kamu bisa styling overlay sendiri via className.
 * ================================================ */
export type LauncherBtnGestureAreaProps = {
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
  options?: LauncherBtnGestureOptions
  onOpenChange?: (open: boolean) => void
}

export function LauncherBtnGestureArea(props: LauncherBtnGestureAreaProps) {
  const g = useLauncherBtnGesture(props.options)
  React.useEffect(() => { props.onOpenChange?.(g.open) }, [g.open, props])

  return (
    <div
      {...g.bindTargetProps()}
      className={props.className ?? 'absolute inset-0 pointer-events-auto'}
      style={props.style}
    >
      {typeof props.children === 'function'
        // @ts-expect-error: expose open via function child kalau mau
        ? props.children({ open: g.open, toggle: g.toggle })
        : props.children}
    </div>
  )
}
