import React from "react";
import { HardDrive, Zap } from "lucide-react";
import { SystemStatusResponse } from "../lib/api";
import { t } from "../i18n";

interface NavbarProps {
  statusData?: SystemStatusResponse;
}

export const Navbar: React.FC<NavbarProps> = ({ statusData }) => {
  const gpu = statusData?.telemetry.gpu;
  const sys = statusData?.telemetry.system;

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-lg text-white shadow-lg shadow-blue-500/20">
          G
        </div>
        <div>
          <h1 className="font-semibold text-slate-100 text-base leading-tight">
            {t("app.title")}
          </h1>
          <p className="text-xs text-slate-400">
            {t("app.subtitle")}
          </p>
        </div>
      </div>

      {/* Live hardware quick status badges */}
      <div className="flex items-center gap-4 text-xs font-medium">
        {gpu?.available ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-800/80 border border-slate-700/60">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-300">{gpu.name}</span>
            <span className="text-emerald-400 font-mono">
              {gpu.vram_used_mb} / {gpu.vram_total_mb} MB
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-950/40 border border-amber-800/40 text-amber-300">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>CPU Modu</span>
          </div>
        )}

        {sys && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-800/80 border border-slate-700/60">
            <HardDrive className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-300">RAM:</span>
            <span className="text-blue-400 font-mono">
              %{sys.ram_percent.toFixed(0)} ({sys.ram_used_mb} MB)
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-slate-300 font-mono text-[11px]">v0.1.0-alpha</span>
        </div>
      </div>
    </header>
  );
};
