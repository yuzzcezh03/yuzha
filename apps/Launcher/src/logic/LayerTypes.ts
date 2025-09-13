export interface ImageRef {
  kind: 'urlId'
  id: string
}

export interface Position {
  xPct: number
  yPct: number
}

export interface Scale {
  pct: number
}

export interface Layer {
  id: string
  imageRef: ImageRef
  position: Position
  scale: Scale
  angleDeg: number
  z: number
}

export interface ImageRegistry {
  [key: string]: string
}

export interface LayerConfig {
  layersID: string[]
  imageRegistry: ImageRegistry
  layers: Layer[]
}

export interface ProcessedLayer extends Layer {
  texture?: any // PixiJS Texture
  sprite?: any // PixiJS Sprite
  absolutePosition: {
    x: number
    y: number
  }
  absoluteScale: number
  isVisible: boolean
}

export interface ViewportInfo {
  width: number
  height: number
  scale: number
}

export interface LoadingProgress {
  loaded: number
  total: number
  percentage: number
  currentImage?: string
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export type LayerUpdateCallback = (layers: ProcessedLayer[]) => void
export type LoadingCallback = (progress: LoadingProgress) => void
export type ErrorCallback = (error: Error) => void