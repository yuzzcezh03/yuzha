import React, { useRef, useEffect, useState } from 'react'
import * as PIXI from 'pixi.js'
import { LauncherBtnDock } from './ui/LauncherBtn'
import { LayerLoader } from './logic/LayerLoader'
import { LayerRenderer } from './logic/LayerRenderer'
import { ConfigWatcher } from './logic/ConfigWatcher'
import { LoadingProgress } from './logic/LayerTypes'

export type LauncherScreenProps = {
  /** Placeholder untuk props masa depan */
}

/**
 * Layar utama launcher yang menampilkan layered composition system.
 * Pure display component - no business logic, only renders from LayerRenderer.
 */
export default function LauncherScreen(props: LauncherScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layerLoader = useRef<LayerLoader | null>(null)
  const layerRenderer = useRef<LayerRenderer | null>(null)
  const configWatcher = useRef<ConfigWatcher | null>(null)
  
  const [isLoading, setIsLoading] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress>({ loaded: 0, total: 0, percentage: 0 })
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<any>(null)
  const [hotReloadEnabled, setHotReloadEnabled] = useState(true)
  const [optimizationSuggestions, setOptimizationSuggestions] = useState<string[]>([])
  const [systemInfo, setSystemInfo] = useState<string>('Initializing...')

  useEffect(() => {
    initializeSystem()
    
    return () => {
      cleanup()
    }
  }, [])

  /**
   * Initialize the layer rendering system with all optimizations
   */
  const initializeSystem = async () => {
    if (!canvasRef.current) return

    try {
      setIsLoading(true)
      setError(null)
      setSystemInfo('Initializing layer system...')

      // Initialize LayerLoader
      layerLoader.current = new LayerLoader(
        // Update callback - when layers are processed
        (layers) => {
          if (layerRenderer.current) {
            layerRenderer.current.updateLayers(layers)
          }
        },
        // Error callback
        (error) => {
          console.error('LayerLoader error:', error)
          setError(error.message)
        },
        // Loading callback
        (progress) => {
          setLoadingProgress(progress)
          setSystemInfo(`Loading: ${progress.currentImage || 'Processing...'}`)
        }
      )

      // Initialize LayerRenderer
      layerRenderer.current = new LayerRenderer(
        PIXI,
        canvasRef.current,
        // Loading callback
        (progress) => {
          setLoadingProgress(progress)
          setSystemInfo(`Loading: ${progress.currentImage || 'Loading assets...'}`)
        },
        // Error callback
        (error) => {
          console.error('LayerRenderer error:', error)
          setError(error.message)
        },
        // Render callback
        () => {
          // Update stats when render completes
          if (layerRenderer.current) {
            const newStats = layerRenderer.current.getStats()
            setStats(newStats)
            
            // Update optimization suggestions
            const suggestions = layerRenderer.current.getOptimizationSuggestions()
            setOptimizationSuggestions(suggestions)
            
            // Update system info
            const mobile = newStats.mobile
            setSystemInfo(`${mobile.deviceClass} - ${mobile.activeOptimizations.join(', ') || 'No optimizations'}`)
          }
        }
      )

      setSystemInfo('Initializing PixiJS...')
      // Initialize PixiJS
      await layerRenderer.current.initialize()

      setSystemInfo('Loading configuration...')
      // Load configuration
      await layerLoader.current.loadConfig()

      setSystemInfo('Preloading images...')
      // Preload images
      const imageRegistry = layerLoader.current.getImageRegistry()
      await layerRenderer.current.preloadImages(imageRegistry)

      // Update layer visibility with actual texture sizes
      const layers = layerLoader.current.getProcessedLayers()
      layerRenderer.current.updateLayerVisibility(layers)
      layerRenderer.current.updateLayers(layers)

      // Initialize hot reloading if enabled
      if (hotReloadEnabled && process.env.NODE_ENV === 'development') {
        setupHotReload()
      }

      setIsLoading(false)
      setSystemInfo('System ready')
      console.log('Layer system initialized successfully with all optimizations')

    } catch (error) {
      console.error('Failed to initialize layer system:', error)
      setError(error instanceof Error ? error.message : 'Unknown initialization error')
      setSystemInfo('Initialization failed')
      setIsLoading(false)
    }
  }

  /**
   * Setup hot reload for configuration changes
   */
  const setupHotReload = () => {
    if (configWatcher.current) {
      configWatcher.current.destroy()
    }

    configWatcher.current = new ConfigWatcher(
      '/LogicLayer.config.json',
      // Config change callback
      async (newConfig) => {
        console.log('Config change detected, hot reloading...')
        try {
          if (layerLoader.current) {
            await layerLoader.current.setConfig(newConfig)
            setSystemInfo('Configuration reloaded')
          }
        } catch (error) {
          console.error('Hot reload failed:', error)
          setError(`Hot reload failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      },
      // Error callback
      (error) => {
        console.warn('Config watcher error:', error)
      }
    )

    configWatcher.current.startWatching(2000) // Check every 2 seconds
    console.log('Hot reload enabled for configuration changes')
  }

  /**
   * Handle window resize
   */
  const handleResize = () => {
    if (layerLoader.current && layerRenderer.current && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      layerLoader.current.updateViewport(rect.width, rect.height)
      layerRenderer.current.updateViewport(rect.width, rect.height)
    }
  }

  /**
   * Cleanup system resources
   */
  const cleanup = () => {
    if (configWatcher.current) {
      configWatcher.current.destroy()
      configWatcher.current = null
    }
    
    if (layerRenderer.current) {
      layerRenderer.current.destroy()
      layerRenderer.current = null
    }
    
    if (layerLoader.current) {
      layerLoader.current.destroy()
      layerLoader.current = null
    }
  }

  /**
   * Toggle hot reload functionality
   */
  const toggleHotReload = () => {
    setHotReloadEnabled(!hotReloadEnabled)
    
    if (!hotReloadEnabled) {
      setupHotReload()
    } else if (configWatcher.current) {
      configWatcher.current.destroy()
      configWatcher.current = null
    }
  }

  /**
   * Force reload configuration
   */
  const forceReload = async () => {
    try {
      setSystemInfo('Force reloading configuration...')
      if (layerLoader.current) {
        await layerLoader.current.hotReload()
        setSystemInfo('Configuration force reloaded')
      }
    } catch (error) {
      setError(`Force reload failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Enable low power mode
   */
  const enableLowPowerMode = () => {
    if (layerRenderer.current) {
      layerRenderer.current.enableLowPowerMode()
      setSystemInfo('Low power mode enabled')
    }
  }

  // Auto-resize handling
  useEffect(() => {
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      {/* PixiJS Canvas - Main Display Area */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ 
          display: isLoading ? 'none' : 'block',
          touchAction: 'none' // Prevent mobile scroll interference
        }}
      />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-90 z-10">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <h2 className="text-2xl font-bold text-white">Loading Layer System</h2>
            <div className="text-slate-300">
              <div className="mb-2">{loadingProgress.currentImage || 'Initializing...'}</div>
              <div className="w-64 bg-slate-700 rounded-full h-2 mx-auto">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${loadingProgress.percentage}%` }}
                ></div>
              </div>
              <div className="text-sm mt-2">
                {loadingProgress.loaded} / {loadingProgress.total} ({loadingProgress.percentage}%)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900 bg-opacity-90 z-20">
          <div className="text-center space-y-4 max-w-md px-6">
            <div className="text-red-400 text-6xl">⚠️</div>
            <h2 className="text-2xl font-bold text-white">System Error</h2>
            <p className="text-red-200">{error}</p>
            <button 
              onClick={initializeSystem}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Enhanced Debug Panel (Development Only) */}
      {stats && process.env.NODE_ENV === 'development' && (
        <div className="absolute top-4 left-4 bg-black bg-opacity-90 text-white text-xs p-4 rounded-lg font-mono z-30 max-w-md">
          {/* System Status */}
          <div className="mb-3 border-b border-gray-600 pb-2">
            <div className="text-green-400 font-bold">🚀 LAYER SYSTEM STATUS</div>
            <div className="text-blue-300">{systemInfo}</div>
          </div>

          {/* Performance Stats */}
          <div className="mb-3">
            <div className="text-yellow-400 font-bold">⚡ PERFORMANCE</div>
            <div>FPS: {Math.round(stats.performance?.fps || 0)}</div>
            <div>Frame Time: {stats.performance?.frameTime?.toFixed(1) || 0}ms</div>
            <div>Render Time: {stats.performance?.renderTime?.toFixed(1) || 0}ms</div>
          </div>

          {/* Sprites & Memory */}
          <div className="mb-3">
            <div className="text-purple-400 font-bold">🎨 RENDERING</div>
            <div>Visible: {stats.visibleSprites}/{stats.totalSprites} sprites</div>
            <div>Pool: {stats.memory?.sprites?.activeSprites}/{stats.memory?.sprites?.maxPoolSize}</div>
            <div>Textures: {stats.memory?.textures?.size || 0}</div>
          </div>

          {/* Mobile Optimizations */}
          <div className="mb-3">
            <div className="text-blue-400 font-bold">📱 {stats.mobile?.deviceClass?.toUpperCase()}</div>
            {stats.mobile?.activeOptimizations?.map((opt: string, i: number) => (
              <div key={i} className="text-xs text-blue-200">• {opt}</div>
            ))}
          </div>

          {/* Memory Usage */}
          {stats.performance?.memoryUsage && (
            <div className="mb-3">
              <div className="text-red-400 font-bold">💾 MEMORY</div>
              <div>{stats.performance.memoryUsage.used}MB / {stats.performance.memoryUsage.total}MB</div>
              <div className="w-full bg-gray-700 rounded-full h-1">
                <div 
                  className={`h-1 rounded-full ${stats.performance.memoryUsage.percentage > 80 ? 'bg-red-500' : 
                    stats.performance.memoryUsage.percentage > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${stats.performance.memoryUsage.percentage}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Error Recovery */}
          {stats.errors?.degradationLevel > 0 && (
            <div className="mb-3">
              <div className="text-red-400 font-bold">⚠️ RECOVERY</div>
              <div>Degradation Level: {stats.errors.degradationLevel}</div>
              <div className="text-red-300 text-xs">
                {stats.errors.recoveryActions?.slice(-2).map((action: string, i: number) => (
                  <div key={i}>• {action}</div>
                ))}
              </div>
            </div>
          )}

          {/* Control Buttons */}
          <div className="mt-3 pt-2 border-t border-gray-600 space-y-1">
            <button 
              onClick={forceReload}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-1 px-2 rounded"
            >
              🔄 Force Reload Config
            </button>
            <button 
              onClick={toggleHotReload}
              className={`w-full text-xs py-1 px-2 rounded ${hotReloadEnabled ? 
                'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'} text-white`}
            >
              {hotReloadEnabled ? '🔥 Hot Reload ON' : '❄️ Hot Reload OFF'}
            </button>
            <button 
              onClick={enableLowPowerMode}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white text-xs py-1 px-2 rounded"
            >
              🔋 Low Power Mode
            </button>
          </div>

          {/* Optimization Suggestions */}
          {optimizationSuggestions.length > 0 && (
            <div className="mt-3 pt-2 border-t border-yellow-600">
              <div className="text-yellow-400 font-bold">💡 SUGGESTIONS</div>
              {optimizationSuggestions.slice(0, 3).map((suggestion, i) => (
                <div key={i} className="text-yellow-200 text-xs">• {suggestion}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation dock - Only show when system is ready */}
      {!isLoading && !error && (
        <LauncherBtnDock
          effect={{ kind: 'fade' }}
          title="Modules"
          target="_self"
        />
      )}
    </div>
  )
}
