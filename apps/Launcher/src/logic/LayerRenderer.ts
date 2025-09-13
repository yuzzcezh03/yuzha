import { ProcessedLayer, ViewportInfo, LoadingCallback, ErrorCallback } from './LayerTypes'
import { ImagePreloader } from './ImagePreloader'
import { SpritePool } from './SpritePool'
import { PositionCalculator } from './PositionCalculator'
import { PerformanceMonitor } from './PerformanceMonitor'
import { MobileOptimizations } from './MobileOptimizations'
import { ErrorRecovery } from './ErrorRecovery'

export class LayerRenderer {
  private pixiApp: any = null
  private container: any = null
  private imagePreloader: ImagePreloader
  private spritePool: SpritePool
  private performanceMonitor: PerformanceMonitor
  private mobileOptimizations: MobileOptimizations
  private errorRecovery: ErrorRecovery
  private currentLayers: ProcessedLayer[] = []
  private viewportInfo: ViewportInfo = { width: 1920, height: 1080, scale: 1 }
  private isDestroyed: boolean = false
  private renderCallback?: () => void
  private lastFrameTime: number = 0
  private frameSkipCounter: number = 0

  constructor(
    private PIXI: any,
    private canvasElement: HTMLCanvasElement,
    loadingCallback?: LoadingCallback,
    errorCallback?: ErrorCallback,
    renderCallback?: () => void
  ) {
    this.renderCallback = renderCallback
    this.imagePreloader = new ImagePreloader(PIXI, loadingCallback, errorCallback)
    this.spritePool = new SpritePool(PIXI)
    this.performanceMonitor = new PerformanceMonitor((metrics) => {
      this.handlePerformanceUpdate(metrics)
    })
    this.mobileOptimizations = new MobileOptimizations(this.viewportInfo)
    this.errorRecovery = new ErrorRecovery({
      maxRetries: 3,
      retryDelay: 1000,
      enableGracefulDegradation: true
    })
  }

  /**
   * Initialize PixiJS application
   */
  async initialize(): Promise<void> {
    try {
      const renderSettings = this.mobileOptimizations.getRenderSettings()
      
      // Create PixiJS application with mobile optimizations
      this.pixiApp = new this.PIXI.Application({
        view: this.canvasElement,
        width: this.viewportInfo.width,
        height: this.viewportInfo.height,
        backgroundColor: 0x000000,
        antialias: renderSettings.antialias,
        autoDensity: true,
        resolution: renderSettings.resolution,
        powerPreference: renderSettings.powerPreference,
        clearBeforeRender: renderSettings.clearBeforeRender
      })

      // Create main container for layers
      this.container = new this.PIXI.Container()
      this.pixiApp.stage.addChild(this.container)

      // Set up resize handling
      this.setupResizeHandler()

      // Set up optimized render loop
      this.setupRenderLoop()

      console.log('PixiJS renderer initialized successfully with optimizations:', {
        device: this.mobileOptimizations.getDeviceInfo(),
        settings: this.mobileOptimizations.getSettings(),
        renderSettings
      })
    } catch (error) {
      console.error('Failed to initialize PixiJS renderer:', error)
      
      // Try error recovery
      const recovery = await this.errorRecovery.handleError(
        error instanceof Error ? error : new Error('Renderer initialization failed'),
        'renderer_init',
        () => this.initializeWithFallback()
      )
      
      if (!recovery.recovered) {
        throw error
      }
    }
  }

  /**
   * Initialize with fallback settings for low-end devices
   */
  private async initializeWithFallback(): Promise<void> {
    const fallbackSettings = {
      antialias: false,
      resolution: 1,
      powerPreference: 'low-power' as const,
      clearBeforeRender: false
    }

    this.pixiApp = new this.PIXI.Application({
      view: this.canvasElement,
      width: this.viewportInfo.width,
      height: this.viewportInfo.height,
      backgroundColor: 0x000000,
      ...fallbackSettings
    })

    this.container = new this.PIXI.Container()
    this.pixiApp.stage.addChild(this.container)
    
    console.log('PixiJS initialized with fallback settings')
  }

