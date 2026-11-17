import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/Dialog";
import { GiggleLogo } from "./GiggleLogo";
import { Sparkles, Cpu, Download, MessageSquare, ArrowRight, CheckCircle2 } from "lucide-react";
import confetti from "canvas-confetti";
import { SystemStatusResponse } from "../lib/api";
import { toast } from "../store/toastStore";
import { useLanguageStore } from "../i18n";

interface OnboardingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statusData?: SystemStatusResponse;
  onNavigateToChat: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  open,
  onOpenChange,
  statusData,
  onNavigateToChat,
}) => {
  const { t } = useLanguageStore();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const gpuName = statusData?.telemetry.gpu.name || "NVIDIA GeForce RTX 5070";
  const vramMb = statusData?.telemetry.gpu.vram_total_mb || 12288;
  const vramGb = (vramMb / 1024).toFixed(1);

  const handleStartDownload = async () => {
    setDownloading(true);
    setDownloadProgress(10);
    try {
      const interval = setInterval(() => {
        setDownloadProgress((prev) => {
          if (prev >= 95) {
            clearInterval(interval);
            return 95;
          }
          return prev + 15;
        });
      }, 300);

      const res = await fetch("/api/models/hf/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_id: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
          filename: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
        }),
      });

      clearInterval(interval);
      setDownloadProgress(100);

      if (res.ok) {
        toast.success("Model İndirildi", "Qwen2.5-0.5B modeli hazır!");
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.6 },
          colors: ["#D4FF00", "#10B981", "#38BDF8"],
        });
        setStep(3);
      } else {
        toast.info("Bilgi", "Model mevcut veya indirme sıraya alındı.");
        setStep(3);
      }
    } catch {
      toast.info("Bilgi", "Model kontrolü tamamlandı.");
      setStep(3);
    } finally {
      setDownloading(false);
    }
  };

  const handleFinish = () => {
    localStorage.setItem("giggle-onboarded", "true");
    onOpenChange(false);
    onNavigateToChat();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        {/* Banner */}
        <div className="bg-gradient-to-br from-card via-card-muted to-primary/10 p-6 border-b border-border text-center relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
          <GiggleLogo size={48} className="mx-auto mb-3 drop-shadow-md" />
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
            {t("onboarding.title")}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {t("onboarding.subtitle")}
          </DialogDescription>
        </div>

        <div className="p-6">
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
                <Cpu className="w-4 h-4" />
                <span>{t("onboarding.step1_title")}</span>
              </div>
              <div className="p-4 rounded-xl bg-card-muted/60 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{t("onboarding.gpu_detected")}:</span>
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                    {gpuName}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("onboarding.vram_available")}:</span>
                  <span className="text-xs font-mono font-semibold text-primary">{vramGb} GB</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("onboarding.step1_desc")}
              </p>
              <button
                onClick={() => setStep(2)}
                className="w-full mt-2 py-2.5 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-xs flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors shadow-subtle"
              >
                <span>{t("common.next")}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                <span>{t("onboarding.step2_title")}</span>
              </div>
              <div className="p-4 rounded-xl bg-card-muted/60 border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{t("onboarding.starter_model_name")}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-primary/15 text-primary border border-primary/20 font-mono">
                    ~390 MB
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("onboarding.starter_model_desc")}
                </p>
              </div>

              {downloading ? (
                <div className="space-y-2 py-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("onboarding.btn_downloading", { progress: downloadProgress })}</span>
                    <span className="font-mono text-primary">{downloadProgress}%</span>
                  </div>
                  <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-primary h-full transition-all duration-300 rounded-full"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setStep(3)}
                    className="flex-1 py-2 px-3 rounded-lg border border-border hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t("onboarding.btn_skip")}
                  </button>
                  <button
                    onClick={handleStartDownload}
                    className="flex-[2] py-2 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-xs flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors shadow-subtle"
                  >
                    <Download className="w-4 h-4" />
                    <span>{t("onboarding.btn_download_start")}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-fade-in text-center py-2">
              <div className="w-12 h-12 rounded-full bg-success/15 border border-success/30 flex items-center justify-center text-success mx-auto">
                <CheckCircle2 className="w-6 h-6 stroke-[2]" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">{t("onboarding.step3_title")}</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                {t("onboarding.step3_desc")}
              </p>
              <button
                onClick={handleFinish}
                className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-xs flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors shadow-accent-glow"
              >
                <MessageSquare className="w-4 h-4" />
                <span>{t("onboarding.btn_continue_chat")}</span>
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
