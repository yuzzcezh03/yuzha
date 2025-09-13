import React from 'react'
import { LauncherBtnDock } from './ui/LauncherBtn'

export type LauncherScreenProps = {
  /** Placeholder untuk props masa depan */
}

/**
 * Layar utama launcher yang menampilkan navigasi dock.
 * Logic renderer kompleks dihapus untuk sementara.
 */
export default function LauncherScreen(props: LauncherScreenProps) {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Area utama untuk konten launcher */}
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-white">Launcher</h1>
          <p className="text-slate-300">
            Hold tap anywhere to access modules
          </p>
        </div>
      </div>

      {/* Navigation dock */}
      <LauncherBtnDock
        effect={{ kind: 'fade' }}
        title="Modules"
        target="_self"
      />
    </div>
  )
}