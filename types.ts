
export type Vector2D = { x: number; y: number };

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export enum BiomeType {
  FOREST = 'Forest',
  ROCKS = 'Rocks',
  RUINS = 'Ruins',
  MUD = 'Mud',
  RIVER = 'River'
}

export type SelectionMode = 'target' | 'respawn';

export interface MapConfig {
  width: number;
  height: number;
  seed: string;
  obstacleDensity: number; 
  biomes: Record<BiomeType, number>; 
  mainPathsCount: number;
  poiCount: number;
  unitRadius: number; 
  wallThickness: number; 
  riverWidth: number;     
  riverTributaries: number; 
  riverTribWidthRatio: number; 
  riverWidthVariation: number; 
  riverBranchAngle: number;    
}

export interface Obstacle {
  id: string;
  type: 'polygon' | 'circle';
  subType: BiomeType;
  vertices?: Vector2D[]; 
  center?: Vector2D;     
  radius?: number;       
  isBlocking: boolean;
  bounds: AABB; // Precalculado para culling
}

export interface SpecialZone {
  id: string;
  center: Vector2D;
  radius: number;
  type: BiomeType;
  vertices?: Vector2D[]; 
  bounds: AABB; // Precalculado para culling
}

export interface NavGraph {
  nodes: Vector2D[];
  edges: [number, number][];
  isValid: boolean;
}

export interface GeneratedMap {
  config: MapConfig;
  obstacles: Obstacle[];
  zones: SpecialZone[];
  pois: Vector2D[];
  navGraph: NavGraph;
  respawnPos: Vector2D;
}
