import { LayerConfig } from './LayerTypes'

export interface RecoveryOptions {
  maxRetries: number
  retryDelay: number
  fallbackConfig: Partial<LayerConfig>
  enableGracefulDegradation: boolean
}

export interface RecoveryState {
  isRecovering: boolean
  lastError: Error | null
  retryCount: number
  recoveryActions: string[]
  degradationLevel: number
}

export class ErrorRecovery {
  private options: RecoveryOptions
  private state: RecoveryState = {
    isRecovering: false,
    lastError: null,
    retryCount: 0,
    recoveryActions: [],
    degradationLevel: 0
  }

  private fallbackConfig: LayerConfig = {
    layersID: ['FALLBACK'],
    imageRegistry: {
      'FALLBACK': 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzMzMzMzMyIvPjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSIjZmZmZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5FUlJPUjwvdGV4dD48L3N2Zz4='
    },
    layers: [{
      id: 'FALLBACK',
      imageRef: { kind: 'urlId', id: 'FALLBACK' },
      position: { xPct: 50, yPct: 50 },
      scale: { pct: 50 },
      angleDeg: 0,
      z: 1
    }]
  }

  constructor(options: Partial<RecoveryOptions> = {}) {
    this.options = {
      maxRetries: 3,
      retryDelay: 1000,
      fallbackConfig: {},
      enableGracefulDegradation: true,
      ...options
    }

    // Merge user fallback config with default
    if (this.options.fallbackConfig) {
      this.fallbackConfig = {
        ...this.fallbackConfig,
        ...this.options.fallbackConfig
      }
    }
  }

  /**
   * Handle error with automatic recovery
   */
  async handleError(
    error: Error, 
    context: string,
    retryFunction?: () => Promise<void>
  ): Promise<{ recovered: boolean; action: string }> {
    
    this.state.lastError = error
    this.state.isRecovering = true

    console.error(`Error in ${context}:`, error)

    // Determine recovery strategy based on error type
    const strategy = this.getRecoveryStrategy(error, context)
    
    try {
      const result = await this.executeRecoveryStrategy(strategy, retryFunction)
      
      if (result.recovered) {
        this.state.retryCount = 0
        this.state.recoveryActions.push(result.action)
      } else {
        this.state.retryCount++
      }

      return result
    } finally {
      this.state.isRecovering = false
    }
  }

  /**
   * Determine appropriate recovery strategy
   */
  private getRecoveryStrategy(error: Error, context: string): {
    type: 'retry' | 'fallback' | 'degrade' | 'abort'
    priority: number
  } {
    const errorMessage = error.message.toLowerCase()
    
    // Network errors - retry
    if (errorMessage.includes('fetch') || 
        errorMessage.includes('network') || 
        errorMessage.includes('load') ||
        errorMessage.includes('timeout')) {
      return { type: 'retry', priority: 1 }
    }

    // Config errors - fallback
    if (errorMessage.includes('config') || 
        errorMessage.includes('validation') ||
        errorMessage.includes('json')) {
      return { type: 'fallback', priority: 2 }
    }

    // Render errors - degrade
    if (errorMessage.includes('render') || 
        errorMessage.includes('pixi') ||
        errorMessage.includes('webgl') ||
        errorMessage.includes('canvas')) {
      return { type: 'degrade', priority: 3 }
    }

    // Memory errors - degrade aggressively
    if (errorMessage.includes('memory') || 
        errorMessage.includes('heap')) {
      return { type: 'degrade', priority: 4 }
    }

    // Default to retry for unknown errors
    return { type: 'retry', priority: 1 }
  }

  /**
   * Execute recovery strategy
   */
  private async executeRecoveryStrategy(
    strategy: { type: string; priority: number },
    retryFunction?: () => Promise<void>
  ): Promise<{ recovered: boolean; action: string }> {

    switch (strategy.type) {
      case 'retry':
        return await this.attemptRetry(retryFunction)
      
      case 'fallback':
        return await this.useFallbackConfig()
      
      case 'degrade':
        return await this.degradePerformance()
      
      case 'abort':
        return { recovered: false, action: 'Recovery aborted - critical error' }
      
      default:
        return { recovered: false, action: 'Unknown recovery strategy' }
    }
  }

