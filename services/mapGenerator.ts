
import { MapConfig, GeneratedMap, Vector2D, Obstacle, BiomeType, SpecialZone, NavGraph, AABB } from '../types';
import { SeededRandom } from '../utils/random';
import { 
  generateRandomPolygon, 
  generateRect, 
  lineIntersectsObstacle, 
  distance, 
  isPointInPolygon, 
  generateBlob,
  catmullRom,
  getAABB
} from '../utils/geometry';
import polygonClipping from 'https://esm.sh/polygon-clipping';

const MAP_BORDER_THICKNESS = 40;
const SAFE_MARGIN = 140; 
const RIVER_WIDTH_MAP = [30, 45, 60, 75, 90, 110, 130, 155, 185, 220];

export function generateMap(config: MapConfig): GeneratedMap {
  const rng = new SeededRandom(config.seed);
  const obstacles: Obstacle[] = [];
  const zones: SpecialZone[] = [];
  const pois: Vector2D[] = [];

  for (let i = 0; i < config.poiCount; i++) {
    pois.push({
      x: rng.nextRange(SAFE_MARGIN + 100, config.width - SAFE_MARGIN - 100),
      y: rng.nextRange(SAFE_MARGIN + 100, config.height - SAFE_MARGIN - 100)
    });
  }

  const riverWeight = config.biomes[BiomeType.RIVER] || 0;
  if (riverWeight > 0) {
    generateStrictUnifiedHydrology(rng, config, zones, riverWeight);
  }

  const usableWidth = config.width - (SAFE_MARGIN * 2);
  const usableHeight = config.height - (SAFE_MARGIN * 2);
  const clusterCellSize = 250; // Aumentado ligeramente para reducir densidad en áreas gigantes
  const cols = Math.floor(usableWidth / clusterCellSize);
  const rows = Math.floor(usableHeight / clusterCellSize);
  
  // Capamos el número de clusters para evitar saturación en niveles 4 y 5
  const maxClusters = 55;
  const targetTotalClusters = Math.min(maxClusters, Math.floor((cols * rows) * config.obstacleDensity * 1.5));
  
  const biomeKeys = (Object.keys(config.biomes) as BiomeType[]).filter(b => b !== BiomeType.RIVER);
  const totalWeight = biomeKeys.reduce((a, b) => a + config.biomes[b], 0);
  
  let clustersToPlace: BiomeType[] = [];
  if (totalWeight > 0) {
    biomeKeys.forEach(biome => {
      const count = Math.round((config.biomes[biome] / totalWeight) * targetTotalClusters);
      for (let i = 0; i < count; i++) clustersToPlace.push(biome);
    });
  }

  let cells: {c: number, r: number}[] = [];
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) cells.push({c, r});
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  const placementCount = Math.min(clustersToPlace.length, cells.length);
  for (let i = 0; i < placementCount; i++) {
    const {c, r} = cells[i];
    const biome = clustersToPlace[i];
    const clusterCenter = {
      x: SAFE_MARGIN + (c * clusterCellSize) + clusterCellSize / 2 + rng.nextRange(-30, 30),
      y: SAFE_MARGIN + (r * clusterCellSize) + clusterCellSize / 2 + rng.nextRange(-30, 30)
    };

    if (pois.some(p => distance(p, clusterCenter) < 120)) continue;

    switch (biome) {
      case BiomeType.FOREST: generateForestCluster(rng, clusterCenter, obstacles, zones); break;
      case BiomeType.RUINS: generateRuinsCluster(rng, clusterCenter, obstacles, config.wallThickness); break;
      case BiomeType.ROCKS: generateRocksCluster(rng, clusterCenter, obstacles); break;
      case BiomeType.MUD: generateMudCluster(rng, clusterCenter, zones); break;
    }
  }

  const navGraph = generateOptimizedNavGraph(config, obstacles, pois);
  const respawnPos = { x: SAFE_MARGIN, y: config.height - SAFE_MARGIN };

  return { config, obstacles, zones, pois, navGraph, respawnPos };
}

