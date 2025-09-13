import React from 'react'

/**
 * LauncherBtnEffect
 * ------------------------------------------------------------
 * Tujuan saat ini: KONEK dulu. Efek visual masih minimal (stub),
 * nanti bisa diganti implementasi nyata (glow/pulse/fade/3D).
 *
 * Desain:
 * - Pakai hook `useLauncherBtnEffect` yang menerima state dan config ringan.
 * - Mengembalikan className/style untuk PANEL dan BUTTON.
 * - Tidak ada dependency eksternal selain React & Tailwind (kelas util).
 */

export type LauncherBtnEffectKind = 'none' | 'fade' | 'pulse' | 'glow'

export type LauncherBtnEffectConfig = {
  kind?: LauncherBtnEffectKind
  intensity?: number // 0..1 (opsional; reserved)
}

/** State dari panel tombol, bisa dipakai untuk memicu anim. */
export type LauncherBtnEffectState = {
  open: boolean
  hovering?: boolean
  pressing?: boolean
}

/** Keluaran visual untuk dipakai di <LauncherBtn /> */
export type LauncherBtnVisual = {
  panelClass: string
  panelStyle?: React.CSSProperties
  buttonClass: string
  buttonStyle?: React.CSSProperties
  badgeClass: string
}

/**
 * Hook efek visual. Saat ini stub "none" dengan styling aman.
 * Nanti bisa diganti: tambah anim glow/pulse/fade berbasis Tailwind utility.
 */
export function useLauncherBtnEffect(
  state: LauncherBtnEffectState,
  cfg?: LauncherBtnEffectConfig
): LauncherBtnVisual {
  const kind = cfg?.kind ?? 'none'

  // Base styles aman (dark UI)
  const basePanel =
    'pointer-events-auto fixed bottom-4 right-4 z-[9999] ' +
    'bg-neutral-900/80 backdrop-blur-md border border-neutral-800 ' +
    'rounded-2xl shadow-lg px-3 py-2 flex items-center gap-2'

  const baseButton =
    'btn inline-flex items-center gap-2 px-3 py-1.5 rounded-xl ' +
    'bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 ' +
    'text-sm leading-none'

  const baseBadge =
    'badge text-[10px] px-2 py-0.5 rounded bg-neutral-800/70 border border-neutral-700'

  // Variasi sederhana (placeholder). Tidak mengubah flow logic.
  if (kind === 'glow') {
    return {
      panelClass: basePanel + ' ring-1 ring-pink-400/25',
      panelStyle: state.open ? { boxShadow: '0 0 24px rgba(236,72,153,0.25)' } : undefined,
      buttonClass: baseButton + ' ring-1 ring-pink-400/20',
      buttonStyle: state.hovering ? { boxShadow: '0 0 12px rgba(236,72,153,0.35)' } : undefined,
      badgeClass: baseBadge
    }
  }

  if (kind === 'pulse') {
    return {
      panelClass: basePanel,
      panelStyle: state.open ? { animation: 'pulse 1.5s ease-in-out infinite' } : undefined,
      buttonClass: baseButton,
      buttonStyle: state.pressing ? { transform: 'scale(0.98)' } : undefined,
      badgeClass: baseBadge
    }
  }

  if (kind === 'fade') {
    return {
      panelClass: basePanel,
      panelStyle: { opacity: state.open ? 1 : 0.85, transition: 'opacity 160ms ease' },
      buttonClass: baseButton,
      buttonStyle: undefined,
      badgeClass: baseBadge
    }
  }

  // kind === 'none' (default)
  return {
    panelClass: basePanel,
    panelStyle: undefined,
    buttonClass: baseButton,
    buttonStyle: undefined,
    badgeClass: baseBadge
  }
}
