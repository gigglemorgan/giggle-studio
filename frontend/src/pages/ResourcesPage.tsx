import React, { useState } from "react";
import { Zap, HardDrive, Cpu, Database, RefreshCw, Trash2, CheckCircle2 } from "lucide-react";
import { SystemStatusResponse, freeMemory } from "../lib/api";
import { t } from "../i18n";

interface ResourcesPageProps {
  statusData?: SystemStatusResponse;
  onRefresh: () => void;
}

export const ResourcesPage: React.FC<ResourcesPageProps> = ({ statusData, onRefresh }) => {
  const [cleaning, setCleaning] = useState(false);
  const [cleanMsg, setCleanMsg] = useState<string | null>(null);

  const gpu = statusData?.telemetry.gpu;
  const sys = statusData?.telemetry.system;

  const handleFreeMemory = async () => {
    try {
      setCleaning(true);
      setCleanMsg(null);
      const res = await freeMemory();
      setCleanMsg(res.message_tr || t("resources.free_memory_success"));
      onRefresh();
    } catch (err: any) {
      setCleanMsg("Hata: " + err.message);
    } finally {
      setCleaning(false);
    }
  };

  const vramPercent = gpu && gpu.vram_total_mb > 0
    ? Math.round((gpu.vram_used_mb / gpu.vram_total_mb) * 100)
    : 0;

  return (
    <div className="p-8 space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">
            {t("resources.title")}
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            NVIDIA RTX 5070 ve ana sistem kaynaklarının anlık donanım telemetrisi.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium transition"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{t("common.refresh")}</span>
          </button>
          <button
            onClick={handleFreeMemory}
            disabled={cleaning}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>{cleaning ? t("common.loading") : t("resources.free_memory_button")}</span>
          </button>
        </div>
      </div>

      {cleanMsg && (
        <div className="p-4 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-200 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{cleanMsg}</span>
        </div>
      )}

      {/* Grid of hardware modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* GPU Telemetry */}
        <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-200">{t("resources.gpu_title")}</h3>
                <p className="text-xs text-slate-400">{gpu?.name || "Tespit Edilemedi"}</p>
              </div>
            </div>
            {gpu?.available && (
              <span className="text-xs px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                Index: {gpu.index}
              </span>
            )}
          </div>

          {gpu?.available ? (
            <div className="space-y-4 pt-2">
              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                  <span>{t("resources.vram_usage")}</span>
                  <span className="font-mono">
                    {gpu.vram_used_mb} MB / {gpu.vram_total_mb} MB (%{vramPercent})
                  </span>
                </div>
                <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      vramPercent > 90 ? "bg-red-500" : vramPercent > 75 ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${vramPercent}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-2 text-center">
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <p className="text-xs text-slate-400">{t("resources.gpu_util")}</p>
                  <p className="text-lg font-bold font-mono text-slate-200 mt-1">
                    %{gpu.utilization_percent}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <p className="text-xs text-slate-400">{t("resources.gpu_temp")}</p>
                  <p className="text-lg font-bold font-mono text-slate-200 mt-1">
                    {gpu.temperature_c} °C
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <p className="text-xs text-slate-400">{t("resources.gpu_power")}</p>
                  <p className="text-lg font-bold font-mono text-slate-200 mt-1">
                    {gpu.power_watts} W
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">NVIDIA ekran kartı tespit edilemedi veya NVML başlatılamadı.</p>
          )}
        </div>

        {/* System RAM */}
        <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-200">{t("resources.ram_title")}</h3>
              <p className="text-xs text-slate-400">16 GB Sistem Belleği Tavan Koruması</p>
            </div>
          </div>

          {sys && (
            <div className="space-y-4 pt-2">
              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                  <span>Kullanılan RAM</span>
                  <span className="font-mono">
                    {sys.ram_used_mb} MB / {sys.ram_total_mb} MB (%{sys.ram_percent.toFixed(0)})
                  </span>
                </div>
                <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      sys.ram_percent > 85 ? "bg-red-500" : sys.ram_percent > 70 ? "bg-amber-500" : "bg-blue-500"
                    }`}
                    style={{ width: `${sys.ram_percent}%` }}
                  />
                </div>
              </div>

              {/* Swap */}
              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                  <span>{t("resources.swap_title")}</span>
                  <span className="font-mono">
                    {sys.swap_used_mb} MB / {sys.swap_total_mb} MB (%{sys.swap_percent.toFixed(0)})
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 transition-all duration-500"
                    style={{ width: `${sys.swap_percent}%` }}
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400">
                Boş / Kullanılabilir Bellek: <span className="font-mono text-slate-200 font-semibold">{sys.ram_available_mb} MB</span>
              </div>
            </div>
          )}
        </div>

        {/* CPU & Cores */}
        <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-200">{t("resources.cpu_title")}</h3>
              <p className="text-xs text-slate-400">Intel Core i5-10400F (AVX2)</p>
            </div>
          </div>

          {sys && (
            <div className="space-y-4 pt-2">
              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                  <span>Toplam CPU Yükü</span>
                  <span className="font-mono">%{sys.cpu_percent.toFixed(1)}</span>
                </div>
                <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, sys.cpu_percent)}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <p className="text-xs text-slate-400">Fiziksel Çekirdek</p>
                  <p className="text-lg font-bold font-mono text-slate-200 mt-1">
                    {sys.cpu_physical_cores} Çekirdek
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <p className="text-xs text-slate-400">Mantıksal İzlek</p>
                  <p className="text-lg font-bold font-mono text-slate-200 mt-1">
                    {sys.cpu_logical_cores} İzlek
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Storage */}
        <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-200">{t("resources.disk_title")}</h3>
              <p className="text-xs text-slate-400">NVMe Veri Depolama Alanı</p>
            </div>
          </div>

          {sys && (
            <div className="space-y-4 pt-2">
              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1.5">
                  <span>Depolama Kullanımı</span>
                  <span className="font-mono">
                    {(sys.disk_total_gb - sys.disk_free_gb).toFixed(1)} GB / {sys.disk_total_gb} GB
                  </span>
                </div>
                <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-all duration-500"
                    style={{ width: `${Math.round(((sys.disk_total_gb - sys.disk_free_gb) / sys.disk_total_gb) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400">
                Kalan Boş Disk Alanı: <span className="font-mono text-slate-200 font-semibold">{sys.disk_free_gb} GB</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
