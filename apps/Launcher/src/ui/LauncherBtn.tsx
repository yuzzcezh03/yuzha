import React from 'react'
import { useLauncherBtnEffect, type LauncherBtnEffectConfig } from './LauncherBtnEffect'
import { useLauncherBtnGesture } from './LauncherBtnGesture'

/**
 * LauncherBtn — Panel navigasi ke masing-masing module.
 * - “Open/Hide” dikendalikan oleh gestur HOLD-TAP (via useLauncherBtnGesture).
 * - Efek visual dihubungkan via useLauncherBtnEffect (stub saat ini).
 * - Link modul baca dari ENV (VITE_URL_*), fallback ke localhost:<port> final.
 *
 * ENV yang didukung (opsional, override fallback lokal):
 *   VITE_URL_0SETTING, VITE_URL_1MENG, VITE_URL_3DATABASE, VITE_URL_4EXTRA, VITE_URL_5RARA
 */

export type ModuleLink = { id: string; label: string; url: string }

function getDefaultModuleLinks(): ModuleLink[] {
  const env = import.meta.env as Record<string, string | undefined>
  return [
    { id: '0setting',  label: '0Setting',   url: env.VITE_URL_0SETTING  ?? 'http://localhost:5000' },
    { id: '1meng',     label: '1Meng',      url: env.VITE_URL_1MENG     ?? 'http://localhost:5100' },
    { id: '3database', label: '3Database',  url: env.VITE_URL_3DATABASE ?? 'http://localhost:5300' },
    { id: '4extra',    label: '4Extra',     url: env.VITE_URL_4EXTRA    ?? 'http://localhost:5400' },
    { id: '5rara',     label: '5Rara',      url: env.VITE_URL_5RARA     ?? 'http://localhost:5500' }
  ]
}

export type LauncherBtnProps = {
  /** Status panel (true: tampil). Direkomendasikan dikontrol oleh useLauncherBtnGesture. */
  open: boolean
  /** Toggle panel (dipanggil oleh tombol Close). */
  onToggle?: () => void
  /** Kustom link modul. Default: baca ENV lalu fallback port lokal. */
  links?: ModuleLink[]
  /** Konfigurasi efek visual tombol/panel. */
  effect?: LauncherBtnEffectConfig
  /** Judul kecil panel. */
  title?: string
  /** Buka link di tab yang sama (default) atau tab baru. */
  target?: '_self' | '_blank'
}

export function LauncherBtnPanel(props: LauncherBtnProps) {
  const { open, onToggle, title = 'Modules', target = '_self' } = props
  const [hovering, setHovering] = React.useState(false)
  const [pressing, setPressing] = React.useState(false)

  const vis = useLauncherBtnEffect(
    { open, hovering, pressing },
    props.effect
  )

  const links = React.useMemo(() => props.links ?? getDefaultModuleLinks(), [props.links])

  // ESC untuk menutup cepat
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onToggle?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onToggle])

  if (!open) return null

  return (
    <div className={vis.panelClass} style={vis.panelStyle}>
      <span className={vis.badgeClass}>{title}</span>
      <div className="flex items-center gap-2">
        {links.map(link => (
          <a
            key={link.id}
            href={link.url}
            target={target}
            rel={target === '_blank' ? 'noreferrer' : undefined}
            className={vis.buttonClass}
            style={vis.buttonStyle}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            onMouseDown={() => setPressing(true)}
            onMouseUp={() => setPressing(false)}
            onTouchStart={() => setPressing(true)}
            onTouchEnd={() => setPressing(false)}
            data-mod={link.id}
          >
            {link.label}
          </a>
        ))}
        <button
          type="button"
          className={vis.buttonClass}
          style={vis.buttonStyle}
          onClick={onToggle}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onMouseDown={() => setPressing(true)}
          onMouseUp={() => setPressing(false)}
        >
          Close
        </button>
      </div>
    </div>
  )
}

/**
 * LauncherBtnDock — util opsional yang langsung menggabungkan gesture + panel.
 * - Pasang ini di App/LauncherScreen untuk pengalaman lengkap.
 * - HOLD-TAP di mana saja pada area overlay akan toggle panel.
 */
export function LauncherBtnDock(props: Omit<LauncherBtnProps, 'open' | 'onToggle'> & { overlayClassName?: string }) {
  const gesture = useLauncherBtnGesture()
  return (
    <>
      {/* Area gestur tak terlihat */}
      <div {...gesture.bindTargetProps()} className={props.overlayClassName ?? 'absolute inset-0 pointer-events-auto'} />
      {/* Panel */}
      <LauncherBtnPanel
        open={gesture.open}
        onToggle={gesture.toggle}
        links={props.links}
        effect={props.effect}
        title={props.title}
        target={props.target}
      />
    </>
  )
}
