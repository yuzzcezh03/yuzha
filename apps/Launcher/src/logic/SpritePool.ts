import { ProcessedLayer } from './LayerTypes'

export class SpritePool {
  private availableSprites: any[] = []
  private activeSprites: Map<string, any> = new Map()
  private maxPoolSize: number = 150

  constructor(private PIXI: any, maxPoolSize: number = 150) {
    this.maxPoolSize = maxPoolSize
  }

  /**
   * Get a sprite from the pool or create a new one
   */
  getSprite(layerId: string, texture: any): any {
    // Check if layer already has an active sprite
    if (this.activeSprites.has(layerId)) {
      const existingSprite = this.activeSprites.get(layerId)
      // Update texture if it changed
      if (existingSprite.texture !== texture) {
        existingSprite.texture = texture
      }
      return existingSprite
    }

    // Try to reuse a sprite from the pool
    let sprite = this.availableSprites.pop()
    
    if (!sprite) {
      // Create new sprite if pool is empty
      sprite = new this.PIXI.Sprite()
    }

    // Configure sprite
    sprite.texture = texture
    sprite.anchor.set(0.5, 0.5) // Center anchor point
    sprite.visible = true
    
    // Mark as active
    this.activeSprites.set(layerId, sprite)
    
    return sprite
  }

  /**
   * Return a sprite to the pool
   */
  returnSprite(layerId: string): void {
    const sprite = this.activeSprites.get(layerId)
    
    if (sprite) {
      // Remove from active sprites
      this.activeSprites.delete(layerId)
      
      // Reset sprite properties
      sprite.visible = false
      sprite.texture = this.PIXI.Texture.EMPTY
      sprite.position.set(0, 0)
      sprite.scale.set(1, 1)
      sprite.rotation = 0
      sprite.alpha = 1
      sprite.tint = 0xFFFFFF
      
      // Return to pool if not full
      if (this.availableSprites.length < this.maxPoolSize) {
        this.availableSprites.push(sprite)
      } else {
        // Destroy excess sprites to prevent memory leaks
        if (sprite.destroy) {
          sprite.destroy()
        }
      }
    }
  }

  /**
   * Update sprite properties from processed layer
   */
  updateSprite(layerId: string, layer: ProcessedLayer): void {
    const sprite = this.activeSprites.get(layerId)
    
    if (!sprite) {
      console.warn(`Sprite not found for layer ${layerId}`)
      return
    }

    // Update position
    sprite.position.set(layer.absolutePosition.x, layer.absolutePosition.y)
    
    // Update scale
    sprite.scale.set(layer.absoluteScale, layer.absoluteScale)
    
    // Update rotation (convert degrees to radians)
    sprite.rotation = (layer.angleDeg * Math.PI) / 180
    
    // Update visibility
    sprite.visible = layer.isVisible
    
    // Store reference back to layer
    sprite.userData = { layerId: layer.id, zIndex: layer.z }
  }

  /**
   * Get all active sprites sorted by z-index
   */
  getActiveSprites(): any[] {
    const sprites = Array.from(this.activeSprites.values())
    
    // Sort by z-index (stored in userData)
    return sprites.sort((a, b) => {
      const aZ = a.userData?.zIndex || 0
      const bZ = b.userData?.zIndex || 0
      return aZ - bZ
    })
  }

  /**
   * Remove all sprites for layers not in the current set
   */
  cleanupUnusedSprites(currentLayerIds: Set<string>): void {
    const activeIds = Array.from(this.activeSprites.keys())
    
    activeIds.forEach(layerId => {
      if (!currentLayerIds.has(layerId)) {
        this.returnSprite(layerId)
      }
    })
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    activeSprites: number
    availableSprites: number
    totalSprites: number
    maxPoolSize: number
  } {
    return {
      activeSprites: this.activeSprites.size,
      availableSprites: this.availableSprites.length,
      totalSprites: this.activeSprites.size + this.availableSprites.length,
      maxPoolSize: this.maxPoolSize
    }
  }

  /**
   * Clear all sprites and reset pool
   */
  destroy(): void {
    // Destroy all active sprites
    this.activeSprites.forEach(sprite => {
      if (sprite.destroy) {
        sprite.destroy()
      }
    })
    
    // Destroy all pooled sprites
    this.availableSprites.forEach(sprite => {
      if (sprite.destroy) {
        sprite.destroy()
      }
    })
    
    // Clear collections
    this.activeSprites.clear()
    this.availableSprites = []
  }

  /**
   * Force update z-index sorting for all active sprites
   */
  updateZIndexSorting(container: any): void {
    const sortedSprites = this.getActiveSprites()
    
    // Remove all sprites from container
    container.removeChildren()
    
    // Add sprites back in z-index order
    sortedSprites.forEach(sprite => {
      container.addChild(sprite)
    })
  }

  /**
   * Optimize pool size based on usage patterns
   */
  optimizePoolSize(): void {
    const stats = this.getStats()
    const usage = stats.activeSprites / this.maxPoolSize
    
    // If we're consistently using more than 80% of pool, expand it
    if (usage > 0.8 && this.maxPoolSize < 200) {
      this.maxPoolSize += 25
      console.log(`Expanded sprite pool to ${this.maxPoolSize}`)
    }
    
    // If we're using less than 40% and pool is large, shrink it
    if (usage < 0.4 && this.maxPoolSize > 50) {
      const excessSprites = this.availableSprites.splice(25)
      excessSprites.forEach(sprite => {
        if (sprite.destroy) {
          sprite.destroy()
        }
      })
      this.maxPoolSize -= 25
      console.log(`Reduced sprite pool to ${this.maxPoolSize}`)
    }
  }
}