function generateStrictUnifiedHydrology(rng: SeededRandom, config: MapConfig, zones: SpecialZone[], weight: number) {
  const baseWidth = RIVER_WIDTH_MAP[Math.min(weight - 1, RIVER_WIDTH_MAP.length - 1)];
  const innerMargin = MAP_BORDER_THICKNESS;
  const playableRect = {
    x1: innerMargin,
    y1: innerMargin,
    x2: config.width - innerMargin,
    y2: config.height - innerMargin
  };

  const isVertical = rng.next() > 0.5;
  let start: Vector2D, end: Vector2D;

  if (isVertical) {
    start = { x: rng.nextRange(playableRect.x1 + 100, playableRect.x2 - 100), y: playableRect.y1 };
    end = { x: rng.nextRange(playableRect.x1 + 100, playableRect.x2 - 100), y: playableRect.y2 };
  } else {
    start = { x: playableRect.x1, y: rng.nextRange(playableRect.y1 + 100, playableRect.y2 - 100) };
    end = { x: playableRect.x2, y: rng.nextRange(playableRect.y1 + 100, playableRect.y2 - 100) };
  }

  // Reducimos complejidad de suavizado para evitar lag en mapas masivos
  const smoothSegments = config.width > 2200 ? 10 : 15;

  const mainControl = [
    start,
    ...generateClampedPath(rng, start, end, 5, 200, playableRect),
    end
  ];
  const mainNodes = smoothPath(mainControl, smoothSegments); 
  const mainPoly = getOffsetPolygonCoords(mainNodes, (i) => {
    const variation = 1 + (Math.sin(i * 0.4) * config.riverWidthVariation * 0.3);
    return baseWidth * variation;
  });

  const polygonsToUnion: polygonClipping.Geom[] = [[mainPoly]];
  const approvedBranchPolys: [number, number][][][] = [];

  let branchesGenerated = 0;
  let attempts = 0;
  while (branchesGenerated < config.riverTributaries && attempts < config.riverTributaries * 4) {
    attempts++;
    const attachIdx = rng.nextInt(10, mainNodes.length - 10);
    const attachPoint = mainNodes[attachIdx];
    const prevPoint = mainNodes[attachIdx - 1];
    
    const flowAngle = Math.atan2(attachPoint.y - prevPoint.y, attachPoint.x - prevPoint.x);
    const side = rng.next() > 0.5 ? 1 : -1;
    const branchAngle = flowAngle + side * (config.riverBranchAngle * Math.PI / 180);

    let length = rng.nextRange(150, 350);
    let success = false;

    for (let lStep = 0; lStep < 2; lStep++) {
      const targetEnd = {
        x: attachPoint.x + Math.cos(branchAngle) * length,
        y: attachPoint.y + Math.sin(branchAngle) * length
      };

      const branchControl = [
        attachPoint,
        { x: attachPoint.x + Math.cos(branchAngle) * (length * 0.5), y: attachPoint.y + Math.sin(branchAngle) * (length * 0.5) },
        targetEnd
      ];
      const branchNodes = smoothPath(branchControl, 6);
      const tribWidth = baseWidth * config.riverTribWidthRatio;
      
      const branchPoly = getOffsetPolygonCoords(branchNodes, (ti) => {
        const taper = 0.4 + (ti / (branchNodes.length - 1)) * 0.6;
        return tribWidth * taper;
      });

      const bGeom: any = [[branchPoly]];
      const mainGeom: any = [[mainPoly]];
      
      const overlapMain = polygonClipping.intersection(bGeom, mainGeom);
      
      let overlapOthers = false;
      for (const other of approvedBranchPolys) {
        const intersection = polygonClipping.intersection(bGeom, [other] as any);
        if (intersection && intersection.length > 0) {
          overlapOthers = true;
          break;
        }
      }

      const outOfBounds = branchNodes.some(n => 
        n.x < playableRect.x1 - 10 || n.x > playableRect.x2 + 10 || 
        n.y < playableRect.y1 - 10 || n.y > playableRect.y2 + 10
      );

      if (!overlapOthers && !outOfBounds) {
        polygonsToUnion.push([branchPoly]);
        approvedBranchPolys.push([branchPoly]);
        branchesGenerated++;
        success = true;
        break;
      } else {
        length *= 0.6; 
      }
    }
  }

  try {
    const unionResult = polygonClipping.union(...(polygonsToUnion as any));
    if (unionResult && unionResult.length > 0) {
      const mapClipRect = [
        [playableRect.x1, playableRect.y1], 
        [playableRect.x2, playableRect.y1], 
        [playableRect.x2, playableRect.y2], 
        [playableRect.x1, playableRect.y2], 
        [playableRect.x1, playableRect.y1]
      ];
      
      const finalClipped = polygonClipping.intersection(unionResult as any, [[mapClipRect]] as any);
      
      if (finalClipped && finalClipped.length > 0) {
        let bestPoly = finalClipped[0];
        let maxArea = 0;
        finalClipped.forEach(p => {
            const area = Math.abs(polygonArea(p[0]));
            if (area > maxArea) { maxArea = area; bestPoly = p; }
        });

        const vertices = bestPoly[0].map((c: any) => ({ x: c[0], y: c[1] }));
        zones.push({
          id: `river-unified-${rng.next()}`,
          type: BiomeType.RIVER,
          center: { x: config.width / 2, y: config.height / 2 },
          radius: 0,
          vertices,
          bounds: getAABB(vertices)
        });
      }
    }
  } catch (err) {
    console.warn("Hydrology engine skipped heavy union.");
  }
}

