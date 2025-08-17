// Closset shared types

export type UUID = string;

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
  | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light'
  | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';

export interface BrushDynamics {
  pressureToSize?: boolean;
  pressureToFlow?: boolean;
  pressureToOpacity?: boolean;
  tiltToRotation?: boolean;
  spacing?: number; // 0..1 relative spacing
  jitter?: number; // positional randomness
}

export interface BrushTexture {
  kind: 'tip' | 'pattern';
  path: string; // relative path to resource (converted to KTX2 where possible)
  tintable?: boolean; // whether colorized
}

export interface BrushPreset {
  id: UUID;
  name: string;
  size: number; // px at 1x
  hardness: number; // 0..1
  flow: number; // 0..1
  opacity: number; // 0..1
  rotation?: number; // deg
  spacing?: number; // px
  texture?: BrushTexture;
  dynamics?: BrushDynamics;
  tags?: string[];
  source?: 'krita' | 'custom';
}

export interface Layer {
  id: UUID;
  name: string;
  visible: boolean;
  opacity: number; // 0..1
  blendMode: BlendMode;
  // GPU texture handle is client-side only; server stores binary
  channel?: 'baseColor' | 'normal' | 'roughness' | 'metallic' | 'ao' | 'emissive' | 'height' | 'opacity';
}

export interface MaterialChannels {
  baseColor?: UUID; // layer stack id
  normal?: UUID;
  roughness?: UUID;
  metallic?: UUID;
  ao?: UUID;
  emissive?: UUID;
}

export interface Project {
  id: UUID;
  name: string;
  createdAt: string;
  updatedAt: string;
  modelPath: string; // original glTF/GLB
  textureDir: string; // folder for texture outputs
  materials: Record<string, MaterialChannels>; // material name -> channels
}

