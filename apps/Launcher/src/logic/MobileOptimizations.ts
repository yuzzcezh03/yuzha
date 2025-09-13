import { ViewportInfo } from './LayerTypes'

export interface MobileSettings {
  maxLayers: number
  targetFPS: number
  cullPadding: number
  textureScale: number
  enableLowPowerMode: boolean
  batchSize: number
  memoryLimit: number
}

export class MobileOptimizations {
  private settings: MobileSettings
  private deviceInfo: {
    isMobile: boolean
    isTablet: boolean
    isLowEnd: boolean
    pixelRatio: number
    memoryGB: number
  }

  constructor(viewportInfo: ViewportInfo) {
    this.deviceInfo = this.detectDevice(viewportInfo)
    this.settings = this.generateSettings()
  }

  /**
   * Detect device capabilities
   */
  private detectDevice(viewportInfo: ViewportInfo): typeof this.deviceInfo {
    const isMobile = viewportInfo.width < 768
    const isTablet = viewportInfo.width >= 768 && viewportInfo.width < 1024
    const pixelRatio = window.devicePixelRatio || 1
    
    // Estimate device performance
    const hardwareConcurrency = navigator.hardwareConcurrency || 2
    const memory = (navigator as any).deviceMemory || 4
    const isLowEnd = hardwareConcurrency <= 2 || memory <= 2

    return {
      isMobile,
      isTablet,
      isLowEnd,
      pixelRatio,
      memoryGB: memory
    }
  }

  /**
   * Generate optimized settings based on device
   */
  private generateSettings(): MobileSettings {
    const { isMobile, isTablet, isLowEnd, memoryGB } = this.deviceInfo

    if (isMobile) {
      return {
        maxLayers: isLowEnd ? 15 : 30,
        targetFPS: isLowEnd ? 24 : 30,
        cullPadding: 50,
        textureScale: isLowEnd ? 0.5 : 0.75,
        enableLowPowerMode: isLowEnd,
        batchSize: 5,
        memoryLimit: Math.min(memoryGB * 0.3, 1) // 30% of available memory, max 1GB
      }
    } else if (isTablet) {
      return {
        maxLayers: isLowEnd ? 30 : 50,
        targetFPS: isLowEnd ? 30 : 45,
        cullPadding: 75,
        textureScale: isLowEnd ? 0.75 : 1,
        enableLowPowerMode: isLowEnd,
        batchSize: 8,
        memoryLimit: Math.min(memoryGB * 0.4, 2)
      }
    } else {
      // Desktop
      return {
        maxLayers: isLowEnd ? 50 : 100,
        targetFPS: 60,
        cullPadding: 100,
        textureScale: 1,
        enableLowPowerMode: false,
        batchSize: 10,
        memoryLimit: Math.min(memoryGB * 0.5, 4)
      }
    }
  }

  /**
   * Get current mobile settings
   */
  getSettings(): MobileSettings {
    return { ...this.settings }
  }

  /**
   * Get device information
   */
  getDeviceInfo(): typeof this.deviceInfo {
    return { ...this.deviceInfo }
  }

  /**
   * Update settings based on performance
   */
  updateSettingsForPerformance(fps: number, memoryUsagePercent: number): boolean {
    let updated = false
    const originalSettings = { ...this.settings }

    // Adjust based on FPS
    if (fps < this.settings.targetFPS * 0.8) {
      // Performance is poor, reduce quality
      if (this.settings.maxLayers > 10) {
        this.settings.maxLayers = Math.max(10, this.settings.maxLayers - 10)
        updated = true
      }
      
      if (this.settings.textureScale > 0.25) {
        this.settings.textureScale = Math.max(0.25, this.settings.textureScale - 0.25)
        updated = true
      }
      
      if (!this.settings.enableLowPowerMode) {
        this.settings.enableLowPowerMode = true
        updated = true
      }
    } else if (fps > this.settings.targetFPS * 1.2) {
      // Performance is good, can increase quality
      const maxPossibleLayers = this.deviceInfo.isMobile ? 50 : this.deviceInfo.isTablet ? 75 : 100
      
      if (this.settings.maxLayers < maxPossibleLayers) {
        this.settings.maxLayers = Math.min(maxPossibleLayers, this.settings.maxLayers + 5)
        updated = true
      }
      
      if (this.settings.textureScale < 1 && !this.deviceInfo.isLowEnd) {
        this.settings.textureScale = Math.min(1, this.settings.textureScale + 0.25)
        updated = true
      }
    }

    // Adjust based on memory usage
    if (memoryUsagePercent > 80) {
      this.settings.enableLowPowerMode = true
      if (this.settings.maxLayers > 5) {
        this.settings.maxLayers = Math.max(5, this.settings.maxLayers - 5)
        updated = true
      }
    }

    // Log changes
    if (updated) {
      console.log('Mobile settings updated:', {
        before: originalSettings,
        after: this.settings,
        reason: { fps, memoryUsagePercent }
      })
    }

    return updated
  }

