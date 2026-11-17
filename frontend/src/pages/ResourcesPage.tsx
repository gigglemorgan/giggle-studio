import React, { useState, useEffect } from "react";
import {
  Zap,
  HardDrive,
  Cpu,
  RefreshCw,
  Trash2,
  Flame,
  Activity,
  Server,
} from "lucide-react";
import { SystemStatusResponse, freeMemory } from "../lib/api";
import { toast } from "../store/toastStore";
import { useLanguageStore } from "../i18n";
import { ResponsiveContainer, AreaChart, Area } from "recharts";

interface ResourcesPageProps {
  statusData?: SystemStatusResponse;
  onRefresh: () => void;
}

interface TelemetryHistoryPoint {
  time: string;
  vramMb: number;
  ramMb: number;
  tempC: number;
  powerW: number;
}

export const ResourcesPage: React.FC<ResourcesPageProps> = ({ statusData, onRefresh }) => {
  const { t } = useLanguageStore();
  const [cleaning, setCleaning] = useState(false);
  const [history, setHistory] = useState<TelemetryHistoryPoint[]>([]);

  const gpu = statusData?.telemetry.gpu;
  const sys = statusData?.telemetry.system;

  useEffect(() => {
    if (gpu || sys) {
      const now = new Date();
      const timeStr = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
      setHistory((prev) => [
        ...prev.slice(-20),
        {
          time: timeStr,
          vramMb: gpu?.vram_used_mb || 0,
          ramMb: sys?.ram_used_mb || 0,
          tempC: gpu?.temperature_c || 0,
          powerW: gpu?.power_watts || 0,
        },
      ]);
    }
  }, [statusData]);

  const handleFreeMemory = async () => {
    try {
      setCleaning(true);
      const res = await freeMemory();
      toast.success(t("resources.free_memory_success"), res.message_tr || t("resources.free_memory_success"));
      onRefresh();
    } catch {
      toast.error(t("common.error"), t("resources.free_memory_error"));
    } finally {
      setCleaning(false);
    }
  };

  const vramPercent =
    gpu && gpu.vram_total_mb > 0
      ? Math.round((gpu.vram_used_mb / gpu.vram_total_mb) * 100)
      : 0;

  // Process list mock/telemetry
  const processes = [
    {
      name: "giggle-inference-worker (llama.cpp)",
      pid: 14208,
      vramMb: gpu?.vram_used_mb || 480,
      ramMb: 850,
      cpuPercent: 1.2,
      status: t("common.active"),
    },
    {
      name: "giggle-studio-api (FastAPI)",
      pid: 14190,
      vramMb: 0,
      ramMb: 240,
      cpuPercent: 0.8,
      status: t("common.active"),
    },
    {
      name: "bwrap-isolation-sandbox",
      pid: 14235,
      vramMb: 0,
      ramMb: 64,
      cpuPercent: 0.0,
      status: t("common.inactive"),
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background p-4 md:p-6 space-y-6">
      {/* Top Bar Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Activity className="w-6 h-6 text-primary" />
            <span>{t("resources.title")}</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("resources.subtitle")}
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            onClick={onRefresh}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card hover:bg-card-muted text-xs font-semibold text-foreground transition-all shadow-subtle"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t("common.refresh")}</span>
          </button>
          <button
            onClick={handleFreeMemory}
            disabled={cleaning}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground font-bold text-xs hover:bg-destructive/90 transition-all shadow-subtle disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{cleaning ? t("common.loading") : t("resources.free_memory_button")}</span>
          </button>
        </div>
      </div>

      {/* Hero Metric Cards with Sparklines */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: VRAM */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-card space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-primary" />
              <span>{t("resources.vram_usage")}</span>
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-semibold">
              %{vramPercent}
            </span>
          </div>

          <div>
            <div className="text-2xl font-bold font-mono text-foreground tabular-nums">
              {(gpu ? gpu.vram_used_mb / 1024 : 0).toFixed(1)}{" "}
              <span className="text-xs font-sans text-muted-foreground font-normal">
                / {(gpu ? gpu.vram_total_mb / 1024 : 12).toFixed(0)} GB
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
              VRAM: {gpu?.vram_free_mb || 0} MB
            </p>
          </div>

          <div className="h-10 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <Area type="monotone" dataKey="vramMb" stroke="#D4FF00" fill="#D4FF0020" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card 2: GPU Temperature */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-card space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-warning" />
              <span>{t("resources.gpu_temp")}</span>
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20 font-semibold">
              {gpu?.temperature_c || 0}°C
            </span>
          </div>

          <div>
            <div className="text-2xl font-bold font-mono text-foreground tabular-nums">
              {gpu?.temperature_c || 0}°C
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {t("resources.gpu_power")}: {gpu?.power_watts.toFixed(0) || 0} W
            </p>
          </div>

          <div className="h-10 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <Area type="monotone" dataKey="tempC" stroke="#F59E0B" fill="#F59E0B20" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card 3: System RAM */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-card space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-info" />
              <span>{t("resources.ram_title")}</span>
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-info/10 text-info border border-info/20 font-semibold">
              %{sys?.ram_percent.toFixed(0) || 0}
            </span>
          </div>

          <div>
            <div className="text-2xl font-bold font-mono text-foreground tabular-nums">
              {(sys ? sys.ram_used_mb / 1024 : 0).toFixed(1)}{" "}
              <span className="text-xs font-sans text-muted-foreground font-normal">
                / {(sys ? sys.ram_total_mb / 1024 : 16).toFixed(0)} GB
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
              {t("resources.swap_title")}: %{sys?.swap_percent.toFixed(0) || 0}
            </p>
          </div>

          <div className="h-10 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <Area type="monotone" dataKey="ramMb" stroke="#0EA5E9" fill="#0EA5E920" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card 4: CPU Usage */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-card space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-primary" />
              <span>{t("resources.cpu_title")}</span>
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-card-muted text-muted-foreground border border-border">
              {sys?.cpu_logical_cores || 12} Cores
            </span>
          </div>

          <div>
            <div className="text-2xl font-bold font-mono text-foreground tabular-nums">
              %{sys?.cpu_percent.toFixed(0) || 0}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
              Physical: {sys?.cpu_physical_cores || 6} Cores
            </p>
          </div>

          <div className="w-full bg-secondary h-2 rounded-full overflow-hidden mt-3">
            <div
              className="bg-primary h-full transition-all duration-300 rounded-full"
              style={{ width: `${sys?.cpu_percent || 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Per-Process Memory List */}
      <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        <div className="p-4 border-b border-border bg-card-muted/40 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              {t("resources.processes_title")}
            </h3>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-card-muted/70 border-b border-border text-muted-foreground uppercase text-[10px] font-semibold tracking-wider">
              <tr>
                <th className="p-3">{t("resources.col_process")}</th>
                <th className="p-3">{t("resources.col_pid")}</th>
                <th className="p-3">{t("resources.vram_usage")}</th>
                <th className="p-3">{t("resources.col_memory")}</th>
                <th className="p-3">CPU %</th>
                <th className="p-3 text-right">{t("resources.col_status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {processes.map((proc) => (
                <tr key={proc.pid} className="hover:bg-muted/40 transition-colors">
                  <td className="p-3 font-semibold text-foreground flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>{proc.name}</span>
                  </td>
                  <td className="p-3 text-muted-foreground">{proc.pid}</td>
                  <td className="p-3 text-primary font-bold">{proc.vramMb} MB</td>
                  <td className="p-3 text-foreground/90">{proc.ramMb} MB</td>
                  <td className="p-3 text-foreground/90">%{proc.cpuPercent}</td>
                  <td className="p-3 text-right">
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-success/15 text-success border border-success/30 font-sans">
                      {proc.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
