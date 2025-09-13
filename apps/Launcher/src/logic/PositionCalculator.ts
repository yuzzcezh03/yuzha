import { ViewportInfo } from './LayerTypes'

export class PositionCalculator {
  private static readonly BASE_WIDTH = 1920
  private static readonly BASE_HEIGHT = 1080

  /**
   * Calculate viewport information for responsive scaling
   */
  static getViewportInfo(containerWidth: number, containerHeight: number): ViewportInfo {
    // Calculate aspect ratios
    const baseAspect = this.BASE_WIDTH / this.BASE_HEIGHT
    const containerAspect = containerWidth / containerHeight

    let scale: number
    let width: number
    let height: number

    if (containerAspect > baseAspect) {
      // Container is wider than base aspect - fit to height
      scale = containerHeight / this.BASE_HEIGHT
      height = containerHeight
      width = this.BASE_WIDTH * scale
    } else {
      // Container is taller than base aspect - fit to width
      scale = containerWidth / this.BASE_WIDTH
      width = containerWidth
      height = this.BASE_HEIGHT * scale
    }

    return {
      width,
      height,
      scale
    }
  }

  /**
   * Convert percentage position to absolute pixels
   */
  static percentageToPixels(
    xPct: number, 
    yPct: number, 
    viewportInfo: ViewportInfo
  ): { x: number; y: number } {
    return {
      x: (xPct / 100) * viewportInfo.width,
      y: (yPct / 100) * viewportInfo.height
    }
  }

  /**
   * Convert percentage scale to absolute scale factor
   */
  static percentageToScale(scalePct: number, viewportInfo: ViewportInfo): number {
    return (scalePct / 100) * viewportInfo.scale
  }

  /**
   * Check if a layer is visible within the viewport (for culling)
   */
  static isLayerVisible(
    x: number, 
    y: number, 
    scale: number, 
    textureWidth: number, 
    textureHeight: number,
    viewportInfo: ViewportInfo,
    padding: number = 100
  ): boolean {
    // Calculate sprite bounds with padding for culling
    const spriteWidth = textureWidth * scale
    const spriteHeight = textureHeight * scale
    
    const left = x - spriteWidth / 2 - padding
    const right = x + spriteWidth / 2 + padding
    const top = y - spriteHeight / 2 - padding
    const bottom = y + spriteHeight / 2 + padding

    // Check if sprite bounds intersect with viewport
    return !(
      right < 0 || 
      left > viewportInfo.width || 
      bottom < 0 || 
      top > viewportInfo.height
    )
  }

  /**
   * Get mobile-optimized settings
   */
  static getMobileSettings(viewportInfo: ViewportInfo): {
    cullPadding: number
    maxLayers: number
    minScale: number
  } {
    const isMobile = viewportInfo.width < 768
    const isTablet = viewportInfo.width >= 768 && viewportInfo.width < 1024

    return {
      cullPadding: isMobile ? 50 : isTablet ? 75 : 100,
      maxLayers: isMobile ? 50 : isTablet ? 75 : 100,
      minScale: isMobile ? 0.1 : 0.05
    }
  }

  /**
   * Calculate distance from viewport center (for LOD or priority rendering)
   */
  static getDistanceFromCenter(
    x: number, 
    y: number, 
    viewportInfo: ViewportInfo
  ): number {
    const centerX = viewportInfo.width / 2
    const centerY = viewportInfo.height / 2
    
    return Math.sqrt(
      Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
    )
  }
}