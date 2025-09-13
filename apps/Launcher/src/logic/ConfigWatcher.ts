import { LayerConfig, ErrorCallback } from './LayerTypes'

export class ConfigWatcher {
  private watchInterval: number | null = null
  private lastModified: number = 0
  private configPath: string = '/LogicLayer.config.json'
  private onConfigChange?: (config: LayerConfig) => void
  private onError?: ErrorCallback
  private isWatching: boolean = false

  constructor(
    configPath: string = '/LogicLayer.config.json',
    onConfigChange?: (config: LayerConfig) => void,
    onError?: ErrorCallback
  ) {
    this.configPath = configPath
    this.onConfigChange = onConfigChange
    this.onError = onError
  }

  /**
   * Start watching for config changes
   */
  startWatching(intervalMs: number = 2000): void {
    if (this.isWatching) {
      this.stopWatching()
    }

    this.isWatching = true
    console.log(`Starting config watcher for ${this.configPath}`)

    // Initial load to get baseline
    this.checkForChanges()

    // Set up polling interval
    this.watchInterval = window.setInterval(() => {
      this.checkForChanges()
    }, intervalMs)
  }

  /**
   * Stop watching for changes
   */
  stopWatching(): void {
    if (this.watchInterval) {
      clearInterval(this.watchInterval)
      this.watchInterval = null
    }
    this.isWatching = false
    console.log('Config watcher stopped')
  }

  /**
   * Check if config file has changed
   */
  private async checkForChanges(): Promise<void> {
    try {
      // Try to get file modification time using HEAD request
      const response = await fetch(this.configPath, { 
        method: 'HEAD',
        cache: 'no-cache'
      })

      if (!response.ok) {
        throw new Error(`Config file not found: ${response.status}`)
      }

      // Get last-modified from headers
      const lastModifiedHeader = response.headers.get('last-modified')
      let currentModified = 0
      
      if (lastModifiedHeader) {
        currentModified = new Date(lastModifiedHeader).getTime()
      } else {
        // Fallback: use current time (will always trigger reload)
        currentModified = Date.now()
      }

      // Check if file has been modified
      if (this.lastModified > 0 && currentModified > this.lastModified) {
        console.log('Config file changed, reloading...')
        await this.loadAndNotify()
      }

      this.lastModified = currentModified

    } catch (error) {
      if (this.onError) {
        this.onError(new Error(`Config watcher error: ${error}`))
      }
    }
  }

  /**
   * Load config and notify callback
   */
  private async loadAndNotify(): Promise<void> {
    try {
      const response = await fetch(this.configPath, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to load config: ${response.status} ${response.statusText}`)
      }

      const configData = await response.json()
      
      if (this.onConfigChange) {
        this.onConfigChange(configData)
      }

    } catch (error) {
      if (this.onError) {
        this.onError(new Error(`Failed to reload config: ${error}`))
      }
    }
  }

  /**
   * Force reload config immediately
   */
  async forceReload(): Promise<void> {
    console.log('Force reloading config...')
    await this.loadAndNotify()
  }

  /**
   * Check if currently watching
   */
  isCurrentlyWatching(): boolean {
    return this.isWatching
  }

  /**
   * Update config path and restart watching if active
   */
  updateConfigPath(newPath: string): void {
    const wasWatching = this.isWatching
    
    if (wasWatching) {
      this.stopWatching()
    }

    this.configPath = newPath
    this.lastModified = 0

    if (wasWatching) {
      this.startWatching()
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopWatching()
    this.onConfigChange = undefined
    this.onError = undefined
  }
}