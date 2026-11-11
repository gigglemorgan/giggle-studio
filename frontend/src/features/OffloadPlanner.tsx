import React, { useEffect, useState } from "react";
import { Zap, HardDrive, AlertTriangle, ShieldCheck, Sliders } from "lucide-react";

interface OffloadPlannerProps {
  model: {
    id: string;
    name: string;
    file_size_mb: number;
    context_length: number;
    layer_count?: number;
  };
  onLoadModel: (config: {
    n_gpu_layers: number;
    n_ctx: number;
    kv_cache_k: string;
    kv_cache_v: string;
    flash_attention: boolean;
  }) => Promise<void>;
  onClose: () => void;
}

export const OffloadPlanner: React.FC<OffloadPlannerProps> = ({ model, onLoadModel, onClose }) => {
  const [gpuLayers, setGpuLayers] = useState<number>(34); // default ~all on 32-block model
  const [nCtx, setNCtx] = useState<number>(model.context_length || 4096);
  const [kvK, setKvK] = useState<string>("f16");
  const [kvV, setKvV] = useState<string>("f16");
  const [flashAttn, setFlashAttn] = useState<boolean>(true);
  const [estimation, setEstimation] = useState<any>(null);
  const [, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchEstimation = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch(`/api/models/${model.id}/estimate-offload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          n_gpu_layers: gpuLayers,
          n_ctx: nCtx,
          kv_cache_k: kvK,
          kv_cache_v: kvV,
        }),
      });
      if (!res.ok) throw new Error("Hesaplama başarısız oldu");
      const data = await res.json();
      setEstimation(data);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEstimation();
  }, [gpuLayers, nCtx, kvK, kvV]);

  const handleApplyPreset = (presetName: string) => {
    if (estimation?.presets?.[presetName] !== undefined) {
      setGpuLayers(estimation.presets[presetName]);
    }
  };

  const handleLoad = async () => {
    try {
      setSubmitting(true);
      setErrorMsg(null);
      await onLoadModel({
        n_gpu_layers: gpuLayers,
        n_ctx: nCtx,
        kv_cache_k: kvK,
        kv_cache_v: kvV,
        flash_attention: flashAttn,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Model yüklenirken hata oluştu");
    } finally {
      setSubmitting(false);
    }
  };

  const totalLayers = estimation?.settings?.layer_count || 32;
  const maxSliderLayers = totalLayers + 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl p-6 space-y-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-blue-500" />
              <span>Yerleşim & Bellek Planlayıcı (Offload Planner)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">{model.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-sm font-semibold p-1"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-red-950/60 border border-red-800/60 text-red-200 text-xs">
            {errorMsg}
          </div>
        )}

        {/* Live Projected Split Bar */}
        {estimation && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-950 border border-slate-800/80">
            {/* VRAM projection */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  Öngörülen VRAM
                </span>
                <span className={`font-mono font-semibold ${estimation.vram.safe ? "text-emerald-400" : "text-red-400"}`}>
                  {estimation.vram.projected_mb} MB / {estimation.vram.total_mb} MB
                </span>
              </div>
              <div className="h-4 w-full bg-slate-800 rounded-lg overflow-hidden flex">
                <div
                  className="bg-emerald-500 h-full"
                  style={{ width: `${(estimation.vram.weights_mb / estimation.vram.total_mb) * 100}%` }}
                  title={`Ağırlıklar: ${estimation.vram.weights_mb} MB`}
                />
                <div
                  className="bg-blue-500 h-full"
                  style={{ width: `${(estimation.vram.kv_cache_mb / estimation.vram.total_mb) * 100}%` }}
                  title={`KV Bellek: ${estimation.vram.kv_cache_mb} MB`}
                />
                <div
                  className="bg-purple-500 h-full"
                  style={{ width: `${(estimation.vram.compute_mb / estimation.vram.total_mb) * 100}%` }}
                  title={`Hesaplama Tamponu: ${estimation.vram.compute_mb} MB`}
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Ağırlık: {estimation.vram.weights_mb} MB</span>
                <span>KV: {estimation.vram.kv_cache_mb} MB</span>
                <span>Boş Kalan: {estimation.vram.free_after_load_mb} MB</span>
              </div>
            </div>

            {/* RAM projection */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                  Öngörülen RAM
                </span>
                <span className={`font-mono font-semibold ${estimation.ram.safe ? "text-blue-400" : "text-red-400"}`}>
                  {estimation.ram.projected_mb} MB / {estimation.ram.total_mb} MB
                </span>
              </div>
              <div className="h-4 w-full bg-slate-800 rounded-lg overflow-hidden flex">
                <div
                  className="bg-amber-500 h-full"
                  style={{ width: `${(estimation.ram.weights_mb / estimation.ram.total_mb) * 100}%` }}
                  title={`RAM Ağırlıklar: ${estimation.ram.weights_mb} MB`}
                />
                <div
                  className="bg-blue-400 h-full"
                  style={{ width: `${(estimation.ram.compute_mb / estimation.ram.total_mb) * 100}%` }}
                  title={`RAM Tampon: ${estimation.ram.compute_mb} MB`}
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>RAM Ağırlık: {estimation.ram.weights_mb} MB</span>
                <span>Tavan: %85 ({estimation.ram.limit_mb} MB)</span>
              </div>
            </div>
          </div>
        )}

        {/* Safety Proposals if unsafe */}
        {estimation && !estimation.safe && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 space-y-2">
            <div className="flex items-center gap-2 text-red-300 font-semibold text-xs">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span>Güvenlik Limiti Aşıldı: Model Mevcut Ayarlarla Yüklenemez</span>
            </div>
            {estimation.proposals.map((prop: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between text-xs text-slate-300 pl-6">
                <span>{prop.message_tr}</span>
                {prop.suggested_value !== undefined && (
                  <button
                    onClick={() => setGpuLayers(prop.suggested_value)}
                    className="px-2 py-1 rounded bg-red-600/60 hover:bg-red-500 text-white font-medium ml-2 text-[11px]"
                  >
                    Uygula ({prop.suggested_value})
                  </button>
                )}
                {prop.suggested_kv_k && (
                  <button
                    onClick={() => {
                      setKvK(prop.suggested_kv_k);
                      setKvV(prop.suggested_kv_v);
                    }}
                    className="px-2 py-1 rounded bg-red-600/60 hover:bg-red-500 text-white font-medium ml-2 text-[11px]"
                  >
                    Kuantize Et
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Sliders & Presets */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-200">
              GPU Katman Sayısı (n_gpu_layers): <span className="font-mono text-blue-400 text-sm">{gpuLayers} / {maxSliderLayers}</span>
            </label>
            <div className="flex gap-1.5">
              <button
                onClick={() => handleApplyPreset("all_gpu")}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200"
              >
                Tüm GPU
              </button>
              <button
                onClick={() => handleApplyPreset("balanced")}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200"
              >
                Dengeli
              </button>
              <button
                onClick={() => handleApplyPreset("max_speed")}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200"
              >
                Maks Hız
              </button>
              <button
                onClick={() => handleApplyPreset("min_vram")}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200"
              >
                Min VRAM
              </button>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={maxSliderLayers}
            value={gpuLayers}
            onChange={(e) => setGpuLayers(Number(e.target.value))}
            className="w-full accent-blue-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Bağlam Boyutu (n_ctx)</label>
              <select
                value={nCtx}
                onChange={(e) => setNCtx(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
              >
                <option value={2048}>2048 Tokens</option>
                <option value={4096}>4096 Tokens</option>
                <option value={8192}>8192 Tokens</option>
                <option value={16384}>16384 Tokens</option>
                <option value={32768}>32768 Tokens</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">KV Cache (Kuantizasyon)</label>
              <select
                value={kvK}
                onChange={(e) => {
                  setKvK(e.target.value);
                  setKvV(e.target.value);
                }}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
              >
                <option value="f16">F16 (Standart Hassasiyet)</option>
                <option value="q8_0">Q8_0 (Hafif Kuantize - %50 Tasarruf)</option>
                <option value="q4_0">Q4_0 (Yüksek Kuantize - %75 Tasarruf)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Flash Attention</label>
              <label className="flex items-center gap-2 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={flashAttn}
                  onChange={(e) => setFlashAttn(e.target.checked)}
                  className="accent-blue-500 rounded"
                />
                <span>Etkinleştir (Önerilen)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Visual Layer Map Preview */}
        {estimation?.layers_map && (
          <div className="space-y-1.5">
            <span className="text-xs text-slate-400 font-medium">Katman Dağılım Haritası</span>
            <div className="flex gap-1 overflow-x-auto pb-2">
              {estimation.layers_map.map((l: any) => (
                <div
                  key={l.index}
                  title={`${l.name}: ${l.device}`}
                  className={`h-7 min-w-[20px] flex-1 rounded flex items-center justify-center text-[10px] font-bold ${
                    l.device === "GPU"
                      ? "bg-emerald-600 text-white shadow-sm shadow-emerald-500/20"
                      : "bg-amber-600/80 text-white"
                  }`}
                >
                  {l.type === "embedding" ? "E" : l.type === "output" ? "H" : l.index}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
          >
            Vazgeç
          </button>
          <button
            onClick={handleLoad}
            disabled={submitting || (estimation && !estimation.safe)}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{submitting ? "Yükleniyor..." : "Modeli Yükle ve Başlat"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
