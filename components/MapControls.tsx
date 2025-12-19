
import React from 'react';
import { MapConfig, BiomeType } from '../types';
import { Settings, RefreshCw, Layers, Maximize, Ruler, Waves, GitBranch, ArrowUpRight, Zap, Square } from 'lucide-react';

interface Props {
  config: MapConfig;
  onChange: (config: MapConfig) => void;
  onRegenerate: (newSeed?: boolean) => void;
  onExport: () => void;
  onImport: () => void;
  debug: boolean;
  setDebug: (v: boolean) => void;
}

const RIVER_SCALE_LABELS = [
  "None", "Creek", "Brook", "Stream", "Canal", "River", "Deep River", "Large River", "Wide Flow", "Massive", "Mega Flow"
];

// Se eliminó el nivel 2800px por requerimiento
const MAP_SIZE_STEPS = [1200, 1600, 2000, 2400];
const MAP_SIZE_LABELS = ["Compact", "Standard", "Tactical", "Extended"];

const MapControls: React.FC<Props> = ({ config, onChange, onRegenerate, debug, setDebug }) => {
  
  const handleNumericChange = (field: keyof MapConfig, rawValue: string, isFloat: boolean = false) => {
    const value = isFloat ? parseFloat(rawValue) : parseInt(rawValue, 10);
    if (!isNaN(value)) {
      onChange({ ...config, [field]: value });
    }
  };

  const handleMapSizeChange = (index: number) => {
    const size = MAP_SIZE_STEPS[index];
    onChange({ 
      ...config, 
      width: size, 
      height: size // Forzamos cuadrado perfecto
    });
  };

  const handleBiomeWeight = (type: BiomeType, rawValue: string) => {
    const weight = parseInt(rawValue, 10);
    const numericWeight = isNaN(weight) ? 0 : Math.max(0, Math.min(10, weight));
    
    onChange({ 
      ...config, 
      biomes: { ...config.biomes, [type]: numericWeight } 
    });
  };

  const currentSizeIndex = MAP_SIZE_STEPS.indexOf(config.width);
  // Ajuste de seguridad si el valor actual estaba en el nivel eliminado
  const activeSizeIndex = currentSizeIndex === -1 ? (config.width > 2400 ? 3 : 2) : currentSizeIndex;

  const inputClass = "w-full bg-slate-950 border border-slate-800 text-slate-200 px-3 py-2 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all hover:border-slate-700 font-mono";
  const labelClass = "text-[11px] font-bold text-slate-500 mb-1.5 flex items-center gap-1.5 uppercase tracking-wider";
  const sectionTitleClass = "text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2 border-b border-slate-800 pb-2";

  return (
    <div className="w-80 h-full bg-slate-900 border-r border-slate-800 flex flex-col overflow-y-auto custom-scrollbar">
      <div className="p-5 border-b border-slate-800 bg-slate-900/80 sticky top-0 z-20 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-cyan-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-900/40">
            <Settings size={18} className="text-white" />
          </div>
          <h2 className="text-sm font-bold text-white tracking-tight uppercase">Engine Params</h2>
        </div>
      </div>

      <div className="p-6 space-y-8 flex-1">
        <section>
          <h3 className={sectionTitleClass}><Maximize size={12} /> Domain</h3>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Operational Seed</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={config.seed} 
                  onChange={(e) => onChange({ ...config, seed: e.target.value.toUpperCase() })} 
                  className={inputClass + " text-cyan-400 uppercase"} 
                />
                <button 
                  onClick={() => onRegenerate(true)} 
                  className="bg-slate-800 hover:bg-slate-700 text-cyan-400 p-2 rounded-lg border border-slate-700 transition-all active:scale-90"
                  title="Generate New Seed"
                >
                  <RefreshCw size={18} />
                </button>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className={labelClass}><Square size={10} /> Map Scale (Square)</label>
                <span className="text-[10px] font-mono text-cyan-400">{MAP_SIZE_LABELS[activeSizeIndex]} ({config.width}px)</span>
              </div>
              <input 
                type="range" min="0" max="3" step="1" 
                value={activeSizeIndex} 
                onChange={(e) => handleMapSizeChange(parseInt(e.target.value))} 
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none accent-amber-500 cursor-pointer" 
              />
              <div className="flex justify-between mt-1 px-1">
                {MAP_SIZE_LABELS.map((_, i) => (
                  <div key={i} className={`w-1 h-1 rounded-full ${i <= activeSizeIndex ? 'bg-amber-500' : 'bg-slate-700'}`} />
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className={labelClass}>Obstacle Density</label>
                <span className="text-[10px] font-mono text-cyan-400">{Math.round(config.obstacleDensity * 100)}%</span>
              </div>
              <input 
                type="range" min="0.05" max="0.8" step="0.01" 
                value={config.obstacleDensity} 
                onChange={(e) => handleNumericChange('obstacleDensity', e.target.value, true)} 
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none accent-cyan-500 cursor-pointer" 
              />
            </div>
          </div>
        </section>

        <section>
          <h3 className={sectionTitleClass}><Waves size={12} /> Hydrology Overrides</h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className={labelClass}>Meander Intensity</label>
                <span className="text-[10px] font-mono text-cyan-400">{Math.round(config.riverWidthVariation * 100)}%</span>
              </div>
              <input 
                type="range" min="0" max="1.5" step="0.05" 
                value={config.riverWidthVariation} 
                onChange={(e) => handleNumericChange('riverWidthVariation', e.target.value, true)} 
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none accent-blue-400 cursor-pointer" 
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}><GitBranch size={10} /> Tributaries</label>
                <input 
                  type="number" min="0" max="12" 
                  value={config.riverTributaries} 
                  onChange={(e) => handleNumericChange('riverTributaries', e.target.value)} 
                  className={inputClass} 
                />
              </div>
              <div>
                <label className={labelClass}><ArrowUpRight size={10} /> Trib Ratio</label>
                <input 
                  type="number" step="0.05" min="0.1" max="0.9" 
                  value={config.riverTribWidthRatio} 
                  onChange={(e) => handleNumericChange('riverTribWidthRatio', e.target.value, true)} 
                  className={inputClass} 
                />
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className={sectionTitleClass}><Layers size={12} /> Biome Distribution</h3>
          <div className="grid grid-cols-1 gap-3">
            {Object.values(BiomeType).map((biome) => (
              <div key={biome} className="bg-slate-950/30 p-2.5 rounded-lg border border-slate-800/50 hover:border-slate-700 transition-colors">
                <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase">
                  <span>{biome}</span>
                  <span className="text-cyan-500 font-mono">
                    {biome === BiomeType.RIVER ? RIVER_SCALE_LABELS[config.biomes[biome]] : config.biomes[biome]}
                  </span>
                </div>
                <input 
                  type="range" min="0" max="10" step="1"
                  value={config.biomes[biome] || 0} 
                  onChange={(e) => handleBiomeWeight(biome, e.target.value)} 
                  className={`w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer ${biome === BiomeType.RIVER ? 'accent-blue-500' : 'accent-cyan-600'}`} 
                />
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className={sectionTitleClass}><Ruler size={12} /> Visualization</h3>
          <button 
            onClick={() => setDebug(!debug)} 
            className={`w-full py-2.5 rounded-lg text-[10px] font-black tracking-[0.2em] uppercase transition-all border ${debug ? 'bg-cyan-600/10 border-cyan-500/50 text-cyan-400' : 'bg-slate-800/50 border-slate-700 text-slate-500'}`}
          >
            Tactical Debug: {debug ? 'ON' : 'OFF'}
          </button>
        </section>
      </div>

      <div className="p-6 border-t border-slate-800 bg-slate-900/50">
        <button 
          onClick={() => onRegenerate(true)} 
          className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-cyan-950/20 active:scale-95 group"
        >
          <Zap size={20} className="group-hover:animate-pulse" />
          FORCE NEW DESIGN
        </button>
        <p className="text-[9px] text-center text-slate-500 mt-3 uppercase tracking-tighter">Seed will rotate, sliders preserved</p>
      </div>
    </div>
  );
};

export default MapControls;
