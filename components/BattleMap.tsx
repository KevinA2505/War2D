
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { GeneratedMap, BiomeType, Vector2D, Obstacle, SelectionMode, AABB } from '../types';
import { isPointInPolygon, distance, isPointInAABB } from '../utils/geometry';
import { Crosshair, MapPin } from 'lucide-react';

interface Props {
  map: GeneratedMap;
  debug: boolean;
  onUpdateRespawn?: (pos: Vector2D) => void;
}

const COLORS = {
  [BiomeType.FOREST]: { fill: '#064e3b', stroke: '#059669', zone: 'rgba(5, 150, 105, 0.12)' },
  [BiomeType.ROCKS]: { fill: '#334155', stroke: '#64748b', zone: 'rgba(100, 116, 139, 0.1)' },
  [BiomeType.RUINS]: { fill: '#1e293b', stroke: '#475569', zone: 'rgba(71, 85, 105, 0.1)' },
  [BiomeType.MUD]: { fill: '#451a03', stroke: '#92400e', zone: 'rgba(146, 64, 14, 0.25)' },
  [BiomeType.RIVER]: { fill: '#1e3a8a', stroke: '#3b82f6', zone: 'rgba(59, 130, 246, 0.4)' }
};

const BORDER_COLOR = '#450a0a'; 
const BORDER_THICKNESS = 40;

