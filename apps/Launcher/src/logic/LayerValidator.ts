import { LayerConfig, ValidationResult } from './LayerTypes'

export class LayerValidator {
  static validate(config: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    }

    try {
      // Check if config is an object
      if (!config || typeof config !== 'object') {
        result.errors.push('Config must be a valid object')
        result.isValid = false
        return result
      }

      // Validate layersID
      if (!Array.isArray(config.layersID)) {
        result.errors.push('layersID must be an array')
        result.isValid = false
      } else if (config.layersID.length === 0) {
        result.warnings.push('layersID array is empty')
      }

      // Validate imageRegistry
      if (!config.imageRegistry || typeof config.imageRegistry !== 'object') {
        result.errors.push('imageRegistry must be an object')
        result.isValid = false
      } else {
        // Check if all registry values are valid URLs
        Object.entries(config.imageRegistry).forEach(([key, url]) => {
          if (typeof url !== 'string') {
            result.errors.push(`imageRegistry[${key}] must be a string`)
            result.isValid = false
          } else if (!this.isValidUrl(url as string)) {
            result.warnings.push(`imageRegistry[${key}] may not be a valid URL: ${url}`)
          }
        })
      }

      // Validate layers
      if (!Array.isArray(config.layers)) {
        result.errors.push('layers must be an array')
        result.isValid = false
      } else if (config.layers.length === 0) {
        result.warnings.push('layers array is empty')
      } else {
        config.layers.forEach((layer: any, index: number) => {
          this.validateLayer(layer, index, config.imageRegistry, result)
        })
      }

      // Cross-validation: Check if layersID matches layers
      if (result.isValid && config.layersID && config.layers) {
        const layerIds = new Set(config.layers.map((l: any) => l.id))
        const declaredIds = new Set(config.layersID)
        
        // Check for missing layers
        config.layersID.forEach((id: string) => {
          if (!layerIds.has(id)) {
            result.warnings.push(`Layer ${id} declared in layersID but not found in layers array`)
          }
        })

        // Check for extra layers
        config.layers.forEach((layer: any) => {
          if (!declaredIds.has(layer.id)) {
            result.warnings.push(`Layer ${layer.id} found in layers but not declared in layersID`)
          }
        })
      }

    } catch (error) {
      result.errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      result.isValid = false
    }

    return result
  }

  private static validateLayer(layer: any, index: number, imageRegistry: any, result: ValidationResult): void {
    const prefix = `layers[${index}]`

    // Check required properties
    if (!layer.id || typeof layer.id !== 'string') {
      result.errors.push(`${prefix}.id must be a non-empty string`)
      result.isValid = false
    }

    // Validate imageRef
    if (!layer.imageRef || typeof layer.imageRef !== 'object') {
      result.errors.push(`${prefix}.imageRef must be an object`)
      result.isValid = false
    } else {
      if (layer.imageRef.kind !== 'urlId') {
        result.errors.push(`${prefix}.imageRef.kind must be 'urlId'`)
        result.isValid = false
      }
      if (!layer.imageRef.id || typeof layer.imageRef.id !== 'string') {
        result.errors.push(`${prefix}.imageRef.id must be a non-empty string`)
        result.isValid = false
      } else if (imageRegistry && !imageRegistry[layer.imageRef.id]) {
        result.errors.push(`${prefix}.imageRef.id '${layer.imageRef.id}' not found in imageRegistry`)
        result.isValid = false
      }
    }

    // Validate position
    if (!layer.position || typeof layer.position !== 'object') {
      result.errors.push(`${prefix}.position must be an object`)
      result.isValid = false
    } else {
      if (typeof layer.position.xPct !== 'number' || layer.position.xPct < 0 || layer.position.xPct > 100) {
        result.errors.push(`${prefix}.position.xPct must be a number between 0 and 100`)
        result.isValid = false
      }
      if (typeof layer.position.yPct !== 'number' || layer.position.yPct < 0 || layer.position.yPct > 100) {
        result.errors.push(`${prefix}.position.yPct must be a number between 0 and 100`)
        result.isValid = false
      }
    }

    // Validate scale
    if (!layer.scale || typeof layer.scale !== 'object') {
      result.errors.push(`${prefix}.scale must be an object`)
      result.isValid = false
    } else {
      if (typeof layer.scale.pct !== 'number' || layer.scale.pct <= 0) {
        result.errors.push(`${prefix}.scale.pct must be a positive number`)
        result.isValid = false
      }
    }

    // Validate angleDeg
    if (typeof layer.angleDeg !== 'number') {
      result.errors.push(`${prefix}.angleDeg must be a number`)
      result.isValid = false
    }

    // Validate z
    if (typeof layer.z !== 'number') {
      result.errors.push(`${prefix}.z must be a number`)
      result.isValid = false
    }
  }

  private static isValidUrl(url: string): boolean {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }
}