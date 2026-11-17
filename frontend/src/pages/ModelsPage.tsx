import React, { useEffect, useState } from "react";
import {
  Layers,
  DownloadCloud,
  RefreshCw,
  Sliders,
  Search,
  LayoutGrid,
  List,
} from "lucide-react";
import { OffloadPlanner } from "../features/OffloadPlanner";
import { useModelStore } from "../store/modelStore";
import { toast } from "../store/toastStore";
import { useLanguageStore } from "../i18n";
import { EmptyState, Skeleton } from "../components/ui/StatusStates";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/Dialog";

export const ModelsPage: React.FC = () => {
  const { t } = useLanguageStore();
  const { activeStatus, fetchActiveStatus } = useModelStore();

  const [localModels, setLocalModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModelForOffload, setSelectedModelForOffload] = useState<any | null>(null);

  // Hugging Face downloader state
  const [showHfDialog, setShowHfDialog] = useState(false);
  const [hfRepoInput, setHfRepoInput] = useState("");
  const [hfModelInfo, setHfModelInfo] = useState<any>(null);
  const [hfSearching, setHfSearching] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<any>(null);

  const fetchModels = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/models");
      if (res.ok) {
        const data = await res.json();
        setLocalModels(data);
      }
      await fetchActiveStatus();
    } catch {
      toast.error("Hata", "Modeller listelenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const handleScan = async () => {
    try {
      setScanning(true);
      const res = await fetch("/api/models/scan", { method: "POST" });
      if (res.ok) {
        const scanned = await res.json();
        toast.success("Dizin Tarandı", `${scanned.length} model yerel dizinde doğrulandı.`);
        fetchModels();
      }
    } catch {
      toast.error("Tarama Hatası", "Model dizini taranırken bir hata oluştu.");
    } finally {
      setScanning(false);
    }
  };

  const handleSearchHf = async () => {
    if (!hfRepoInput.trim()) return;
    try {
      setHfSearching(true);
      const res = await fetch(`/api/models/hf/info?repo_id=${encodeURIComponent(hfRepoInput.trim())}`);
      if (!res.ok) throw new Error("Model bilgileri alınamadı");
      const data = await res.json();
      setHfModelInfo(data);
    } catch (err: any) {
      toast.error("Hugging Face Hatası", err.message || "Model bulunamadı.");
    } finally {
      setHfSearching(false);
    }
  };

  const handleDownloadHfFile = async (filename: string) => {
    try {
      setDownloadProgress({ filename, percent: 0, status: "Başlatılıyor..." });
      const res = await fetch("/api/models/hf/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_id: hfModelInfo.repo_id,
          filename: filename,
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder("utf-8");

      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "").trim();
            try {
              const parsed = JSON.parse(dataStr);
              setDownloadProgress(parsed);
              if (parsed.status === "completed") {
                toast.success("İndirme Tamamlandı", `${filename} hazır.`);
                setShowHfDialog(false);
                fetchModels();
              }
            } catch {}
          }
        }
      }
    } catch {
      toast.error("İndirme Hatası", "Model indirilirken bağlantı koptu.");
    }
  };

  const filteredModels = localModels.filter((m) =>
    m.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // VRAM fit helper (RTX 5070 has 12288 MB)
  const getVramFit = (sizeMb: number) => {
    if (sizeMb <= 10000) {
      return {
        label: t("models.vram_fit_green"),
        status: "safe",
        classes: "bg-success/15 text-success border-success/30",
      };
    } else if (sizeMb <= 14000) {
      return {
        label: t("models.vram_fit_amber"),
        status: "warn",
        classes: "bg-warning/15 text-warning border-warning/30",
      };
    } else {
      return {
        label: t("models.vram_fit_red"),
        status: "danger",
        classes: "bg-destructive/15 text-destructive border-destructive/30",
      };
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background p-4 md:p-6 space-y-6">
        {/* Top Header & Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <Layers className="w-6 h-6 text-primary" />
              <span>{t("models.title")}</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("models.subtitle")}
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card hover:bg-card-muted text-xs font-medium text-foreground transition-all shadow-subtle"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? "animate-spin text-primary" : ""}`} />
              <span>{scanning ? t("common.loading") : t("common.refresh")}</span>
            </button>
            <button
              onClick={() => setShowHfDialog(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shadow-subtle"
            >
              <DownloadCloud className="w-4 h-4" />
              <span>{t("models.btn_download_hf")}</span>
            </button>
          </div>
        </div>

        {/* Filter Bar & View Toggle */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder={t("models.search_placeholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-card border border-border text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
            />
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-card border border-border">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded transition-colors ${
                viewMode === "grid" ? "bg-primary text-primary-foreground shadow-subtle" : "text-muted-foreground hover:text-foreground"
              }`}
              title={t("models.btn_view_grid")}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded transition-colors ${
                viewMode === "list" ? "bg-primary text-primary-foreground shadow-subtle" : "text-muted-foreground hover:text-foreground"
              }`}
              title={t("models.btn_view_list")}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Local Models Section */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-4 rounded-xl border border-border bg-card/60 space-y-3">
                <Skeleton className="w-2/3 h-4" />
                <Skeleton className="w-1/3 h-3" />
                <Skeleton className="w-full h-8 mt-2" />
              </div>
            ))}
          </div>
        ) : filteredModels.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="Yerel Model Bulunamadı"
            description="Yerel model dizininde GGUF dosyası bulunamadı. Hugging Face üzerinden tek tıkla model indirebilirsiniz."
            action={{
              label: "Hugging Face Model İndir",
              onClick: () => setShowHfDialog(true),
              icon: DownloadCloud,
            }}
          />
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredModels.map((model) => {
              const fit = getVramFit(model.file_size_mb);
              const isActive = activeStatus?.alive && activeStatus.current_model?.includes(model.name);

              return (
                <div
                  key={model.id}
                  className={`rounded-xl border p-4 bg-card shadow-card flex flex-col justify-between transition-all ${
                    isActive ? "border-primary/50 ring-1 ring-primary/30" : "border-border hover:border-border/80"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-foreground truncate" title={model.name}>
                          {model.name}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                            {model.quantization || "Q4_K_M"}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {model.parameters ? `${model.parameters}` : "Bilinmiyor"}
                          </span>
                        </div>
                      </div>
                      {isActive && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/25 shrink-0 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                          Aktif
                        </span>
                      )}
                    </div>

                    {/* VRAM Fit Badge */}
                    <div className={`p-2 rounded-lg border text-xs flex items-center justify-between ${fit.classes}`}>
                      <span>VRAM Durumu:</span>
                      <strong className="font-semibold">{fit.label}</strong>
                    </div>

                    {/* Specs Table */}
                    <div className="grid grid-cols-2 gap-2 text-xs py-1 text-muted-foreground font-mono">
                      <div>
                        <span>Boyut: </span>
                        <strong className="text-foreground">
                          {model.file_size_mb >= 1024
                            ? `${(model.file_size_mb / 1024).toFixed(2)} GB`
                            : `${model.file_size_mb} MB`}
                        </strong>
                      </div>
                      <div>
                        <span>Bağlam: </span>
                        <strong className="text-foreground">
                          {model.context_length ? `${model.context_length} T` : "4096 T"}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="pt-4 border-t border-border mt-3">
                    <button
                      onClick={() => setSelectedModelForOffload(model)}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-all shadow-subtle"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Yerleşim Planlayıcı & Yükle</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-card-muted/70 border-b border-border text-muted-foreground uppercase text-[10px] font-semibold tracking-wider">
                  <tr>
                    <th className="p-3">Model Adı</th>
                    <th className="p-3">Kuantizasyon</th>
                    <th className="p-3">Boyut</th>
                    <th className="p-3">Bağlam</th>
                    <th className="p-3">VRAM Uyumu</th>
                    <th className="p-3 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredModels.map((model) => {
                    const fit = getVramFit(model.file_size_mb);
                    const isActive = activeStatus?.alive && activeStatus.current_model?.includes(model.name);

                    return (
                      <tr key={model.id} className="hover:bg-muted/40 transition-colors">
                        <td className="p-3 font-semibold text-foreground flex items-center gap-2">
                          <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="truncate max-w-[200px]">{model.name}</span>
                          {isActive && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-primary/20 text-primary font-mono">
                              Aktif
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-muted-foreground">{model.quantization || "Q4_K_M"}</td>
                        <td className="p-3 font-mono text-foreground">
                          {model.file_size_mb >= 1024
                            ? `${(model.file_size_mb / 1024).toFixed(2)} GB`
                            : `${model.file_size_mb} MB`}
                        </td>
                        <td className="p-3 font-mono text-muted-foreground">
                          {model.context_length || 4096}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${fit.classes}`}>
                            {fit.label}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => setSelectedModelForOffload(model)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-colors shadow-subtle"
                          >
                            <Sliders className="w-3 h-3" />
                            <span>Planlayıcı</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Offload Planner Hero Modal */}
        {selectedModelForOffload && (
          <OffloadPlanner
            model={selectedModelForOffload}
            onLoadModel={async (config) => {
              const res = await fetch(`/api/models/${selectedModelForOffload.id}/load`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config),
              });
              if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error?.message_tr || "Model yüklenemedi");
              }
              await fetchModels();
            }}
            onClose={() => setSelectedModelForOffload(null)}
          />
        )}

        {/* Hugging Face Download Dialog */}
        <Dialog open={showHfDialog} onOpenChange={setShowHfDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <DownloadCloud className="w-5 h-5 text-primary" />
                <span>Hugging Face GGUF İndirici</span>
              </DialogTitle>
              <DialogDescription>
                Hugging Face deposunu arayın ve uyumlu GGUF kuantizasyon dosyalarını doğrudan indirin.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Repo ID (Örn: Qwen/Qwen2.5-0.5B-Instruct-GGUF)"
                  value={hfRepoInput}
                  onChange={(e) => setHfRepoInput(e.target.value)}
                  className="flex-1 p-2 rounded-lg bg-card border border-border text-xs text-foreground outline-none focus:border-primary font-mono"
                />
                <button
                  onClick={handleSearchHf}
                  disabled={hfSearching}
                  className="py-2 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {hfSearching ? "Aranıyor..." : "Dosyaları Getir"}
                </button>
              </div>

              {hfModelInfo && (
                <div className="p-3 rounded-xl bg-card-muted/60 border border-border space-y-3 animate-fade-in text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">{hfModelInfo.repo_id}</span>
                    <span className="px-2 py-0.5 rounded bg-muted text-[10px] text-muted-foreground font-mono">
                      Lisans: {hfModelInfo.license || "Açık Kaynak"}
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    <div className="text-[11px] font-semibold text-muted-foreground">Kullanılabilir GGUF Dosyaları:</div>
                    {hfModelInfo.gguf_files?.map((file: any) => (
                      <div
                        key={file.filename}
                        className="flex items-center justify-between p-2 rounded-lg bg-card border border-border/80 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-foreground truncate">{file.filename}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">
                            {(file.size_bytes / (1024 * 1024)).toFixed(1)} MB
                          </p>
                        </div>
                        <button
                          onClick={() => handleDownloadHfFile(file.filename)}
                          className="py-1 px-3 rounded bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-colors shadow-subtle shrink-0 ml-2"
                        >
                          İndir
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {downloadProgress && (
                <div className="p-3 rounded-xl bg-card border border-border space-y-2 text-xs font-mono">
                  <div className="flex justify-between text-muted-foreground">
                    <span>{downloadProgress.filename}</span>
                    <span className="text-primary font-bold">{downloadProgress.percent}%</span>
                  </div>
                  <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-primary h-full transition-all duration-300 rounded-full"
                      style={{ width: `${downloadProgress.percent}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Durum: {downloadProgress.status}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );
};
