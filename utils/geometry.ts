
import { Vector2D, Obstacle, AABB } from '../types';

export function distance(a: Vector2D, b: Vector2D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function getAABB(points: Vector2D[]): AABB {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function isPointInAABB(p: Vector2D, bounds: AABB): boolean {
  return p.x >= bounds.minX && p.x <= bounds.maxX && p.y >= bounds.minY && p.y <= bounds.maxY;
}

export function aabbIntersect(a: AABB, b: AABB): boolean {
  return (a.minX <= b.maxX && a.maxX >= b.minX) &&
         (a.minY <= b.maxY && a.maxY >= b.minY);
}

export function lineIntersectsObstacle(p1: Vector2D, p2: Vector2D, obs: Obstacle, padding: number = 0): boolean {
  // Rápida comprobación de bounding box de la línea contra el obstáculo
  const lineBounds = getAABB([p1, p2]);
  const paddedObsBounds = {
    minX: obs.bounds.minX - padding,
    minY: obs.bounds.minY - padding,
    maxX: obs.bounds.maxX + padding,
    maxY: obs.bounds.maxY + padding
  };

  if (!aabbIntersect(lineBounds, paddedObsBounds)) return false;

  if (obs.type === 'circle' && obs.center && obs.radius) {
    return lineIntersectsCircle(p1, p2, obs.center, obs.radius + padding);
  } else if (obs.type === 'polygon' && obs.vertices) {
    for (let i = 0; i < obs.vertices.length; i++) {
      const v1 = obs.vertices[i];
      const v2 = obs.vertices[(i + 1) % obs.vertices.length];
      if (lineIntersectsLine(p1, p2, v1, v2)) return true;
    }
    if (isPointInPolygon(p1, obs.vertices) || isPointInPolygon(p2, obs.vertices)) return true;
  }
  return false;
}

export function lineIntersectsLine(a: Vector2D, b: Vector2D, c: Vector2D, d: Vector2D): boolean {
  const denominator = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (denominator === 0) return false;
  const t = ((c.x - a.x) * (c.y - d.y) - (c.y - a.y) * (c.x - d.x)) / denominator;
  const u = ((c.x - a.x) * (a.y - b.y) - (c.y - a.y) * (a.x - b.x)) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export function lineIntersectsCircle(p1: Vector2D, p2: Vector2D, center: Vector2D, radius: number): boolean {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p1, center) <= radius;
  const t = Math.max(0, Math.min(1, ((center.x - p1.x) * dx + (center.y - p1.y) * dy) / lenSq));
  const projection = { x: p1.x + t * dx, y: p1.y + t * dy };
  return distance(projection, center) <= radius;
}

export function isPointInPolygon(p: Vector2D, vertices: Vector2D[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y)) &&
      (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function generateRandomPolygon(rng: any, center: Vector2D, radius: number, minVertices: number = 3, maxVertices: number = 6): Vector2D[] {
  const count = rng.nextInt(minVertices, maxVertices);
  const vertices: Vector2D[] = [];
  const angles: number[] = [];
  for (let i = 0; i < count; i++) angles.push(rng.next() * Math.PI * 2);
  angles.sort((a, b) => a - b);
  for (const angle of angles) {
    const r = radius * (0.6 + rng.next() * 0.4);
    vertices.push({ x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r });
  }
  return vertices;
}

export function generateBlob(rng: any, center: Vector2D, radius: number, points: number = 12): Vector2D[] {
  const vertices: Vector2D[] = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const variance = 0.7 + rng.next() * 0.6;
    const r = radius * variance;
    vertices.push({
      x: center.x + Math.cos(angle) * r,
      y: center.y + Math.sin(angle) * r
    });
  }
  return vertices;
}

export function generateRect(center: Vector2D, w: number, h: number, angle: number): Vector2D[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfW = w / 2;
  const halfH = h / 2;
  const pts = [{ x: -halfW, y: -halfH }, { x: halfW, y: -halfH }, { x: halfW, y: halfH }, { x: -halfW, y: halfH }];
  return pts.map(p => ({
    x: center.x + p.x * cos - p.y * sin,
    y: center.y + p.x * sin + p.y * cos
  }));
}

export function catmullRom(p0: Vector2D, p1: Vector2D, p2: Vector2D, p3: Vector2D, t: number): Vector2D {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (
      (2 * p1.x) +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
    ),
    y: 0.5 * (
      (2 * p1.y) +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    )
  };
}