  /**
   * Preload images from registry
   */
  async preloadImages(imageRegistry: { [key: string]: string }): Promise<void> {
    try {
      await this.imagePreloader.preloadImages(imageRegistry)
      console.log('All images preloaded successfully')
    } catch (error) {
      console.error('Image preloading failed:', error)
      throw error
    }
  }

  /**
   * Update layers (called from LayerLoader)
   */
  updateLayers(layers: ProcessedLayer[]): void {
    if (this.isDestroyed) return

    this.currentLayers = [...layers]
    this.renderLayers()
  }

  /**
   * Render current layers with optimizations
   */
  private renderLayers(): void {
    if (!this.pixiApp || this.isDestroyed) return

    try {
      const renderStart = performance.now()
      const settings = this.mobileOptimizations.getSettings()
      
      // Skip frame if in low power mode
      if (this.mobileOptimizations.getSettings().enableLowPowerMode) {
        this.frameSkipCounter++
        if (this.mobileOptimizations.shouldSkipFrame(this.frameSkipCounter)) {
          return
        }
      }

      // Get current layer IDs for cleanup
      const currentLayerIds = new Set(this.currentLayers.map(l => l.id))
      
      // Clean up unused sprites
      this.spritePool.cleanupUnusedSprites(currentLayerIds)

      // Process visible layers with mobile optimizations
      const visibleLayers = this.currentLayers.filter(layer => layer.isVisible)
      const layersToRender = visibleLayers.slice(0, settings.maxLayers)

      // Batch process layers for better performance
      const batchSize = this.mobileOptimizations.getBatchSize()
      for (let i = 0; i < layersToRender.length; i += batchSize) {
        const batch = layersToRender.slice(i, i + batchSize)
        this.processBatch(batch)
      }

      // Update z-index sorting
      this.spritePool.updateZIndexSorting(this.container)

      // Record performance metrics
      const renderTime = performance.now() - renderStart
      this.performanceMonitor.recordRenderTime(renderTime)
      this.performanceMonitor.recordFrame()
      this.performanceMonitor.updateCounts(
        this.container.children.length,
        this.imagePreloader.getCacheStats().size
      )

      // Trigger render callback
      if (this.renderCallback) {
        this.renderCallback()
      }

    } catch (error) {
      console.error('Layer rendering error:', error)
      this.handleRenderError(error)
    }
  }

  /**
   * Process a batch of layers
   */
  private processBatch(layers: ProcessedLayer[]): void {
    layers.forEach(layer => {
      const texture = this.imagePreloader.getTexture(layer.imageRef.id)
      
      if (texture && texture !== this.PIXI.Texture.EMPTY) {
        // Get or create sprite
        const sprite = this.spritePool.getSprite(layer.id, texture)
        
        // Apply mobile texture scaling
        const textureScale = this.mobileOptimizations.getTextureScale()
        const adjustedLayer = {
          ...layer,
          absoluteScale: layer.absoluteScale * textureScale
        }
        
        // Update sprite properties
        this.spritePool.updateSprite(layer.id, adjustedLayer)
        
        // Add to container if not already added
        if (!this.container.children.includes(sprite)) {
          this.container.addChild(sprite)
        }
      }
    })
  }

  /**
   * Handle performance metrics update
   */
  private handlePerformanceUpdate(metrics: any): void {
    // Update mobile optimizations based on performance
    const updated = this.mobileOptimizations.updateSettingsForPerformance(
      metrics.fps,
      metrics.memoryUsage.percentage
    )

    if (updated) {
      console.log('Mobile settings auto-adjusted for performance')
      // Re-render with new settings
      this.renderLayers()
    }

    // Check for performance degradation
    const performance = this.performanceMonitor.isPerformanceDegraded()
    if (performance.degraded && this.errorRecovery) {
      this.errorRecovery.handleError(
        new Error(`Performance degraded: ${performance.reasons.join(', ')}`),
        'performance_degradation'
      )
    }
  }

