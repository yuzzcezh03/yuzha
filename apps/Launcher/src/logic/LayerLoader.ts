import { LayerConfig, ProcessedLayer, LayerUpdateCallback, ErrorCallback, LoadingCallback, ViewportInfo } from './LayerTypes'
import { LayerValidator } from './LayerValidator'
import { PositionCalculator } from './PositionCalculator'

export class LayerLoader {
  private config: LayerConfig | null = null
  private processedLayers: ProcessedLayer[] = []
  private updateCallback?: LayerUpdateCallback
  private errorCallback?: ErrorCallback
  private loadingCallback?: LoadingCallback
  private viewportInfo: ViewportInfo = { width: 1920, height: 1080, scale: 1 }

  constructor(
    updateCallback?: LayerUpdateCallback,
    errorCallback?: ErrorCallback,
    loadingCallback?: LoadingCallback
  ) {
    this.updateCallback = updateCallback
    this.errorCallback = errorCallback
    this.loadingCallback = loadingCallback
  }

  /**
   * Load configuration from JSON file
   */
  async loadConfig(configPath: string = '/LogicLayer.config.json'): Promise<void> {
    try {
      this.reportLoading('Loading configuration...', 0, 1)
      
      const response = await fetch(configPath)
      if (!response.ok) {
        throw new Error(`Failed to load config: ${response.status} ${response.statusText}`)
      }

      const configData = await response.json()
      await this.setConfig(configData)
      
      this.reportLoading('Configuration loaded', 1, 1)
    } catch (error) {
      const errorMsg = `Failed to load config from ${configPath}: ${error}`
      console.error(errorMsg)
      this.reportError(new Error(errorMsg))
      throw error
    }
  }

  /**
   * Set configuration directly (for dynamic updates)
   */
  async setConfig(configData: any): Promise<void> {
    try {
      // Validate configuration
      const validation = LayerValidator.validate(configData)
      
      if (!validation.isValid) {
        const errorMsg = `Invalid configuration: ${validation.errors.join(', ')}`
        this.reportError(new Error(errorMsg))
        throw new Error(errorMsg)
      }

      // Log warnings if any
      if (validation.warnings.length > 0) {
        console.warn('Configuration warnings:', validation.warnings)
      }

      this.config = configData as LayerConfig
      await this.processLayers()
      
      console.log(`Configuration loaded with ${this.config.layers.length} layers`)
    } catch (error) {
      this.reportError(error instanceof Error ? error : new Error('Unknown error'))
      throw error
    }
  }

  /**
   * Process layers and convert to processed format
   */
  private async processLayers(): Promise<void> {
    if (!this.config) {
      throw new Error('No configuration loaded')
    }

    try {
      // Sort layers by z-index for proper rendering order
      const sortedLayers = [...this.config.layers].sort((a, b) => a.z - b.z)
      
      this.processedLayers = sortedLayers.map(layer => this.processLayer(layer))
      
      // Update visibility based on culling
      this.updateLayerVisibility()
      
      // Notify update callback
      if (this.updateCallback) {
        this.updateCallback([...this.processedLayers])
      }

      console.log(`Processed ${this.processedLayers.length} layers`)
    } catch (error) {
      const errorMsg = `Failed to process layers: ${error}`
      this.reportError(new Error(errorMsg))
      throw error
    }
  }

  /**
   * Process a single layer
   */
  private processLayer(layer: any): ProcessedLayer {
    // Calculate absolute position
    const absolutePosition = PositionCalculator.percentageToPixels(
      layer.position.xPct,
      layer.position.yPct,
      this.viewportInfo
    )

    // Calculate absolute scale
    const absoluteScale = PositionCalculator.percentageToScale(
      layer.scale.pct,
      this.viewportInfo
    )

    return {
      ...layer,
      absolutePosition,
      absoluteScale,
      isVisible: true, // Will be updated by culling system
      texture: null,   // Will be set by renderer
      sprite: null     // Will be set by renderer
    }
  }

