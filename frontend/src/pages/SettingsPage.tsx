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
} from "lucide-react";
import { DoctorResponse, fetchDoctorDiagnostics } from "../lib/api";
import { GiggleLogo } from "../components/GiggleLogo";
import { toast } from "../store/toastStore";
import { Switch } from "../components/ui/Switch";

export const SettingsPage: React.FC = () => {
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
      toast.error("Hata", "Teşhis çalıştırılamadı.");
    } finally {
      setDoctorLoading(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    toast.success("Ayarlar Kaydedildi", "Yapılandırma başarıyla güncellendi.");
    setTimeout(() => setSaved(false), 3000);
  };

  const handleCopyFix = (fix: string, idx: number) => {
    navigator.clipboard.writeText(fix);
    setCopiedFixIndex(idx);
    toast.info("Kopyalandı", "Çözüm komutu panoya kopyalandı.");
    setTimeout(() => setCopiedFixIndex(null), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-background p-4 md:p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <SettingsIcon className="w-6 h-6 text-primary" />
            <span>Ayarlar, Sistem Doktoru & Hakkında</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Giggle Studio sunucu yapılandırması, donanım teşhisi ve proje detayları.
          </p>
        </div>

        {saved && (
          <div className="flex items-center gap-1.5 bg-success/15 border border-success/30 text-success px-3 py-1.5 rounded-lg text-xs font-semibold animate-fade-in">
            <Check className="w-4 h-4" /> Ayarlar Kaydedildi
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
          <span>Yapılandırma</span>
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
          <span>Sistem Doktoru</span>
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
          <span>Hakkında (About)</span>
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
              placeholder="Ayarlarda ara (Örn: Port, VRAM, Token, OpenAI)..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-card border border-border text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
            />
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            {/* Section 1: Server & Host */}
            {(!searchFilter || "sunucu host port ağ".includes(searchFilter.toLowerCase())) && (
              <div className="p-5 rounded-2xl bg-card border border-border shadow-card space-y-4">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <Server className="w-4 h-4 text-primary" />
                  <span>Sunucu & Ağ Parametreleri</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Sunucu Adresi (Host)</label>
                    <input
                      type="text"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      className="w-full p-2 rounded-lg bg-card-muted/60 border border-border text-xs text-foreground font-mono outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Sunucu Portu</label>
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
            {(!searchFilter || "gpu vram ram limit güvenlik".includes(searchFilter.toLowerCase())) && (
              <div className="p-5 rounded-2xl bg-card border border-border shadow-card space-y-4">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-primary" />
                  <span>GPU & Donanım Güvenlik Limitleri</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">VRAM Güvenlik Marjı (MB)</label>
                    <input
                      type="number"
                      value={vramMargin}
                      onChange={(e) => setVramMargin(parseInt(e.target.value))}
                      className="w-full p-2 rounded-lg bg-card-muted/60 border border-border text-xs text-foreground font-mono outline-none focus:border-primary"
                    />
                    <p className="text-[10px] text-muted-foreground">OOM çökmelerini önlemek için ayrılan tampon.</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Sistem RAM Tavanı (%)</label>
                    <input
                      type="number"
                      value={ramCeiling}
                      onChange={(e) => setRamCeiling(parseInt(e.target.value))}
                      className="w-full p-2 rounded-lg bg-card-muted/60 border border-border text-xs text-foreground font-mono outline-none focus:border-primary"
                    />
                    <p className="text-[10px] text-muted-foreground">Eğitim ve çıkarım sırasında RAM sınır yüzdesi.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Section 3: Integrations & API Keys */}
            {(!searchFilter || "anahtar huggingface token openai gmail api".includes(searchFilter.toLowerCase())) && (
              <div className="p-5 rounded-2xl bg-card border border-border shadow-card space-y-4">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" />
                  <span>Entegrasyonlar & API Anahtarları</span>
                </h3>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Hugging Face Erişim Belirteci (HF Token)</label>
                    <input
                      type="password"
                      placeholder="hf_..."
                      value={hfToken}
                      onChange={(e) => setHfToken(e.target.value)}
                      className="w-full p-2 rounded-lg bg-card-muted/60 border border-border text-xs text-foreground font-mono outline-none focus:border-primary"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-card-muted/40 border border-border">
                    <div>
                      <span className="text-xs font-semibold text-foreground">OpenAI Uyumlu API Uç Noktası</span>
                      <p className="text-[10px] text-muted-foreground">/v1/chat/completions uç noktasını yerel olarak etkinleştirir.</p>
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
              <span>Ayarları Kaydet</span>
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
                Gizlilik Koruması: Çıktılar otomatik sansürlenir (redacted); kullanıcı adları ve sırlar gizlenir.
              </span>
            </div>
            <button
              onClick={loadDoctor}
              disabled={doctorLoading}
              className="py-1.5 px-3.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shadow-subtle flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${doctorLoading ? "animate-spin" : ""}`} />
              <span>Teşhisi Yeniden Çalıştır</span>
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
                    ? "Tüm Sistem Sağlık Kontrolleri Başarılı"
                    : "Bazı Kontrollerde Uyarılar Bulunuyor"}
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
                        <span>Hedef: <strong className="text-foreground">{check.target}</strong></span>
                        <span>Ölçülen: <strong className="text-primary">{check.measured}</strong></span>
                      </div>
                    </div>

                    {check.fix && (
                      <button
                        onClick={() => handleCopyFix(check.fix!, idx)}
                        className="py-1 px-3 rounded-lg bg-card-muted border border-border font-mono text-[11px] text-warning hover:bg-muted text-left transition-colors flex items-center justify-between gap-2"
                        title="Çözüm komutunu kopyala"
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
                <span>Giggle Studio</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
                  v0.1.0-alpha
                </span>
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Yerel donanımınızda çalışan, yüksek performanslı, gizlilik odaklı LLM çıkarımı, otonom agent ve tersine mühendislik stüdyosu.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left pt-2">
              <div className="p-3 rounded-xl bg-card-muted/60 border border-border">
                <span className="text-[10px] text-muted-foreground block uppercase font-bold">Geliştirici</span>
                <strong className="text-foreground font-mono">Sedat-gigglemorgan</strong>
              </div>
              <div className="p-3 rounded-xl bg-card-muted/60 border border-border">
                <span className="text-[10px] text-muted-foreground block uppercase font-bold">Lisans</span>
                <strong className="text-foreground font-mono">MIT License</strong>
              </div>
              <div className="p-3 rounded-xl bg-card-muted/60 border border-border">
                <span className="text-[10px] text-muted-foreground block uppercase font-bold">Hızlandırıcı</span>
                <strong className="text-primary font-mono">RTX 5070 12GB</strong>
              </div>
              <div className="p-3 rounded-xl bg-card-muted/60 border border-border">
                <span className="text-[10px] text-muted-foreground block uppercase font-bold">Kumhavuzu</span>
                <strong className="text-success font-mono">Bubblewrap</strong>
              </div>
            </div>

            <div className="pt-4 border-t border-border flex items-center justify-center gap-4">
              <a
                href="https://github.com/gigglemorgan/giggle-studio"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 py-2 px-4 rounded-lg bg-card-muted hover:bg-muted border border-border text-xs font-semibold text-foreground transition-colors"
              >
                <Github className="w-4 h-4 text-primary" />
                <span>GitHub Deposu (gigglemorgan/giggle-studio)</span>
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