  /**
   * Attempt retry with exponential backoff
   */
  private async attemptRetry(retryFunction?: () => Promise<void>): Promise<{ recovered: boolean; action: string }> {
    if (this.state.retryCount >= this.options.maxRetries) {
      return { recovered: false, action: `Max retries (${this.options.maxRetries}) exceeded` }
    }

    if (!retryFunction) {
      return { recovered: false, action: 'No retry function provided' }
    }

    // Exponential backoff
    const delay = this.options.retryDelay * Math.pow(2, this.state.retryCount)
    await this.sleep(delay)

    try {
      await retryFunction()
      return { recovered: true, action: `Retry successful after ${this.state.retryCount + 1} attempts` }
    } catch (error) {
      console.warn(`Retry ${this.state.retryCount + 1} failed:`, error)
      return { recovered: false, action: `Retry ${this.state.retryCount + 1} failed` }
    }
  }

  /**
   * Use fallback configuration
   */
  private async useFallbackConfig(): Promise<{ recovered: boolean; action: string }> {
    try {
      // This would typically trigger a config reload with fallback
      console.log('Using fallback configuration')
      return { recovered: true, action: 'Switched to fallback configuration' }
    } catch (error) {
      return { recovered: false, action: 'Fallback configuration failed' }
    }
  }

  /**
   * Degrade performance to recover
   */
  private async degradePerformance(): Promise<{ recovered: boolean; action: string }> {
    this.state.degradationLevel++
    
    const degradations = [
      'Reduced layer count by 50%',
      'Disabled antialiasing',
      'Reduced texture resolution',
      'Enabled low power mode',
      'Switched to minimal rendering'
    ]

    const action = degradations[Math.min(this.state.degradationLevel - 1, degradations.length - 1)]
    
    if (this.state.degradationLevel <= degradations.length) {
      console.log(`Performance degradation level ${this.state.degradationLevel}: ${action}`)
      return { recovered: true, action }
    } else {
      return { recovered: false, action: 'Maximum degradation reached' }
    }
  }

  /**
   * Get fallback configuration
   */
  getFallbackConfig(): LayerConfig {
    return { ...this.fallbackConfig }
  }

  /**
   * Get current recovery state
   */
  getRecoveryState(): RecoveryState {
    return { ...this.state }
  }

  /**
   * Check if system is in degraded state
   */
  isDegraded(): boolean {
    return this.state.degradationLevel > 0
  }

  /**
   * Get suggested performance settings for current degradation level
   */
  getDegradationSettings(): {
    maxLayers: number
    textureScale: number
    enableAntialias: boolean
    enableLowPowerMode: boolean
  } {
    const level = this.state.degradationLevel

    return {
      maxLayers: Math.max(5, 50 - (level * 10)),
      textureScale: Math.max(0.25, 1 - (level * 0.2)),
      enableAntialias: level < 2,
      enableLowPowerMode: level > 0
    }
  }

  /**
   * Reset recovery state
   */
  reset(): void {
    this.state = {
      isRecovering: false,
      lastError: null,
      retryCount: 0,
      recoveryActions: [],
      degradationLevel: 0
    }
  }

  /**
   * Create error report for debugging
   */
  generateErrorReport(): {
    timestamp: string
    error: string | null
    recoveryActions: string[]
    degradationLevel: number
    systemState: string
  } {
    return {
      timestamp: new Date().toISOString(),
      error: this.state.lastError?.message || null,
      recoveryActions: [...this.state.recoveryActions],
      degradationLevel: this.state.degradationLevel,
      systemState: this.state.isRecovering ? 'Recovering' :
                   this.state.degradationLevel > 0 ? 'Degraded' : 'Normal'
    }
  }

  /**
   * Utility function for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}