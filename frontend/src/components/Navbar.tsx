import React from "react";
import {
  Zap,
  HardDrive,
  Cpu,
  ShieldCheck,
  Search,
  Sun,
  Moon,
  HelpCircle,
  Square,
  Sparkles,
  ArrowUpRight,
  Languages,
} from "lucide-react";
import { SystemStatusResponse } from "../lib/api";
import { useModelStore } from "../store/modelStore";
import { useThemeStore } from "../store/themeStore";
import { useLanguageStore } from "../i18n";
import { toast } from "../store/toastStore";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/Tooltip";

interface NavbarProps {
  statusData?: SystemStatusResponse;
  onOpenCommandPalette: () => void;
  onOpenShortcuts: () => void;
  onNavigateToModels: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  statusData,
  onOpenCommandPalette,
  onOpenShortcuts,
  onNavigateToModels,
}) => {
  const { activeStatus, tokensPerSec, unloadActiveModel } = useModelStore();
  const { isDark, toggleTheme } = useThemeStore();
  const { language, toggleLanguage, t } = useLanguageStore();

  const gpu = statusData?.telemetry.gpu;
  const sys = statusData?.telemetry.system;

  const modelName = activeStatus?.current_model
    ? activeStatus.current_model.split("/").pop()?.replace(/\.gguf$/i, "")
    : null;

  const handleUnload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await unloadActiveModel();
    if (ok) {
      toast.success(t("navbar.unload_success_title"), t("navbar.unload_success_desc"));
    } else {
      toast.error(t("navbar.unload_error_title"), t("navbar.unload_error_desc"));
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <header
        className="h-14 border-b border-border bg-card/80 backdrop-blur-md px-4 flex items-center justify-between gap-3 select-none shrink-0 z-30"
        role="banner"
      >
        {/* Left: Quick search & Active Model chip */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={onOpenCommandPalette}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-card-muted/60 hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-all shadow-subtle group"
            aria-label={t("navbar.search_tooltip")}
          >
            <Search className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="hidden sm:inline">{t("navbar.search_placeholder")}</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-card border border-border text-[10px] font-mono text-muted-foreground">
              Ctrl+K
            </kbd>
          </button>

          {/* Active Model Hero Chip */}
          {activeStatus?.alive && modelName ? (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/25 text-xs text-foreground animate-fade-in">
              <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 animate-pulse-subtle" />
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-semibold text-foreground truncate max-w-[130px] md:max-w-[200px]" title={modelName}>
                  {modelName}
                </span>
                <span className="text-[10px] font-mono text-primary bg-primary/15 px-1 rounded">
                  L:{activeStatus.config?.gpu_layers ?? "Auto"}
                </span>
                {tokensPerSec > 0 && (
                  <span className="text-[10px] font-mono text-success tabular-nums font-semibold hidden md:inline">
                    {tokensPerSec.toFixed(1)} t/s
                  </span>
                )}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleUnload}
                    className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                    aria-label={t("navbar.unload_model_tooltip")}
                  >
                    <Square className="w-3 h-3 fill-current" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <span>{t("navbar.unload_model_tooltip")}</span>
                </TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <button
              onClick={onNavigateToModels}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-border hover:border-primary/50 bg-card-muted/40 hover:bg-card-muted text-xs text-muted-foreground hover:text-foreground transition-all"
            >
              <Zap className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{t("models.btn_load")}</span>
              <ArrowUpRight className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Right: Global Status Indicators & Actions */}
        <div className="flex items-center gap-2 text-xs">
          {/* GPU Telemetry */}
          {gpu?.available ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-card-muted/50 text-[11px] font-medium text-foreground cursor-default">
                  <Zap className="w-3.5 h-3.5 text-primary" />
                  <span className="text-muted-foreground font-mono">RTX 5070</span>
                  <span className="font-mono text-primary tabular-nums">
                    {(gpu.vram_used_mb / 1024).toFixed(1)} / {(gpu.vram_total_mb / 1024).toFixed(0)} GB
                  </span>
                  {gpu.temperature_c > 0 && (
                    <span className="text-muted-foreground font-mono text-[10px]">
                      · {gpu.temperature_c}°C
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1 text-xs">
                  <p className="font-semibold text-primary">{gpu.name}</p>
                  <p>Kullanılan VRAM: {gpu.vram_used_mb} MB / {gpu.vram_total_mb} MB</p>
                  <p>GPU Sıcaklığı: {gpu.temperature_c}°C · Güç: {gpu.power_watts.toFixed(0)}W</p>
                  <p>GPU Yükü: %{gpu.utilization_percent}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-warning/30 bg-warning/10 text-warning text-[11px]">
              <Cpu className="w-3.5 h-3.5" />
              <span>CPU Modu</span>
            </div>
          )}

          {/* System RAM */}
          {sys && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-card-muted/50 text-[11px] font-medium text-foreground cursor-default">
                  <HardDrive className="w-3.5 h-3.5 text-info" />
                  <span className="text-muted-foreground">RAM:</span>
                  <span className="font-mono tabular-nums text-foreground">
                    %{sys.ram_percent.toFixed(0)}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <span>Kullanılan: {sys.ram_used_mb} MB / {sys.ram_total_mb} MB RAM</span>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Worker Health Dot */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border bg-card-muted/40 cursor-default">
                <span
                  className={`w-2 h-2 rounded-full ${
                    activeStatus?.alive ? "bg-success animate-pulse" : "bg-muted-foreground/50"
                  }`}
                />
                <span className="text-[11px] font-medium text-muted-foreground hidden md:inline">
                  {activeStatus?.alive ? t("navbar.worker_healthy") : t("common.inactive")}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <span>{activeStatus?.alive ? `Worker PID: ${activeStatus.pid}` : t("navbar.worker_offline")}</span>
            </TooltipContent>
          </Tooltip>

          {/* Sandbox Level Badge */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="hidden md:flex items-center gap-1 px-2 py-1 rounded-lg border border-success/30 bg-success-surface text-success text-[11px] font-medium cursor-default">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>bwrap</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <span>{t("navbar.sandbox_tooltip")}</span>
            </TooltipContent>
          </Tooltip>

          <div className="h-4 w-px bg-border mx-1" />

          {/* Language Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  toggleLanguage();
                  toast.info(
                    language === "tr" ? "Language Changed" : "Dil Değiştirildi",
                    language === "tr" ? "Switched to English interface." : "Türkçe arayüze geçildi."
                  );
                }}
                className="px-2 py-1.5 rounded-lg border border-border bg-card hover:bg-card-muted text-xs font-semibold text-foreground transition-colors shadow-subtle flex items-center gap-1.5"
                aria-label={t("navbar.language_toggle_tooltip")}
              >
                <Languages className="w-3.5 h-3.5 text-primary" />
                <span className="font-mono text-[11px] tracking-wide">{language.toUpperCase()}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <span>{t("navbar.language_toggle_tooltip")}</span>
            </TooltipContent>
          </Tooltip>

          {/* Theme Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg border border-border bg-card hover:bg-card-muted text-muted-foreground hover:text-foreground transition-colors shadow-subtle"
                aria-label={t("navbar.theme_toggle_tooltip")}
              >
                {isDark ? <Sun className="w-4 h-4 text-primary" /> : <Moon className="w-4 h-4 text-foreground" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <span>{t("navbar.theme_toggle_tooltip")}</span>
            </TooltipContent>
          </Tooltip>

          {/* Shortcuts Help */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onOpenShortcuts}
                className="p-2 rounded-lg border border-border bg-card hover:bg-card-muted text-muted-foreground hover:text-foreground transition-colors shadow-subtle"
                aria-label={t("navbar.shortcuts_tooltip")}
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <span>{t("navbar.shortcuts_tooltip")}</span>
            </TooltipContent>
          </Tooltip>
        </div>
      </header>
    </TooltipProvider>
  );
};