  /**
   * Update viewport and recalculate positions
   */
  updateViewport(width: number, height: number): void {
    this.viewportInfo = PositionCalculator.getViewportInfo(width, height)
    
    // Recalculate all layer positions and scales
    this.processedLayers = this.processedLayers.map(layer => ({
      ...layer,
      absolutePosition: PositionCalculator.percentageToPixels(
        layer.position.xPct,
        layer.position.yPct,
        this.viewportInfo
      ),
      absoluteScale: PositionCalculator.percentageToScale(
        layer.scale.pct,
        this.viewportInfo
      )
    }))

    // Update visibility
    this.updateLayerVisibility()

    // Notify update callback
    if (this.updateCallback) {
      this.updateCallback([...this.processedLayers])
    }

    console.log(`Updated viewport: ${width}x${height}, scale: ${this.viewportInfo.scale.toFixed(2)}`)
  }

  /**
   * Update layer visibility based on culling
   */
  private updateLayerVisibility(): void {
    const mobileSettings = PositionCalculator.getMobileSettings(this.viewportInfo)
    
    this.processedLayers.forEach(layer => {
      // Default texture size (will be updated when texture is loaded)
      const defaultSize = 100
      
      layer.isVisible = PositionCalculator.isLayerVisible(
        layer.absolutePosition.x,
        layer.absolutePosition.y,
        layer.absoluteScale,
        defaultSize,
        defaultSize,
        this.viewportInfo,
        mobileSettings.cullPadding
      )
    })
  }

  /**
   * Update layer visibility with actual texture sizes
   */
  updateLayerVisibilityWithTextures(textures: Map<string, any>): void {
    this.processedLayers.forEach(layer => {
      const texture = textures.get(layer.imageRef.id)
      if (texture && texture.width && texture.height) {
        const mobileSettings = PositionCalculator.getMobileSettings(this.viewportInfo)
        
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

    // Notify update callback
    if (this.updateCallback) {
      this.updateCallback([...this.processedLayers])
    }
  }

  /**
   * Get current processed layers
   */
  getProcessedLayers(): ProcessedLayer[] {
    return [...this.processedLayers]
  }

  /**
   * Get image registry
   */
  getImageRegistry(): { [key: string]: string } {
    return this.config?.imageRegistry || {}
  }

  /**
   * Get layer by ID
   */
  getLayerById(id: string): ProcessedLayer | undefined {
    return this.processedLayers.find(layer => layer.id === id)
  }

  /**
   * Get current viewport info
   */
  getViewportInfo(): ViewportInfo {
    return { ...this.viewportInfo }
  }

  /**
   * Hot reload configuration (for dynamic updates)
   */
  async hotReload(configPath?: string): Promise<void> {
    try {
      if (configPath) {
        await this.loadConfig(configPath)
      } else {
        // Reload current config
        await this.processLayers()
      }
      console.log('Configuration hot reloaded successfully')
    } catch (error) {
      console.error('Hot reload failed:', error)
      this.reportError(error instanceof Error ? error : new Error('Hot reload failed'))
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalLayers: number
    visibleLayers: number
    layersWithTextures: number
    viewportInfo: ViewportInfo
  } {
    return {
      totalLayers: this.processedLayers.length,
      visibleLayers: this.processedLayers.filter(l => l.isVisible).length,
      layersWithTextures: this.processedLayers.filter(l => l.texture).length,
      viewportInfo: this.viewportInfo
    }
  }

  /**
   * Report loading progress
   */
  private reportLoading(message: string, loaded: number, total: number): void {
    if (this.loadingCallback) {
      this.loadingCallback({
        loaded,
        total,
        percentage: total > 0 ? Math.round((loaded / total) * 100) : 0,
        currentImage: message
      })
    }
  }

  /**
   * Report error
   */
  private reportError(error: Error): void {
    if (this.errorCallback) {
      this.errorCallback(error)
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.config = null
    this.processedLayers = []
    this.updateCallback = undefined
    this.errorCallback = undefined
    this.loadingCallback = undefined
  }
}