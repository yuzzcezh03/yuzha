export interface PerformanceMetrics {
  fps: number
  frameTime: number
  memoryUsage: {
    used: number
    total: number
    percentage: number
  }
  renderTime: number
  spriteCount: number
  textureCount: number
  lastUpdate: number
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    fps: 0,
    frameTime: 0,
    memoryUsage: { used: 0, total: 0, percentage: 0 },
    renderTime: 0,
    spriteCount: 0,
    textureCount: 0,
    lastUpdate: Date.now()
  }

  private frameCount: number = 0
  private lastFrameTime: number = performance.now()
  private frameHistory: number[] = []
  private maxFrameHistory: number = 60
  private onMetricsUpdate?: (metrics: PerformanceMetrics) => void
  private updateInterval: number | null = null

  constructor(onMetricsUpdate?: (metrics: PerformanceMetrics) => void) {
    this.onMetricsUpdate = onMetricsUpdate
    this.startMonitoring()
  }

  /**
   * Start performance monitoring
   */
  startMonitoring(intervalMs: number = 1000): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
    }

    this.updateInterval = window.setInterval(() => {
      this.updateMetrics()
    }, intervalMs)
  }

  /**
   * Stop performance monitoring
   */
  stopMonitoring(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
  }

  /**
   * Record a frame render
   */
  recordFrame(): void {
    const currentTime = performance.now()
    const frameTime = currentTime - this.lastFrameTime
    
    this.frameHistory.push(frameTime)
    if (this.frameHistory.length > this.maxFrameHistory) {
      this.frameHistory.shift()
    }

    this.frameCount++
    this.lastFrameTime = currentTime
  }

  /**
   * Update sprite and texture counts
   */
  updateCounts(spriteCount: number, textureCount: number): void {
    this.metrics.spriteCount = spriteCount
    this.metrics.textureCount = textureCount
  }

  /**
   * Record render time
   */
  recordRenderTime(renderTime: number): void {
    this.metrics.renderTime = renderTime
  }

  /**
   * Update all metrics
   */
  private updateMetrics(): void {
    // Calculate FPS from frame history
    if (this.frameHistory.length > 0) {
      const avgFrameTime = this.frameHistory.reduce((a, b) => a + b, 0) / this.frameHistory.length
      this.metrics.fps = avgFrameTime > 0 ? Math.round(1000 / avgFrameTime) : 0
      this.metrics.frameTime = Math.round(avgFrameTime * 100) / 100
    }

    // Update memory usage if available
    if ('memory' in performance) {
      const memory = (performance as any).memory
      this.metrics.memoryUsage = {
        used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
        percentage: Math.round((memory.usedJSHeapSize / memory.totalJSHeapSize) * 100)
      }
    }

    this.metrics.lastUpdate = Date.now()

    // Notify callback
    if (this.onMetricsUpdate) {
      this.onMetricsUpdate({ ...this.metrics })
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics }
  }

  /**
   * Check if performance is degraded
   */
  isPerformanceDegraded(): {
    degraded: boolean
    reasons: string[]
  } {
    const reasons: string[] = []
    
    if (this.metrics.fps < 30) {
      reasons.push(`Low FPS: ${this.metrics.fps}`)
    }
    
    if (this.metrics.frameTime > 33) {
      reasons.push(`High frame time: ${this.metrics.frameTime}ms`)
    }
    
    if (this.metrics.memoryUsage.percentage > 80) {
      reasons.push(`High memory usage: ${this.metrics.memoryUsage.percentage}%`)
    }
    
    if (this.metrics.renderTime > 16) {
      reasons.push(`Long render time: ${this.metrics.renderTime}ms`)
    }

    return {
      degraded: reasons.length > 0,
      reasons
    }
  }

  /**
   * Get performance optimization suggestions
   */
  getOptimizationSuggestions(): string[] {
    const suggestions: string[] = []
    const performance = this.isPerformanceDegraded()
    
    if (performance.degraded) {
      if (this.metrics.spriteCount > 100) {
        suggestions.push('Reduce visible sprite count with better culling')
      }
      
      if (this.metrics.textureCount > 50) {
        suggestions.push('Implement texture atlasing to reduce texture count')
      }
      
      if (this.metrics.memoryUsage.percentage > 70) {
        suggestions.push('Clear unused textures from memory')
      }
      
      if (this.metrics.fps < 30) {
        suggestions.push('Enable mobile optimizations or reduce quality settings')
      }
    }

    return suggestions
  }

  /**
   * Reset performance counters
   */
  reset(): void {
    this.frameCount = 0
    this.frameHistory = []
    this.lastFrameTime = performance.now()
    this.metrics = {
      fps: 0,
      frameTime: 0,
      memoryUsage: { used: 0, total: 0, percentage: 0 },
      renderTime: 0,
      spriteCount: 0,
      textureCount: 0,
      lastUpdate: Date.now()
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopMonitoring()
    this.onMetricsUpdate = undefined
  }
}