const BattleMap: React.FC<Props> = ({ map, debug, onUpdateRespawn }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [viewOffset, setViewOffset] = useState<Vector2D>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.8);
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState<Vector2D | null>(null);

  const [selectionMode, setSelectionMode] = useState<SelectionMode>('target');
  const [screenPos, setScreenPos] = useState<Vector2D | null>(null);
  const [worldPos, setWorldPos] = useState<Vector2D | null>(null);
  const [hoveredObstacle, setHoveredObstacle] = useState<Obstacle | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<Obstacle | null>(null);
  const [targetPos, setTargetPos] = useState<Vector2D | null>(null);

  // OPTIMIZACIÓN: Culling dinámico basado en Viewport
  const updatePositions = (e: React.MouseEvent) => {
    if (!containerRef.current || !canvasRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const canvasRect = canvasRef.current.getBoundingClientRect();
    
    const sx = e.clientX - containerRect.left;
    const sy = e.clientY - containerRect.top;
    setScreenPos({ x: sx, y: sy });
    
    const lx = e.clientX - canvasRect.left;
    const ly = e.clientY - canvasRect.top;
    const wx = (lx - viewOffset.x) / zoom;
    const wy = (ly - viewOffset.y) / zoom;
    const wPos = { x: wx, y: wy };
    setWorldPos(wPos);

    if (map) {
      let found: Obstacle | null = null;
      for (const obs of map.obstacles) {
        // Primero check de bounding box (super rápido)
        if (!isPointInAABB(wPos, obs.bounds)) continue;

        if (obs.type === 'circle' && obs.center && obs.radius) {
          if (distance(wPos, obs.center) <= obs.radius) { found = obs; break; }
        } else if (obs.type === 'polygon' && obs.vertices) {
          if (isPointInPolygon(wPos, obs.vertices)) { found = obs; break; }
        }
      }
      setHoveredObstacle(found);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      setIsPanning(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning && lastMousePos) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      setViewOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
    updatePositions(e);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button === 2) {
      setIsPanning(false);
      setLastMousePos(null);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(Math.max(zoom * factor, 0.05), 8.0);

    const worldX = (mouseX - viewOffset.x) / zoom;
    const worldY = (mouseY - viewOffset.y) / zoom;

    const newOffsetX = mouseX - worldX * newZoom;
    const newOffsetY = mouseY - worldY * newZoom;

    setViewOffset({ x: newOffsetX, y: newOffsetY });
    setZoom(newZoom);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (e.button !== 0 || !worldPos) return;
    if (selectionMode === 'respawn') {
      onUpdateRespawn?.(worldPos);
    } else {
      setTargetPos(worldPos);
      setSelectedEntity(hoveredObstacle);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); 
    if (!ctx) return;

    canvas.width = map.config.width;
    canvas.height = map.config.height;

    const render = () => {
      const viewL = -viewOffset.x / zoom;
      const viewT = -viewOffset.y / zoom;
      const viewR = (canvas.width - viewOffset.x) / zoom;
      const viewB = (canvas.height - viewOffset.y) / zoom;
      const viewport: AABB = { minX: viewL, minY: viewT, maxX: viewR, maxY: viewB };

      ctx.save();
      ctx.translate(viewOffset.x, viewOffset.y);
      ctx.scale(zoom, zoom);
      
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(viewL, viewT, canvas.width/zoom, canvas.height/zoom);
      
      const playX = BORDER_THICKNESS;
      const playY = BORDER_THICKNESS;
      const playW = map.config.width - BORDER_THICKNESS * 2;
      const playH = map.config.height - BORDER_THICKNESS * 2;

      // Rejilla Optimizada (solo en viewport)
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1 / zoom;
      const gridStep = 100;
      ctx.beginPath();
      for(let x=Math.max(0, Math.floor(viewL/gridStep)*gridStep); x < Math.min(map.config.width, viewR + gridStep); x += gridStep) { 
        ctx.moveTo(x, Math.max(0, viewT)); ctx.lineTo(x, Math.min(map.config.height, viewB)); 
      }
      for(let y=Math.max(0, Math.floor(viewT/gridStep)*gridStep); y < Math.min(map.config.height, viewB + gridStep); y += gridStep) { 
        ctx.moveTo(Math.max(0, viewL), y); ctx.lineTo(Math.min(map.config.width, viewR), y); 
      }
      ctx.stroke();

      // Culling Zonas
      ctx.save();
      ctx.beginPath(); ctx.rect(playX, playY, playW, playH); ctx.clip();
      map.zones.forEach(zone => {
        // Descarte si está fuera de vista
        if (zone.bounds.minX > viewR || zone.bounds.maxX < viewL || zone.bounds.minY > viewB || zone.bounds.maxY < viewT) return;

        ctx.fillStyle = COLORS[zone.type]?.zone || 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        if (zone.vertices && zone.vertices.length > 0) {
          ctx.moveTo(zone.vertices[0].x, zone.vertices[0].y);
          for (let i = 1; i < zone.vertices.length; i++) ctx.lineTo(zone.vertices[i].x, zone.vertices[i].y);
          ctx.closePath(); ctx.fill();
        } else {
          ctx.arc(zone.center.x, zone.center.y, zone.radius, 0, Math.PI * 2); ctx.fill();
        }
      });
      ctx.restore();

      // Culling Obstáculos
      ctx.save();
      ctx.beginPath(); ctx.rect(playX, playY, playW, playH); ctx.clip();
      map.obstacles.forEach(obs => {
        if (obs.bounds.minX > viewR || obs.bounds.maxX < viewL || obs.bounds.minY > viewB || obs.bounds.maxY < viewT) return;

        const isHovered = hoveredObstacle?.id === obs.id;
        const isSelected = selectedEntity?.id === obs.id;
        ctx.fillStyle = isSelected ? '#4f46e5' : isHovered ? '#6366f1' : (COLORS[obs.subType as BiomeType]?.fill || '#555');
        ctx.strokeStyle = isSelected ? '#818cf8' : isHovered ? '#818cf8' : (COLORS[obs.subType as BiomeType]?.stroke || '#777');
        ctx.lineWidth = 1 / zoom;

        if (obs.type === 'circle' && obs.center && obs.radius) {
          ctx.beginPath(); ctx.arc(obs.center.x, obs.center.y, obs.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        } else if (obs.type === 'polygon' && obs.vertices) {
          ctx.beginPath();
          ctx.moveTo(obs.vertices[0].x, obs.vertices[0].y);
          for (let i = 1; i < obs.vertices.length; i++) ctx.lineTo(obs.vertices[i].x, obs.vertices[i].y);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      });
      ctx.restore();

      // Borde
      ctx.strokeStyle = BORDER_COLOR;
      ctx.lineWidth = BORDER_THICKNESS;
      ctx.strokeRect(BORDER_THICKNESS / 2, BORDER_THICKNESS / 2, map.config.width - BORDER_THICKNESS, map.config.height - BORDER_THICKNESS);

      // Debug Graph Culling (Batch Render)
      if (debug) {
        ctx.lineWidth = 0.5 / zoom; ctx.strokeStyle = 'rgba(59, 130, 246, 0.2)';
        ctx.beginPath();
        for (const [u, v] of map.navGraph.edges) {
          const p1 = map.navGraph.nodes[u];
          const p2 = map.navGraph.nodes[v];
          if (p1.x > viewL && p1.x < viewR && p1.y > viewT && p1.y < viewB) {
            ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
          }
        }
        ctx.stroke();
      }
      ctx.restore();
    };

    let animationId: number;
    const loop = () => { render(); animationId = requestAnimationFrame(loop); };
    loop();
    return () => cancelAnimationFrame(animationId);
  }, [map, debug, hoveredObstacle, selectedEntity, targetPos, viewOffset, zoom]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 flex items-center justify-center cursor-none" 
      ref={containerRef} onMouseMove={handleMouseMove} onMouseDown={handleMouseDown} onMouseUp={handleMouseUp}
      onMouseLeave={() => { setScreenPos(null); setWorldPos(null); setHoveredObstacle(null); setIsPanning(false); }}
      onClick={handleClick} onContextMenu={(e) => e.preventDefault()} onWheel={handleWheel}>
      
      <div className="absolute top-6 z-40 flex bg-slate-900/95 border border-slate-700/50 rounded-2xl p-1 shadow-2xl backdrop-blur-md pointer-events-auto">
        <button onClick={(e) => { e.stopPropagation(); setSelectionMode('target'); }} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectionMode === 'target' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><Crosshair size={14} /> ANALIZAR TARGET</button>
        <button onClick={(e) => { e.stopPropagation(); setSelectionMode('respawn'); }} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectionMode === 'respawn' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}><MapPin size={14} /> MOVER RESPAWN</button>
      </div>

      <canvas ref={canvasRef} className="bg-slate-900 transition-shadow pointer-events-none" />
      
      {screenPos && (
        <div className="absolute pointer-events-none z-50" style={{ left: screenPos.x, top: screenPos.y, transform: 'translate(-50%, -50%)' }}>
          <div className="w-12 h-12 flex items-center justify-center">
            <div className={`absolute inset-0 border border-white/20 rounded-full ${isPanning ? 'scale-75 opacity-20' : 'animate-pulse'}`} />
            <div className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_8px_white] z-10" />
          </div>
        </div>
      )}

      <div className="absolute top-24 left-6 flex flex-col gap-3 pointer-events-none z-40">
        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl backdrop-blur-xl shadow-2xl flex items-center gap-4 min-w-[220px]">
           <div className="flex flex-col"><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Map Coords</span><span className="text-sm font-mono text-blue-400 font-bold">{worldPos ? Math.round(worldPos.x) : '---'}, {worldPos ? Math.round(worldPos.y) : '---'}</span></div>
           <div className="h-8 w-[1px] bg-slate-800" /><div className="flex flex-col"><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tactical Zoom</span><span className="text-sm font-mono text-amber-400 font-bold">{Math.round(zoom * 100)}%</span></div>
        </div>
      </div>
    </div>
  );
};

export default BattleMap;