function polygonArea(nodes: any[]) {
    let area = 0;
    for (let i = 0; i < nodes.length; i++) {
        let j = (i + 1) % nodes.length;
        area += nodes[i][0] * nodes[j][1];
        area -= nodes[j][0] * nodes[i][1];
    }
    return area / 2;
}

function getOffsetPolygonCoords(path: Vector2D[], getWidth: (i: number) => number): [number, number][] {
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < path.length; i++) {
    const curr = path[i];
    const next = path[i + 1] || path[i];
    const prev = path[i - 1] || path[i];
    const dx = next.x - prev.x, dy = next.y - prev.y;
    const mag = Math.sqrt(dx*dx + dy*dy) || 1;
    const nx = -dy / mag, ny = dx / mag;
    const w = getWidth(i);
    left.push([curr.x + nx * w, curr.y + ny * w]);
    right.push([curr.x - nx * w, curr.y - ny * w]);
  }
  const result = [...left, ...right.reverse()];
  result.push(result[0]); 
  return result;
}

function generateClampedPath(rng: SeededRandom, start: Vector2D, end: Vector2D, steps: number, jitter: number, rect: any): Vector2D[] {
  const points: Vector2D[] = [];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const base = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    points.push({
      x: Math.max(rect.x1, Math.min(rect.x2, base.x + rng.nextRange(-jitter, jitter))),
      y: Math.max(rect.y1, Math.min(rect.y2, base.y + rng.nextRange(-jitter, jitter)))
    });
  }
  return points;
}

function smoothPath(controlPoints: Vector2D[], segments: number): Vector2D[] {
  const smoothed: Vector2D[] = [];
  const p = [controlPoints[0], ...controlPoints, controlPoints[controlPoints.length - 1]];
  for (let i = 1; i < p.length - 2; i++) {
    for (let t = 0; t < 1; t += 1 / segments) {
      smoothed.push(catmullRom(p[i-1], p[i], p[i+1], p[i+2], t));
    }
  }
  smoothed.push(controlPoints[controlPoints.length - 1]);
  return smoothed;
}

function generateForestCluster(rng: SeededRandom, center: Vector2D, obstacles: Obstacle[], zones: SpecialZone[]) {
  const r = rng.nextRange(110, 160);
  const vertices = generateBlob(rng, center, r, 10);
  zones.push({ id: `forest-${rng.next()}`, type: BiomeType.FOREST, center, radius: r, vertices, bounds: getAABB(vertices) });
  const trees = rng.nextInt(3, 5);
  for (let i = 0; i < trees; i++) {
    const a = rng.next() * Math.PI * 2, d = Math.sqrt(rng.next()) * r * 0.8;
    const rad = rng.nextRange(10, 16);
    const cp = { x: center.x + Math.cos(a) * d, y: center.y + Math.sin(a) * d };
    obstacles.push({ 
      id: `tree-${rng.next()}`, 
      type: 'circle', 
      subType: BiomeType.FOREST, 
      center: cp, 
      radius: rad, 
      isBlocking: true,
      bounds: { minX: cp.x - rad, minY: cp.y - rad, maxX: cp.x + rad, maxY: cp.y + rad }
    });
  }
}

function generateMudCluster(rng: SeededRandom, center: Vector2D, zones: SpecialZone[]) {
  const r = rng.nextRange(100, 150);
  const vertices = generateBlob(rng, center, r, 8);
  zones.push({ id: `mud-${rng.next()}`, type: BiomeType.MUD, center, radius: r, vertices, bounds: getAABB(vertices) });
}