  /**
   * Get texture size multiplier for mobile
   */
  getTextureScale(): number {
    return this.settings.textureScale
  }

  /**
   * Check if should skip frame for power saving
   */
  shouldSkipFrame(frameCount: number): boolean {
    if (!this.settings.enableLowPowerMode) return false
    
    // Skip every other frame on low power mode
    return frameCount % 2 === 1
  }

  /**
   * Get batch processing size for loading
   */
  getBatchSize(): number {
    return this.settings.batchSize
  }

  /**
   * Check if memory usage is within limits
   */
  isMemoryWithinLimits(currentUsageMB: number): boolean {
    return currentUsageMB <= this.settings.memoryLimit * 1024 // Convert GB to MB
  }

  /**
   * Get culling padding for viewport
   */
  getCullPadding(): number {
    return this.settings.cullPadding
  }

  /**
   * Get maximum visible layers
   */
  getMaxLayers(): number {
    return this.settings.maxLayers
  }

  /**
   * Get target FPS
   */
  getTargetFPS(): number {
    return this.settings.targetFPS
  }

  /**
   * Get mobile-specific render settings
   */
  getRenderSettings(): {
    antialias: boolean
    resolution: number
    powerPreference: 'default' | 'high-performance' | 'low-power'
    clearBeforeRender: boolean
  } {
    return {
      antialias: !this.deviceInfo.isMobile || !this.settings.enableLowPowerMode,
      resolution: this.deviceInfo.pixelRatio * this.settings.textureScale,
      powerPreference: this.settings.enableLowPowerMode ? 'low-power' : 
                      this.deviceInfo.isMobile ? 'default' : 'high-performance',
      clearBeforeRender: !this.settings.enableLowPowerMode
    }
  }

  /**
   * Reset to default settings
   */
  resetToDefaults(): void {
    this.settings = this.generateSettings()
  }

  /**
   * Force enable low power mode
   */
  enableLowPowerMode(): void {
    this.settings.enableLowPowerMode = true
    this.settings.maxLayers = Math.min(this.settings.maxLayers, 15)
    this.settings.targetFPS = Math.min(this.settings.targetFPS, 30)
    this.settings.textureScale = Math.min(this.settings.textureScale, 0.5)
    
    console.log('Low power mode enabled:', this.settings)
  }

  /**
   * Get optimization summary
   */
  getOptimizationSummary(): {
    deviceClass: string
    activeOptimizations: string[]
    settings: MobileSettings
  } {
    const deviceClass = this.deviceInfo.isMobile ? 'Mobile' : 
                       this.deviceInfo.isTablet ? 'Tablet' : 'Desktop'
    
    const optimizations: string[] = []
    
    if (this.settings.enableLowPowerMode) optimizations.push('Low Power Mode')
    if (this.settings.textureScale < 1) optimizations.push(`Texture Scaling (${this.settings.textureScale}x)`)
    if (this.settings.maxLayers < 100) optimizations.push(`Layer Limiting (${this.settings.maxLayers})`)
    if (this.settings.targetFPS < 60) optimizations.push(`FPS Limiting (${this.settings.targetFPS})`)

    return {
      deviceClass,
      activeOptimizations: optimizations,
      settings: { ...this.settings }
    }
  }
}