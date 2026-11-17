import React, { useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  Key,
  Server,
  Save,
  Check,
  Cpu,
  Info,
  Stethoscope,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Search,
  Copy,
  ExternalLink,
  Sparkles,
  Github,
  Languages,
} from "lucide-react";
import { DoctorResponse, fetchDoctorDiagnostics } from "../lib/api";
import { GiggleLogo } from "../components/GiggleLogo";
import { toast } from "../store/toastStore";
import { Switch } from "../components/ui/Switch";
import { useLanguageStore } from "../i18n";

export const SettingsPage: React.FC = () => {
  const { language, setLanguage, t } = useLanguageStore();
  const [activeTab, setActiveTab] = useState<"settings" | "doctor" | "about">("settings");
  const [searchFilter, setSearchFilter] = useState("");

  // Settings State
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState(8420);
  const [vramMargin, setVramMargin] = useState(600);
  const [ramCeiling, setRamCeiling] = useState(85);
  const [hfToken, setHfToken] = useState("");
  const [openaiCompat, setOpenaiCompat] = useState(false);
  const [saved, setSaved] = useState(false);

  // Doctor State
  const [doctorReport, setDoctorReport] = useState<DoctorResponse | null>(null);
  const [doctorLoading, setDoctorLoading] = useState(false);
  const [copiedFixIndex, setCopiedFixIndex] = useState<number | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch("/api/system/status");
        if (res.ok) {
          const data = await res.json();
          if (data.server) {
            setHost(data.server.host || "127.0.0.1");
            setPort(data.server.port || 8420);
          }
        }
      } catch {}
    };
    loadSettings();
    loadDoctor();
  }, []);

  const loadDoctor = async () => {
    try {
      setDoctorLoading(true);
      const data = await fetchDoctorDiagnostics();
      setDoctorReport(data);
    } catch {
      toast.error(t("common.error"), t("doctor.status_warning"));
    } finally {
      setDoctorLoading(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    toast.success(t("common.saved"), t("settings.saved_toast"));
    setTimeout(() => setSaved(false), 3000);
  };

  const handleCopyFix = (fix: string, idx: number) => {
    navigator.clipboard.writeText(fix);
    setCopiedFixIndex(idx);
    toast.info(t("common.copied"), t("doctor.fix"));
    setTimeout(() => setCopiedFixIndex(null), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-background p-4 md:p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <SettingsIcon className="w-6 h-6 text-primary" />
            <span>{t("settings.title")}</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("settings.subtitle")}
          </p>
        </div>

        {saved && (
          <div className="flex items-center gap-1.5 bg-success/15 border border-success/30 text-success px-3 py-1.5 rounded-lg text-xs font-semibold animate-fade-in">
            <Check className="w-4 h-4" /> {t("common.saved")}
          </div>
        )}
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === "settings"
              ? "bg-primary text-primary-foreground shadow-subtle"
              : "text-muted-foreground hover:text-foreground hover:bg-card"
          }`}
        >
          <SettingsIcon className="w-4 h-4" />
          <span>{t("settings.tab_general")}</span>
        </button>
        <button
          onClick={() => setActiveTab("doctor")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === "doctor"
              ? "bg-primary text-primary-foreground shadow-subtle"
              : "text-muted-foreground hover:text-foreground hover:bg-card"
          }`}
        >
          <Stethoscope className="w-4 h-4" />
          <span>{t("settings.tab_doctor")}</span>
        </button>
        <button
          onClick={() => setActiveTab("about")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === "about"
              ? "bg-primary text-primary-foreground shadow-subtle"
              : "text-muted-foreground hover:text-foreground hover:bg-card"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>{t("settings.tab_about")}</span>
        </button>
      </div>

      {/* TAB 1: SETTINGS */}
      {activeTab === "settings" && (
        <div className="space-y-6 max-w-4xl animate-fade-in">
          {/* Search settings input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder={t("common.search")}
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-card border border-border text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
            />
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            {/* Section 0: Language Preference */}
            {(!searchFilter || "dil language l10n i18n türkçe english".includes(searchFilter.toLowerCase())) && (
              <div className="p-5 rounded-2xl bg-card border border-border shadow-card space-y-4">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <Languages className="w-4 h-4 text-primary" />
                  <span>{t("settings.language_title")}</span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("settings.language_desc")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                  <button
                    type="button"
                    onClick={() => {
                      setLanguage("tr");
                      toast.info("Dil Değiştirildi", "Türkçe arayüze geçildi.");
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs font-semibold transition-all ${
                      language === "tr"
                        ? "border-primary bg-primary/10 text-primary shadow-subtle ring-1 ring-primary/40"
                        : "border-border bg-card-muted/40 text-muted-foreground hover:text-foreground hover:bg-card-muted"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">🇹🇷</span>
                      <span>{t("settings.language_tr")}</span>
                    </div>
                    {language === "tr" && <Check className="w-4 h-4 text-primary" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLanguage("en");
                      toast.info("Language Changed", "Switched to English interface.");
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs font-semibold transition-all ${
                      language === "en"
                        ? "border-primary bg-primary/10 text-primary shadow-subtle ring-1 ring-primary/40"
                        : "border-border bg-card-muted/40 text-muted-foreground hover:text-foreground hover:bg-card-muted"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">🇬🇧</span>
                      <span>{t("settings.language_en")}</span>
                    </div>
                    {language === "en" && <Check className="w-4 h-4 text-primary" />}
                  </button>
                </div>
              </div>
            )}
            {/* Section 1: Server & Host */}
            {(!searchFilter || "sunucu host port ağ network server".includes(searchFilter.toLowerCase())) && (
              <div className="p-5 rounded-2xl bg-card border border-border shadow-card space-y-4">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <Server className="w-4 h-4 text-primary" />
                  <span>{t("settings.network_title")}</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("settings.host_label")}</label>
                    <input
                      type="text"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      className="w-full p-2 rounded-lg bg-card-muted/60 border border-border text-xs text-foreground font-mono outline-none focus:border-primary"
                    />
                    <p className="text-[10px] text-muted-foreground">{t("settings.host_help")}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("settings.port_label")}</label>
                    <input
                      type="number"
                      value={port}
                      onChange={(e) => setPort(parseInt(e.target.value))}
                      className="w-full p-2 rounded-lg bg-card-muted/60 border border-border text-xs text-foreground font-mono outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Section 2: GPU & Safety Limits */}
            {(!searchFilter || "gpu vram ram limit güvenlik memory safety".includes(searchFilter.toLowerCase())) && (
              <div className="p-5 rounded-2xl bg-card border border-border shadow-card space-y-4">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-primary" />
                  <span>{t("settings.memory_title")}</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("settings.vram_margin_label")}</label>
                    <input
                      type="number"
                      value={vramMargin}
                      onChange={(e) => setVramMargin(parseInt(e.target.value))}
                      className="w-full p-2 rounded-lg bg-card-muted/60 border border-border text-xs text-foreground font-mono outline-none focus:border-primary"
                    />
                    <p className="text-[10px] text-muted-foreground">{t("settings.vram_margin_help")}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("settings.ram_ceiling_label")}</label>
                    <input
                      type="number"
                      value={ramCeiling}
                      onChange={(e) => setRamCeiling(parseInt(e.target.value))}
                      className="w-full p-2 rounded-lg bg-card-muted/60 border border-border text-xs text-foreground font-mono outline-none focus:border-primary"
                    />
                    <p className="text-[10px] text-muted-foreground">{t("settings.ram_ceiling_help")}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Section 3: Integrations & API Keys */}
            {(!searchFilter || "anahtar huggingface token openai gmail api keys".includes(searchFilter.toLowerCase())) && (
              <div className="p-5 rounded-2xl bg-card border border-border shadow-card space-y-4">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" />
                  <span>{t("settings.api_keys_title")}</span>
                </h3>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{t("settings.hf_token_label")}</label>
                    <input
                      type="password"
                      placeholder={t("settings.hf_token_placeholder")}
                      value={hfToken}
                      onChange={(e) => setHfToken(e.target.value)}
                      className="w-full p-2 rounded-lg bg-card-muted/60 border border-border text-xs text-foreground font-mono outline-none focus:border-primary"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-card-muted/40 border border-border">
                    <div>
                      <span className="text-xs font-semibold text-foreground">{t("settings.openai_compat_title")}</span>
                      <p className="text-[10px] text-muted-foreground">{t("settings.openai_compat_desc")}</p>
                    </div>
                    <Switch checked={openaiCompat} onCheckedChange={setOpenaiCompat} />
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="py-2.5 px-6 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all shadow-subtle flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{t("settings.btn_save")}</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: DOCTOR */}
      {activeTab === "doctor" && (
        <div className="space-y-6 max-w-4xl animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="w-4 h-4 text-success" />
              <span>
                {t("navbar.sandbox_tooltip")}
              </span>
            </div>
            <button
              onClick={loadDoctor}
              disabled={doctorLoading}
              className="py-1.5 px-3.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shadow-subtle flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${doctorLoading ? "animate-spin" : ""}`} />
              <span>{t("doctor.run_diagnostics")}</span>
            </button>
          </div>

          {doctorReport && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-xl border flex items-center gap-3 ${
                  doctorReport.status === "healthy"
                    ? "bg-success/10 border-success/30 text-success"
                    : "bg-warning/10 border-warning/30 text-warning"
                }`}
              >
                {doctorReport.status === "healthy" ? (
                  <CheckCircle2 className="w-5 h-5 text-success" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-warning" />
                )}
                <span className="font-bold text-xs">
                  {doctorReport.status === "healthy"
                    ? t("doctor.status_healthy")
                    : t("doctor.status_warning")}
                </span>
              </div>

              {/* Checklist */}
              <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden divide-y divide-border/60">
                {doctorReport.checks.map((check, idx) => (
                  <div key={idx} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-semibold text-foreground">
                        {check.status === "pass" && <CheckCircle2 className="w-4 h-4 text-success" />}
                        {check.status === "warn" && <AlertTriangle className="w-4 h-4 text-warning" />}
                        {check.status === "fail" && <AlertTriangle className="w-4 h-4 text-destructive" />}
                        {check.status === "info" && <Info className="w-4 h-4 text-info" />}
                        <span>{check.name}</span>
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground flex flex-wrap gap-x-4">
                        <span>{t("doctor.target")}: <strong className="text-foreground">{check.target}</strong></span>
                        <span>{t("doctor.measured")}: <strong className="text-primary">{check.measured}</strong></span>
                      </div>
                    </div>

                    {check.fix && (
                      <button
                        onClick={() => handleCopyFix(check.fix!, idx)}
                        className="py-1 px-3 rounded-lg bg-card-muted border border-border font-mono text-[11px] text-warning hover:bg-muted text-left transition-colors flex items-center justify-between gap-2"
                        title={t("doctor.btn_copy_fix")}
                      >
                        <span className="truncate max-w-[260px]">{check.fix}</span>
                        {copiedFixIndex === idx ? (
                          <Check className="w-3 h-3 text-success shrink-0" />
                        ) : (
                          <Copy className="w-3 h-3 text-muted-foreground shrink-0" />
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ABOUT */}
      {activeTab === "about" && (
        <div className="space-y-6 max-w-3xl mx-auto w-full animate-fade-in text-xs">
          <div className="p-6 rounded-2xl bg-card border border-border shadow-card space-y-6 text-center">
            <GiggleLogo size={56} className="mx-auto" />
            <div>
              <h3 className="text-lg font-bold text-foreground flex items-center justify-center gap-2">
                <span>{t("app.title")}</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
                  {t("app.version")}
                </span>
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                {t("settings.about_tagline")}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left pt-2">
              <div className="p-3 rounded-xl bg-card-muted/60 border border-border">
                <span className="text-[10px] text-muted-foreground block uppercase font-bold">{t("settings.about_author")}</span>
                <strong className="text-foreground font-mono">{t("app.author")}</strong>
              </div>
              <div className="p-3 rounded-xl bg-card-muted/60 border border-border">
                <span className="text-[10px] text-muted-foreground block uppercase font-bold">{t("settings.about_license")}</span>
                <strong className="text-foreground font-mono">{t("app.license")}</strong>
              </div>
              <div className="p-3 rounded-xl bg-card-muted/60 border border-border">
                <span className="text-[10px] text-muted-foreground block uppercase font-bold">{t("resources.gpu_title")}</span>
                <strong className="text-primary font-mono">RTX 5070 12GB</strong>
              </div>
              <div className="p-3 rounded-xl bg-card-muted/60 border border-border">
                <span className="text-[10px] text-muted-foreground block uppercase font-bold">{t("navbar.sandbox_badge")}</span>
                <strong className="text-success font-mono">Bubblewrap</strong>
              </div>
            </div>

            <div className="pt-4 border-t border-border flex items-center justify-center gap-4">
              <a
                href={t("app.repository")}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 py-2 px-4 rounded-lg bg-card-muted hover:bg-muted border border-border text-xs font-semibold text-foreground transition-colors"
              >
                <Github className="w-4 h-4 text-primary" />
                <span>{t("settings.about_repo")} (gigglemorgan/giggle-studio)</span>
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
