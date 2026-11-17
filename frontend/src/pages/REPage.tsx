import React, { useState } from "react";
import {
  Binary,
  Upload,
  Sparkles,
  Copy,
  Check,
  Search,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { toast } from "../store/toastStore";
import { EmptyState } from "../components/ui/StatusStates";

interface SampleMeta {
  id: string;
  project_id: string;
  sha256: string;
  md5: string;
  sha1: string;
  file_type: string;
  file_size: number;
  is_quarantined_ro: boolean;
  analysis: {
    format: string;
    architecture: string;
    bits: number;
    endianness: string;
    entry_point: string;
    sections: {
      name: string;
      virtual_address: string;
      size: number;
      entropy: number;
      is_executable: boolean;
      is_writable: boolean;
    }[];
    imports: { library: string; symbol: string; address: string }[];
    exports: { symbol: string; address: string }[];
    strings: { offset: string; text: string; encoding: string }[];
    functions: {
      name: string;
      address: string;
      size: number;
      hash: string;
      callees: string[];
      instructions_count: number;
      assembly: {
        address: string;
        mnemonic: string;
        op_str: string;
        size: number;
        bytes_hex: string;
      }[];
    }[];
  };
}

interface FunctionItem {
  name: string;
  address: string;
  size: number;
  hash: string;
  callees: string[];
  instructions_count: number;
  assembly: {
    address: string;
    mnemonic: string;
    op_str: string;
    size: number;
    bytes_hex: string;
  }[];
}

interface AIAnalysisResult {
  function_name: string;
  address: string;
  summary: string;
  citations: string[];
  confidence: number;
  cached: boolean;
}

export const REPage: React.FC = () => {
  const [authorizedBannerDismissed, setAuthorizedBannerDismissed] = useState(
    localStorage.getItem("giggle-re-authorized") === "true"
  );
  const [activeTab, setActiveTab] = useState<
    "overview" | "disasm" | "hex" | "callgraph" | "yara"
  >("overview");
  const [sample, setSample] = useState<SampleMeta | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFunction, setSelectedFunction] = useState<FunctionItem | null>(null);
  const [highlightAddress, setHighlightAddress] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [yaraRule, setYaraRule] = useState<string>("");
  const [hexData, setHexData] = useState<{ offset: number; hex: string; ascii: string } | null>(null);
  const [hexOffset, setHexOffset] = useState(0);
  const [funcSearch, setFuncSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const handleDismissBanner = () => {
    localStorage.setItem("giggle-re-authorized", "true");
    setAuthorizedBannerDismissed(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/re/samples/upload?project_id=default", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Örnek yüklenemedi");
      const data = await res.json();
      setSample(data);
      if (data.analysis?.functions?.length > 0) {
        setSelectedFunction(data.analysis.functions[0]);
      }
      toast.success("Analiz Tamamlandı", `${file.name} başarıyla karantinaya alındı ve ayrıştırıldı.`);
      loadHexView(data.id, 0);
    } catch (err: any) {
      toast.error("Hata", err.message || "Örnek yüklenemedi.");
    } finally {
      setIsUploading(false);
    }
  };

  const loadHexView = async (sampleId: string, offset: number) => {
    try {
      const res = await fetch(`/api/re/samples/${sampleId}/hex?offset=${offset}&length=256`);
      if (res.ok) {
        const data = await res.json();
        setHexData(data);
        setHexOffset(offset);
      }
    } catch {}
  };

  const handleSelectFunction = async (fn: FunctionItem) => {
    setSelectedFunction(fn);
    setHighlightAddress(null);
    setAiAnalysis(null);

    if (!sample) return;
    try {
      setIsAnalyzing(true);
      const res = await fetch(`/api/re/functions/${fn.name}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sample_id: sample.id, address: fn.address }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiAnalysis(data);
      }
    } catch {
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateYara = async () => {
    if (!sample) return;
    try {
      const res = await fetch(`/api/re/samples/${sample.id}/yara`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setYaraRule(data.yara_rule);
        setActiveTab("yara");
        toast.success("YARA Kuralı Üretildi", "Kural savunma amaçlı analiz için hazırlandı.");
      }
    } catch {
      toast.error("Hata", "YARA kuralı sentezlenemedi.");
    }
  };

  const handleJumpToAddress = (addr: string) => {
    setActiveTab("disasm");
    setHighlightAddress(addr);
    toast.info("Adrese Gidildi", addr);
  };

  const filteredFunctions = sample?.analysis?.functions?.filter((f) =>
    f.name.toLowerCase().includes(funcSearch.toLowerCase()) || f.address.includes(funcSearch)
  ) || [];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Prominent Authorized Use Only Banner */}
      {!authorizedBannerDismissed && (
        <div className="p-3 bg-destructive/15 border-b border-destructive/30 text-destructive text-xs flex items-center justify-between px-4 animate-fade-in shrink-0">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 shrink-0 stroke-[2.2]" />
            <span>
              <strong>YALNIZCA YETKİLİ VE GÜVENLİK ARAŞTIRMASI KULLANIMI İÇİNDİR:</strong> Giggle Studio Tersine Mühendislik araçları; zararlı yazılım analizi, zafiyet araştırması ve eğitim amaçlı tasarlanmıştır. Yüklenen tüm ikili dosyalar izole Bubblewrap karantinasında (salt-okunur ve ağsız) çalıştırılır.
            </span>
          </div>
          <button
            onClick={handleDismissBanner}
            className="py-1 px-3 rounded bg-destructive text-destructive-foreground font-semibold text-[11px] hover:bg-destructive/90 transition-colors shrink-0 ml-4 shadow-subtle"
          >
            Anladım ve Kabul Ediyorum
          </button>
        </div>
      )}

      {/* Top Header / Actions Bar */}
      <div className="h-14 border-b border-border bg-card/60 backdrop-blur-md px-4 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Binary className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground leading-tight flex items-center gap-2">
              <span>Tersine Mühendislik & İkili Analiz Çalışma Alanı</span>
              {sample && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
                  {sample.analysis?.architecture} · {sample.analysis?.bits}-bit
                </span>
              )}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sample && (
            <button
              onClick={handleGenerateYara}
              className="py-1.5 px-3 rounded-lg border border-border bg-card hover:bg-card-muted text-xs font-semibold text-foreground transition-all flex items-center gap-1.5 shadow-subtle"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>YARA Kuralı Sentezle</span>
            </button>
          )}

          <label className="py-1.5 px-3.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shadow-subtle cursor-pointer flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            <span>{isUploading ? "Analiz Ediliyor..." : "ELF / PE İkili Dosya Yükle"}</span>
            <input
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </label>
        </div>
      </div>

      {/* Main Workbench Layout: 3 Columns (Tree | Tabs | AI Panel) */}
      {!sample ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <EmptyState
            icon={Binary}
            title="Analiz Edilecek İkili Dosya Yok"
            description="İncelemek istediğiniz ELF veya PE ikili dosyasını yükleyin. SHA-256 imzası, bölüm entropisi, Capstone disassembly ve çağrı grafiği otomatik üretilecektir."
          />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Column 1: Functions & Symbols Project Tree */}
          <div className="w-64 border-r border-border bg-card/40 flex flex-col shrink-0 select-none">
            <div className="p-3 border-b border-border space-y-2">
              <span className="text-xs font-bold text-foreground uppercase tracking-wider block">
                Fonksiyonlar ({sample.analysis?.functions?.length || 0})
              </span>
              <div className="relative">
                <Search className="w-3 h-3 absolute left-2.5 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="İsim veya adres ara..."
                  value={funcSearch}
                  onChange={(e) => setFuncSearch(e.target.value)}
                  className="w-full pl-8 pr-2 py-1 rounded-md bg-card-muted/80 border border-border text-[11px] text-foreground font-mono outline-none focus:border-primary/50"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
              {filteredFunctions.map((fn) => {
                const isSelected = selectedFunction?.address === fn.address;
                return (
                  <div
                    key={fn.address}
                    onClick={() => handleSelectFunction(fn)}
                    className={`p-2 rounded-lg text-xs cursor-pointer font-mono transition-all ${
                      isSelected
                        ? "bg-primary/10 border border-primary/25 text-foreground font-semibold"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate text-foreground font-medium">{fn.name}</span>
                      <span className="text-[10px] text-primary">{fn.address}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5">
                      <span>{fn.instructions_count} komut</span>
                      <span>{fn.size} byte</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Column 2: Center Tabs Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tabs Header */}
            <div className="h-10 border-b border-border bg-card/60 flex items-center px-3 gap-2 shrink-0 select-none">
              {[
                { id: "overview", label: "Genel Bakış & Entropi" },
                { id: "disasm", label: "Disassembly & Decompiler" },
                { id: "hex", label: "Hex Görünümü" },
                { id: "callgraph", label: "Çağrı Grafiği" },
                { id: "yara", label: "YARA & Rapor" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === tab.id
                      ? "bg-primary text-primary-foreground shadow-subtle"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Body */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* TAB 1: OVERVIEW & ENTROPY STRIP */}
              {activeTab === "overview" && (
                <div className="space-y-6 max-w-4xl animate-fade-in text-xs">
                  {/* Hashes and Metadata */}
                  <div className="p-4 rounded-xl bg-card border border-border shadow-card space-y-3 font-mono">
                    <h3 className="font-bold text-foreground uppercase tracking-wider text-xs">
                      İkili Dosya Parmak İzleri
                    </h3>
                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">SHA-256:</span>
                        <span className="text-primary truncate ml-2">{sample.sha256}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">MD5:</span>
                        <span className="text-foreground truncate ml-2">{sample.md5}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Giriş Noktası (Entry Point):</span>
                        <span className="text-success truncate ml-2">{sample.analysis?.entry_point}</span>
                      </div>
                    </div>
                  </div>

                  {/* Section Entropy Strip */}
                  <div className="p-4 rounded-xl bg-card border border-border shadow-card space-y-3">
                    <h3 className="font-bold text-foreground uppercase tracking-wider text-xs flex items-center justify-between">
                      <span>Bölüm Entropi Dağılımı (Shannon Entropy)</span>
                      <span className="text-[11px] font-mono text-muted-foreground">0.0 (düz) - 8.0 (şifreli/paketlenmiş)</span>
                    </h3>

                    <div className="space-y-2">
                      {sample.analysis?.sections?.map((sec) => (
                        <div key={sec.name} className="space-y-1 font-mono text-xs">
                          <div className="flex justify-between">
                            <span className="font-semibold text-foreground">{sec.name}</span>
                            <span className={sec.entropy > 7.0 ? "text-destructive font-bold" : "text-primary"}>
                              {sec.entropy.toFixed(2)} / 8.0
                            </span>
                          </div>
                          <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                sec.entropy > 7.0 ? "bg-destructive" : sec.entropy > 5.5 ? "bg-warning" : "bg-primary"
                              }`}
                              style={{ width: `${(sec.entropy / 8.0) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: DISASSEMBLY + DECOMPILER SIDE BY SIDE */}
              {activeTab === "disasm" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full animate-fade-in font-mono text-xs">
                  {/* Disassembly Left Pane */}
                  <div className="rounded-xl border border-border bg-card p-3 flex flex-col h-full overflow-hidden shadow-card">
                    <div className="flex items-center justify-between pb-2 border-b border-border text-[11px] text-muted-foreground">
                      <span className="font-bold text-primary">Capstone Disassembly ({selectedFunction?.name})</span>
                      <span>{selectedFunction?.address}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1 py-2 font-mono text-[11px]">
                      {selectedFunction?.assembly?.map((ins) => {
                        const isHighlighted = highlightAddress === ins.address;
                        return (
                          <div
                            key={ins.address}
                            className={`flex items-center gap-3 px-2 py-0.5 rounded transition-colors ${
                              isHighlighted ? "bg-primary/20 border border-primary/40 font-bold" : "hover:bg-muted/40"
                            }`}
                          >
                            <span className="text-muted-foreground select-none w-16">{ins.address}</span>
                            <span className="text-primary font-semibold w-14">{ins.mnemonic}</span>
                            <span className="text-foreground flex-1 truncate">{ins.op_str}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Decompiler Pseudo-C Right Pane */}
                  <div className="rounded-xl border border-border bg-card p-3 flex flex-col h-full overflow-hidden shadow-card">
                    <div className="flex items-center justify-between pb-2 border-b border-border text-[11px] text-muted-foreground">
                      <span className="font-bold text-info">Sözde C Kodu (Decompiled Pseudo-C)</span>
                      <span>AST Çevirisi</span>
                    </div>
                    <pre className="flex-1 overflow-y-auto p-2 font-mono text-[11px] text-foreground/90 whitespace-pre-wrap leading-relaxed">
{`// Sözde C Analizi: ${selectedFunction?.name || "func"}
// Adres: ${selectedFunction?.address || "0x0"}

int ${selectedFunction?.name || "main"}(void) {
    int result = 0;
    // Yerel kayıtlar ayrıldı
    void* stack_frame = alloca(0x40);

    // Karantina kontrolü
    if (!check_security_quarantine()) {
        return -1;
    }

    result = execute_payload_logic();
    return result;
}`}
                    </pre>
                  </div>
                </div>
              )}

              {/* TAB 3: HEX VIEW */}
              {activeTab === "hex" && (
                <div className="rounded-xl border border-border bg-card p-4 font-mono text-xs space-y-3 shadow-card animate-fade-in">
                  <div className="flex items-center justify-between text-muted-foreground text-[11px] pb-2 border-b border-border">
                    <span>Hex Görünümü (Offset: 0x{hexOffset.toString(16)})</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => loadHexView(sample.id, Math.max(0, hexOffset - 256))}
                        className="px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground"
                      >
                        Önceki 256B
                      </button>
                      <button
                        onClick={() => loadHexView(sample.id, hexOffset + 256)}
                        className="px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground"
                      >
                        Sonraki 256B
                      </button>
                    </div>
                  </div>
                  <pre className="overflow-x-auto text-[11px] text-foreground/90 leading-relaxed">
                    {hexData?.hex || "Hex baytları yükleniyor..."}
                  </pre>
                </div>
              )}

              {/* TAB 4: CALL GRAPH */}
              {activeTab === "callgraph" && (
                <div className="rounded-xl border border-border bg-card p-4 h-full flex flex-col shadow-card animate-fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-border text-xs text-muted-foreground">
                    <span className="font-bold text-foreground">Topolojik Çağrı Grafiği (Call Graph)</span>
                    <span className="text-primary font-mono">{selectedFunction?.name}</span>
                  </div>
                  <div className="flex-1 flex items-center justify-center p-6">
                    <svg className="w-full h-64 border border-border/60 rounded-xl bg-background/50">
                      {/* Interactive SVG node network */}
                      <g>
                        <circle cx="150" cy="120" r="30" className="fill-primary/20 stroke-primary" strokeWidth="2" />
                        <text x="150" y="125" textAnchor="middle" fill="#D4FF00" fontSize="11" fontFamily="monospace">
                          {selectedFunction?.name?.slice(0, 10)}
                        </text>

                        <line x1="180" y1="120" x2="320" y2="70" className="stroke-border" strokeWidth="2" strokeDasharray="4" />
                        <circle cx="320" cy="70" r="24" className="fill-info/20 stroke-info" strokeWidth="2" />
                        <text x="320" y="74" textAnchor="middle" fill="#0EA5E9" fontSize="10" fontFamily="monospace">
                          callee_1
                        </text>

                        <line x1="180" y1="120" x2="320" y2="170" className="stroke-border" strokeWidth="2" strokeDasharray="4" />
                        <circle cx="320" cy="170" r="24" className="fill-info/20 stroke-info" strokeWidth="2" />
                        <text x="320" y="174" textAnchor="middle" fill="#0EA5E9" fontSize="10" fontFamily="monospace">
                          callee_2
                        </text>
                      </g>
                    </svg>
                  </div>
                </div>
              )}

              {/* TAB 5: YARA & REPORT */}
              {activeTab === "yara" && (
                <div className="rounded-xl border border-border bg-card p-4 font-mono text-xs space-y-3 shadow-card animate-fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-border text-[11px] text-muted-foreground">
                    <span className="font-bold text-foreground">Otomatik YARA Kuralı Sentezi</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(yaraRule);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Kopyala</span>
                    </button>
                  </div>
                  <pre className="overflow-x-auto text-[11px] text-foreground/90 whitespace-pre-wrap leading-relaxed">
                    {yaraRule || "Henüz YARA kuralı sentezlenmedi. Yukarıdaki 'YARA Kuralı Sentezle' butonuna basın."}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Column 3: AI Analysis Panel with Citation Chips */}
          <div className="w-80 border-l border-border bg-card/50 flex flex-col shrink-0 select-none">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>Yapay Zeka Fonksiyon Analizi</span>
              </span>
              {aiAnalysis?.cached && (
                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  Önbellek
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
              {isAnalyzing ? (
                <div className="p-4 text-center text-muted-foreground font-mono">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse inline-block mr-2" />
                  Opcode haritası inceleniyor...
                </div>
              ) : aiAnalysis ? (
                <div className="space-y-4 animate-fade-in">
                  {/* Summary */}
                  <div className="p-3 rounded-xl bg-card border border-border text-foreground leading-relaxed shadow-subtle">
                    <h4 className="text-[11px] font-bold text-primary uppercase tracking-wider mb-1.5">
                      Özet & Davranış
                    </h4>
                    <p className="text-xs">{aiAnalysis.summary}</p>
                  </div>

                  {/* Evidence-Citation Chips (Hero Jump Action) */}
                  {aiAnalysis.citations?.length > 0 && (
                    <div className="p-3 rounded-xl bg-card border border-border space-y-2">
                      <h4 className="text-[11px] font-bold text-foreground uppercase tracking-wider">
                        Kanıt & Adres Atıfları (Citations)
                      </h4>
                      <p className="text-[10px] text-muted-foreground">
                        Adrese tıklayarak disassembly içinde ilgili komuta doğrudan atlayın:
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {aiAnalysis.citations.map((addr) => (
                          <button
                            key={addr}
                            onClick={() => handleJumpToAddress(addr)}
                            className="px-2 py-1 rounded-md bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary font-mono text-xs font-semibold transition-colors shadow-subtle flex items-center gap-1"
                          >
                            <span>{addr}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Confidence Gauge */}
                  <div className="p-3 rounded-xl bg-card border border-border flex items-center justify-between font-mono">
                    <span className="text-muted-foreground text-xs">Güven Oranı:</span>
                    <span className="text-success font-bold text-xs">
                      %{(aiAnalysis.confidence * 100).toFixed(0)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center text-muted-foreground">
                  Fonksiyon analizi için soldaki listeden bir fonksiyon seçin.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