  /**
   * Handle rendering errors with recovery
   */
  private async handleRenderError(error: any): Promise<void> {
    const recovery = await this.errorRecovery.handleError(
      error instanceof Error ? error : new Error('Render error'),
      'layer_rendering',
      () => Promise.resolve(this.renderLayers())
    )

    if (recovery.recovered) {
      console.log('Render error recovered:', recovery.action)
    } else {
      console.error('Failed to recover from render error:', recovery.action)
      
      // Apply degradation settings
      if (this.errorRecovery.isDegraded()) {
        const degradationSettings = this.errorRecovery.getDegradationSettings()
        this.applyDegradationSettings(degradationSettings)
      }
    }
  }

  /**
   * Apply degradation settings
   */
  private applyDegradationSettings(settings: any): void {
    // Force enable low power mode on mobile optimizations
    if (settings.enableLowPowerMode) {
      this.mobileOptimizations.enableLowPowerMode()
    }

    // Update sprite pool settings
    if (this.spritePool) {
      // Limit active sprites based on degradation
      const currentLayers = this.currentLayers.slice(0, settings.maxLayers)
      this.updateLayers(currentLayers)
    }

    console.log('Applied degradation settings:', settings)
  }

  /**
   * Update viewport size
   */
  updateViewport(width: number, height: number): void {
    if (!this.pixiApp || this.isDestroyed) return

    this.viewportInfo = PositionCalculator.getViewportInfo(width, height)

    // Resize PixiJS application
    this.pixiApp.renderer.resize(width, height)

    // Update camera/stage scale and position for responsive design
    this.updateStageTransform()

    console.log(`Renderer viewport updated: ${width}x${height}`)
  }

  /**
   * Update stage transform for responsive design
   */
  private updateStageTransform(): void {
    if (!this.pixiApp || !this.container) return

    const { width, height, scale } = this.viewportInfo
    
    // Center the content
    this.container.scale.set(scale)
    this.container.position.set(
      (this.pixiApp.renderer.width - width) / 2,
      (this.pixiApp.renderer.height - height) / 2
    )
  }

  /**
   * Setup resize handler
   */
  private setupResizeHandler(): void {
    const resizeHandler = () => {
      if (this.isDestroyed) return
      
      const rect = this.canvasElement.getBoundingClientRect()
      this.updateViewport(rect.width, rect.height)
    }

    // Use ResizeObserver if available, otherwise fallback to window resize
    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(resizeHandler)
      resizeObserver.observe(this.canvasElement)
    } else {
      window.addEventListener('resize', resizeHandler)
    }

