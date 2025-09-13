import { ImageRegistry, LoadingProgress, LoadingCallback, ErrorCallback } from './LayerTypes'

export class ImagePreloader {
  private textureCache: Map<string, any> = new Map()
  private loadingPromises: Map<string, Promise<any>> = new Map()
  private fallbackTexture: any = null
  private loadingCallback?: LoadingCallback
  private errorCallback?: ErrorCallback

  constructor(
    private PIXI: any,
    loadingCallback?: LoadingCallback,
    errorCallback?: ErrorCallback
  ) {
    this.loadingCallback = loadingCallback
    this.errorCallback = errorCallback
    this.createFallbackTexture()
  }

  /**
   * Create a simple fallback texture for failed loads
   */
  private createFallbackTexture(): void {
    try {
      // Create a simple colored rectangle as fallback
      const graphics = new this.PIXI.Graphics()
      graphics.beginFill(0x666666)
      graphics.drawRect(0, 0, 100, 100)
      graphics.endFill()
      
      this.fallbackTexture = this.PIXI.RenderTexture.create({ width: 100, height: 100 })
      const renderer = this.PIXI.autoDetectRenderer()
      renderer.render(graphics, this.fallbackTexture)
    } catch (error) {
      console.warn('Failed to create fallback texture:', error)
    }
  }

  /**
   * Preload all images from the registry
   */
  async preloadImages(imageRegistry: ImageRegistry): Promise<Map<string, any>> {
    const imageIds = Object.keys(imageRegistry)
    const totalImages = imageIds.length
    let loadedImages = 0

    // Report initial progress
    this.reportProgress(loadedImages, totalImages)

    // Load all images concurrently
    const loadPromises = imageIds.map(async (imageId) => {
      try {
        const url = imageRegistry[imageId]
        this.reportProgress(loadedImages, totalImages, imageId)
        
        const texture = await this.loadSingleImage(url, imageId)
        loadedImages++
        this.reportProgress(loadedImages, totalImages)
        
        return { imageId, texture, success: true }
      } catch (error) {
        loadedImages++
        this.reportProgress(loadedImages, totalImages)
        
        console.warn(`Failed to load image ${imageId}:`, error)
        if (this.errorCallback) {
          this.errorCallback(new Error(`Failed to load image ${imageId}: ${error}`))
        }
        
        return { imageId, texture: this.fallbackTexture, success: false }
      }
    })

    // Wait for all loads to complete
    const results = await Promise.all(loadPromises)
    
    // Store successful textures in cache
    results.forEach(({ imageId, texture }) => {
      this.textureCache.set(imageId, texture)
    })

    console.log(`Preloaded ${results.length} textures (${results.filter(r => r.success).length} successful)`)
    
    return this.textureCache
  }

  /**
   * Load a single image with caching
   */
  private async loadSingleImage(url: string, imageId: string): Promise<any> {
    // Check if already cached
    if (this.textureCache.has(imageId)) {
      return this.textureCache.get(imageId)
    }

    // Check if already loading
    if (this.loadingPromises.has(imageId)) {
      return this.loadingPromises.get(imageId)
    }

    // Create loading promise
    const loadingPromise = new Promise((resolve, reject) => {
      const texture = this.PIXI.Texture.from(url)
      
      // Handle successful load
      const onLoad = () => {
        this.loadingPromises.delete(imageId)
        resolve(texture)
      }

      // Handle load error
      const onError = (error: any) => {
        this.loadingPromises.delete(imageId)
        reject(error)
      }

      // Set up event listeners
      if (texture.baseTexture.valid) {
        // Already loaded
        onLoad()
      } else {
        texture.baseTexture.once('loaded', onLoad)
        texture.baseTexture.once('error', onError)
        
        // Set timeout for failed loads
        setTimeout(() => {
          if (!texture.baseTexture.valid) {
            texture.baseTexture.removeAllListeners()
            onError(new Error('Load timeout'))
          }
        }, 10000) // 10 second timeout
      }
    })

    this.loadingPromises.set(imageId, loadingPromise)
    return loadingPromise
  }

  /**
   * Get texture from cache or return fallback
   */
  getTexture(imageId: string): any {
    return this.textureCache.get(imageId) || this.fallbackTexture
  }

  /**
   * Check if texture is cached
   */
  hasTexture(imageId: string): boolean {
    return this.textureCache.has(imageId)
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; imageIds: string[] } {
    return {
      size: this.textureCache.size,
      imageIds: Array.from(this.textureCache.keys())
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    // Dispose of textures to free memory
    this.textureCache.forEach((texture) => {
      if (texture && texture.destroy) {
        texture.destroy(true)
      }
    })
    
    this.textureCache.clear()
    this.loadingPromises.clear()
  }

  /**
   * Report loading progress
   */
  private reportProgress(loaded: number, total: number, currentImage?: string): void {
    if (this.loadingCallback) {
      this.loadingCallback({
        loaded,
        total,
        percentage: total > 0 ? Math.round((loaded / total) * 100) : 0,
        currentImage
      })
    }
  }

  /**
   * Preload additional images (for dynamic updates)
   */
  async preloadAdditionalImages(imageRegistry: ImageRegistry): Promise<void> {
    const newImages = Object.entries(imageRegistry).filter(
      ([imageId]) => !this.textureCache.has(imageId)
    )

    if (newImages.length === 0) {
      return
    }

    console.log(`Preloading ${newImages.length} additional images`)
    
    const newRegistry = Object.fromEntries(newImages)
    await this.preloadImages(newRegistry)
  }
}