function generateRuinsCluster(rng: SeededRandom, center: Vector2D, obstacles: Obstacle[], thick: number) {
  const s = rng.nextRange(120, 160), a = rng.next() * Math.PI * 2;
  const walls = [{x:0, y:0, w:s, h:thick}, {x:s/2, y:s/2, w:thick, h:s}];
  walls.forEach(w => {
    const wx = center.x + (w.x * Math.cos(a) - w.y * Math.sin(a)), wy = center.y + (w.x * Math.sin(a) + w.y * Math.cos(a));
    const vertices = generateRect({x:wx, y:wy}, w.w, w.h, a);
    obstacles.push({ id: `wall-${rng.next()}`, type: 'polygon', subType: BiomeType.RUINS, vertices, isBlocking: true, bounds: getAABB(vertices) });
  });
}

function generateRocksCluster(rng: SeededRandom, center: Vector2D, obstacles: Obstacle[]) {
  for (let i = 0; i < 3; i++) {
    const a = rng.next() * Math.PI * 2, d = rng.nextRange(0, 50);
    const p = { x: center.x + Math.cos(a) * d, y: center.y + Math.sin(a) * d };
    const vertices = generateRandomPolygon(rng, p, rng.nextRange(25, 45), 3, 5);
    obstacles.push({ id: `rock-${rng.next()}`, type: 'polygon', subType: BiomeType.ROCKS, vertices, isBlocking: true, bounds: getAABB(vertices) });
  }
}

function generateOptimizedNavGraph(config: MapConfig, obstacles: Obstacle[], pois: Vector2D[]): NavGraph {
  const nodes: Vector2D[] = [];
  const edges: [number, number][] = [];
  const pad = config.unitRadius || 18;
  
  // Escalar el paso logarítmicamente para mantener un número de nodos manejable
  // 1200 -> step 65 | 2800 -> step 115
  const step = 65 + Math.floor((config.width - 1200) / 32);
  
  const gridNodes: (number | null)[][] = [];
  const margin = MAP_BORDER_THICKNESS + 20;

  let nodeIdx = 0;
  for (let x = margin; x < config.width - margin; x += step) {
    const row: (number | null)[] = [];
    for (let y = margin; y < config.height - margin; y += step) {
      const p = { x, y };
      let blocked = false;
      
      for (const obs of obstacles) {
        if (!obs.isBlocking) continue;
        // Rápido check de bounding box antes del polígono
        if (p.x < obs.bounds.minX - pad || p.x > obs.bounds.maxX + pad || 
            p.y < obs.bounds.minY - pad || p.y > obs.bounds.maxY + pad) continue;

        if (obs.type === 'circle' && obs.center && obs.radius) {
          if (distance(p, obs.center) < obs.radius + pad) { blocked = true; break; }
        } else if (obs.type === 'polygon' && obs.vertices) {
          if (isPointInPolygon(p, obs.vertices)) { blocked = true; break; }
        }
      }
      
      if (!blocked) {
        nodes.push(p);
        row.push(nodeIdx++);
      } else {
        row.push(null);
      }
    }
    gridNodes.push(row);
  }

  const rows = gridNodes.length;
  for (let i = 0; i < rows; i++) {
    const cols = gridNodes[i].length;
    for (let j = 0; j < cols; j++) {
      const uIdx = gridNodes[i][j];
      if (uIdx === null) continue;
      const uPos = nodes[uIdx];

      const neighbors = [[i + 1, j], [i, j + 1], [i + 1, j + 1], [i - 1, j + 1]];
      for (const [ni, nj] of neighbors) {
        if (ni >= 0 && ni < rows && nj >= 0 && nj < cols) {
          const vIdx = gridNodes[ni][nj];
          if (vIdx !== null) {
            const vPos = nodes[vIdx];
            let obsLine = false;
            for (const obs of obstacles) {
              if (obs.isBlocking && lineIntersectsObstacle(uPos, vPos, obs, pad - 2)) {
                obsLine = true;
                break;
              }
            }
            if (!obsLine) edges.push([uIdx, vIdx]);
          }
        }
      }
    }
  }

  return { nodes, edges, isValid: true };
}