    // Initial resize
    resizeHandler()
  }

  /**
   * Setup optimized render loop with mobile considerations
   */
  private setupRenderLoop(): void {
    const targetFPS = this.mobileOptimizations.getTargetFPS()
    const frameTime = 1000 / targetFPS
    
    const render = (currentTime: number) => {
      if (this.isDestroyed) return

      // Throttle rendering for mobile performance
      if (currentTime - this.lastFrameTime >= frameTime) {
        this.lastFrameTime = currentTime
        
        // PixiJS handles its own render loop, but we can add custom logic here
        
        // Periodic optimizations
        if (Math.random() < 0.001) { // ~0.1% chance per frame
          this.performPeriodicOptimizations()
        }
      }

      requestAnimationFrame(render)
    }

    requestAnimationFrame(render)
  }

  /**
   * Perform periodic optimizations
   */
  private performPeriodicOptimizations(): void {
    // Optimize sprite pool
    this.spritePool.optimizePoolSize()
    
    // Check memory usage and clean up if needed
    const metrics = this.performanceMonitor.getMetrics()
    if (metrics.memoryUsage.percentage > 80) {
      this.performMemoryCleanup()
    }
  }

  /**
   * Perform memory cleanup
   */
  private performMemoryCleanup(): void {
    // Force garbage collection if available
    if ((window as any).gc) {
      (window as any).gc()
    }
    
    // Clean up texture cache periodically
    const cacheStats = this.imagePreloader.getCacheStats()
    if (cacheStats.size > 100) {
      console.log('Performing texture cache cleanup')
      // Could implement LRU cache cleanup here
    }
  }

  /**
   * Get mobile-optimized settings (deprecated - use mobileOptimizations directly)
   */
  private getMobileSettings(): {
    maxLayers: number
    targetFPS: number
    cullPadding: number
  } {
    const settings = this.mobileOptimizations.getSettings()
    return {
      maxLayers: settings.maxLayers,
      targetFPS: settings.targetFPS,
      cullPadding: settings.cullPadding
    }
  }

  /**
   * Get comprehensive rendering statistics
   */
  getStats(): {
    totalSprites: number
    visibleSprites: number
    performance: any
    mobile: any
    memory: any
    errors: any
  } {
    const baseStats = {
      totalSprites: this.container?.children.length || 0,
      visibleSprites: this.container?.children.filter((c: any) => c.visible).length || 0
    }

    return {
      ...baseStats,
      performance: this.performanceMonitor.getMetrics(),
      mobile: this.mobileOptimizations.getOptimizationSummary(),
      memory: {
        textures: this.imagePreloader.getCacheStats(),
        sprites: this.spritePool.getStats()
      },
      errors: this.errorRecovery.getRecoveryState()
    }
  }

  /**
   * Get performance optimization suggestions
   */
  getOptimizationSuggestions(): string[] {
    return this.performanceMonitor.getOptimizationSuggestions()
  }

  /**
   * Enable low power mode manually
   */
  enableLowPowerMode(): void {
    this.mobileOptimizations.enableLowPowerMode()
    this.renderLayers() // Re-render with new settings
  }

  /**
   * Get error recovery report
   */
  getErrorReport(): any {
    return this.errorRecovery.generateErrorReport()
  }

  /**
   * Force render update
   */
  forceRender(): void {
    if (this.pixiApp && !this.isDestroyed) {
      this.pixiApp.render()
    }
  }

  /**
   * Take screenshot of current render
   */
  takeScreenshot(): string | null {
    if (!this.pixiApp || this.isDestroyed) return null

    try {
      return this.pixiApp.view.toDataURL()
    } catch (error) {
      console.error('Screenshot failed:', error)
      return null
    }
  }

  /**
   * Update layer visibility with texture information
   */
  updateLayerVisibility(layers: ProcessedLayer[]): void {
    const textures = this.imagePreloader.getCacheStats()
    
    layers.forEach(layer => {
      const texture = this.imagePreloader.getTexture(layer.imageRef.id)
      if (texture && texture.width && texture.height) {
        const mobileSettings = this.getMobileSettings()
        
        layer.isVisible = PositionCalculator.isLayerVisible(
          layer.absolutePosition.x,
          layer.absolutePosition.y,
          layer.absoluteScale,
          texture.width,
          texture.height,
          this.viewportInfo,
          mobileSettings.cullPadding
        )
      }
    })
  }

  /**
   * Cleanup and destroy renderer with comprehensive cleanup
   */
  destroy(): void {
    if (this.isDestroyed) return

    this.isDestroyed = true

    // Stop performance monitoring
    if (this.performanceMonitor) {
      this.performanceMonitor.destroy()
    }

    // Cleanup error recovery
    if (this.errorRecovery) {
      this.errorRecovery.reset()
    }

    // Cleanup sprite pool
    if (this.spritePool) {
      this.spritePool.destroy()
    }

    // Cleanup image preloader
    if (this.imagePreloader) {
      this.imagePreloader.clearCache()
    }

    // Destroy PixiJS app
    if (this.pixiApp) {
      this.pixiApp.destroy(true, true)
      this.pixiApp = null
    }

    console.log('Layer renderer destroyed with comprehensive cleanup')
  }
}