
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapConfig, BiomeType, GeneratedMap, Vector2D } from './types';
import MapControls from './components/MapControls';
import BattleMap from './components/BattleMap';
import { generateMap } from './services/mapGenerator';
import { Shield, Cpu, Server } from 'lucide-react';

const INITIAL_CONFIG: MapConfig = {
  width: 2000, 
  height: 2000, // Cuadrado perfecto por defecto
  seed: 'NEXUS_ALPHA',
  obstacleDensity: 0.32,
  biomes: {
    [BiomeType.FOREST]: 5,
    [BiomeType.ROCKS]: 4,
    [BiomeType.RUINS]: 5,
    [BiomeType.MUD]: 3,
    [BiomeType.RIVER]: 6, 
  },
  mainPathsCount: 2,
  poiCount: 5,
  unitRadius: 18,
  wallThickness: 12,
  riverWidth: 120,
  riverTributaries: 3,
  riverTribWidthRatio: 0.55,
  riverWidthVariation: 0.4,
  riverBranchAngle: 45
};

const App: React.FC = () => {
  const [config, setConfig] = useState<MapConfig>(INITIAL_CONFIG);
  const [map, setMap] = useState<GeneratedMap | null>(null);
  const [debug, setDebug] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const isInitialMount = useRef(true);

  const performGeneration = useCallback((targetConfig: MapConfig) => {
    setIsGenerating(true);
    console.log(`%c[Engine] Compiling Terrain: Seed=${targetConfig.seed} Dim=${targetConfig.width}x${targetConfig.height}`, 'color: #06b6d4; font-weight: bold');

    setTimeout(() => {
      try {
        const startTime = performance.now();
        const generated = generateMap(targetConfig);
        const endTime = performance.now();
        
        setMap(generated);
        console.log(`%c[Engine] Success: ${(endTime - startTime).toFixed(2)}ms`, 'color: #10b981; font-weight: bold');
      } catch (err) {
        console.error("Hydrology System Fault:", err);
      } finally {
        setIsGenerating(false);
      }
    }, 10);
  }, []);

  const handleRegenerate = useCallback((newSeed: boolean = false) => {
    if (newSeed) {
      const nextSeed = Math.random().toString(36).substring(7).toUpperCase();
      const newConfig = { ...config, seed: nextSeed };
      setConfig(newConfig);
    } else {
      performGeneration(config);
    }
  }, [config, performGeneration]);

  useEffect(() => {
    if (isInitialMount.current) {
      performGeneration(config);
      isInitialMount.current = false;
      return;
    }

    const timer = setTimeout(() => {
      performGeneration(config);
    }, 150); 

    return () => clearTimeout(timer);
  }, [config, performGeneration]);

  const updateRespawn = (pos: Vector2D) => {
    if (map) setMap({ ...map, respawnPos: pos });
  };

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-200 overflow-hidden font-sans selection:bg-blue-500/30">
      <MapControls 
        config={config} 
        onChange={setConfig} 
        onRegenerate={handleRegenerate}
        onExport={() => {}} 
        onImport={() => {}} 
        debug={debug}
        setDebug={setDebug}
      />
      
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <header className="h-16 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between px-8 backdrop-blur-xl z-30">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-cyan-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
                <Shield className="text-white" size={20} />
              </div>
              <div className="flex flex-col">
                <h1 className="text-xs font-black tracking-[0.3em] text-white uppercase">Advanced Terrain Processor</h1>
                <span className="text-[10px] text-cyan-400 font-mono flex items-center gap-1.5">
                  <Cpu size={10} /> {isGenerating ? 'ANALYZING...' : `ACTIVE / ${config.seed}`}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden relative bg-slate-950">
          {map ? <BattleMap map={map} debug={debug} onUpdateRespawn={updateRespawn} /> : 
            <div className="w-full h-full flex flex-col items-center justify-center gap-5">
              <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
            </div>
          }
          {isGenerating && (
            <div className="absolute top-4 right-4 z-50 flex items-center gap-3 bg-slate-900/90 border border-cyan-500/40 px-5 py-2.5 rounded-full backdrop-blur-xl shadow-2xl shadow-cyan-900/40 scale-100 transition-transform">
               <Server className="text-cyan-400 animate-pulse" size={16} />
               <span className="text-[11px] font-black uppercase tracking-[0.15em] text-cyan-400">Geometry Sync...</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
