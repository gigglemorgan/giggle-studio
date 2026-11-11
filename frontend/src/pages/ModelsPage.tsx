import React, { useEffect, useState } from "react";
import {
  Layers,
  DownloadCloud,
  RefreshCw,
  Sliders,
  Power,
  Search,
  Lock,
} from "lucide-react";
import { OffloadPlanner } from "../features/OffloadPlanner";

export const ModelsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"local" | "hf">("local");
  const [localModels, setLocalModels] = useState<any[]>([]);
  const [activeStatus, setActiveStatus] = useState<any>(null);
  const [, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedModelForOffload, setSelectedModelForOffload] = useState<any | null>(null);

  // Hugging Face downloader states
  const [hfRepoInput, setHfRepoInput] = useState("");
  const [hfModelInfo, setHfModelInfo] = useState<any>(null);
  const [hfSearching, setHfSearching] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<any>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const fetchModelsAndStatus = async () => {
    try {
      setLoading(true);
      const [modelsRes, activeRes] = await Promise.all([
        fetch("/api/models"),
        fetch("/api/models/active"),
      ]);
      const modelsData = await modelsRes.json();
      const activeData = await activeRes.json();
      setLocalModels(modelsData);
      setActiveStatus(activeData);
    } catch (err: any) {
      console.error("Modeller yüklenirken hata:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModelsAndStatus();
    const interval = setInterval(async () => {
      try {
        const activeRes = await fetch("/api/models/active");
        const activeData = await activeRes.json();
        setActiveStatus(activeData);
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleScan = async () => {
    try {
      setScanning(true);
      const res = await fetch("/api/models/scan", { method: "POST" });
      const scanned = await res.json();
      setStatusMsg(`${scanned.length} model dizinde doğrulandı ve veritabanı ile eşitlendi.`);
      fetchModelsAndStatus();
    } catch (err: any) {
      setStatusMsg("Tarama hatası: " + err.message);
    } finally {
      setScanning(false);
    }
  };

  const handleUnload = async () => {
    try {
      await fetch("/api/models/unload", { method: "POST" });
      setStatusMsg("Model başarıyla bellekten kaldırıldı ve VRAM sıfırlandı.");
      fetchModelsAndStatus();
    } catch (err: any) {
      setStatusMsg("Kapatma hatası: " + err.message);
    }
  };

  const handleLoadModel = async (config: any) => {
    if (!selectedModelForOffload) return;
    const res = await fetch(`/api/models/${selectedModelForOffload.id}/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message_tr || "Model yüklenemedi");
    }
    setStatusMsg(`${selectedModelForOffload.name} başarıyla yüklendi!`);
    fetchModelsAndStatus();
  };

  const handleSearchHf = async () => {
    if (!hfRepoInput.trim()) return;
    try {
      setHfSearching(true);
      setHfModelInfo(null);
      setStatusMsg(null);
      const res = await fetch(`/api/models/hf/info?repo_id=${encodeURIComponent(hfRepoInput.trim())}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message_tr || "Hugging Face deposu bulunamadı.");
      }
      const data = await res.json();
      setHfModelInfo(data);
    } catch (err: any) {
      setStatusMsg(err.message);
    } finally {
      setHfSearching(false);
    }
  };

  const handleStartDownload = async (filename: string) => {
    try {
      setDownloadProgress({ filename, percent: 0, status: "başlatılıyor" });
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
            const jsonStr = line.replace("data: ", "");
            try {
              const data = JSON.parse(jsonStr);
              setDownloadProgress(data);
              if (data.status === "completed") {
                setStatusMsg(`${filename} başarıyla indirildi ve yerel depoya eklendi!`);
                fetchModelsAndStatus();
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setStatusMsg("İndirme hatası: " + err.message);
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-3">
            <Layers className="w-6 h-6 text-blue-500" />
            <span>Model Yöneticisi & Yerleşim (Offload)</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Yerel GGUF ve Transformers modellerinizi yönetin, Hugging Face'ten indirin ve VRAM yerleşimini planlayın.
          </p>
        </div>

        {/* Tab toggles */}
        <div className="flex gap-2 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("local")}
            className={`px-4 py-2 rounded-lg transition ${
              activeTab === "local" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Yerel Modeller ({localModels.length})
          </button>
          <button
            onClick={() => setActiveTab("hf")}
            className={`px-4 py-2 rounded-lg transition ${
              activeTab === "hf" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Hugging Face İndirici
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs flex items-center justify-between">
          <span>{statusMsg}</span>
          <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Active Model Indicator Banner */}
      {activeStatus?.alive && activeStatus?.current_model && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/60 to-slate-900 border border-emerald-800/60 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-ping"></div>
            <div>
              <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Aktif Model Çalışıyor</span>
              <p className="font-semibold text-slate-100 text-sm mt-0.5">{activeStatus.current_model}</p>
              <p className="text-xs text-slate-400 font-mono">
                GPU Katmanları: {activeStatus.config?.n_gpu_layers || 0} | Bağlam: {activeStatus.config?.n_ctx || 4096} | PID: {activeStatus.pid}
              </p>
            </div>
          </div>
          <button
            onClick={handleUnload}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-red-600/80 hover:bg-red-500 text-white text-xs font-semibold transition"
          >
            <Power className="w-4 h-4" />
            <span>Modeli Kapat (Unload)</span>
          </button>
        </div>
      )}

      {/* Local Models Tab */}
      {activeTab === "local" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">DATA_DIR/models altındaki taranmış modeller</span>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? "animate-spin" : ""}`} />
              <span>{scanning ? "Taranıyor..." : "Dizini Tara"}</span>
            </button>
          </div>

          {localModels.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3">
              <Layers className="w-10 h-10 text-slate-500 mx-auto" />
              <h3 className="text-slate-300 font-semibold text-sm">Kayıtlı Model Bulunamadı</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Lütfen 'DATA_DIR/models' dizinine bir .gguf dosyası koyun veya Hugging Face sekmesinden indirin.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {localModels.map((m) => (
                <div
                  key={m.id}
                  className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-700 transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-slate-100 text-sm">{m.name}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {m.quantization}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        {m.architecture}
                      </span>
                      {m.license && (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
                          {m.license}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-mono truncate max-w-2xl">{m.path}</p>
                    <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-1">
                      <span>Parametreler: <strong className="text-slate-300">{m.parameters_count}</strong></span>
                      <span>Bağlam: <strong className="text-slate-300">{m.context_length}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setSelectedModelForOffload(m)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Yerleşim Ayarla & Yükle</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Hugging Face Tab */}
      {activeTab === "hf" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200">Hugging Face Deposunda GGUF Ara</h3>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Örn: Qwen/Qwen2.5-Coder-7B-Instruct-GGUF veya bartowski/Llama-3.2-3B-Instruct-GGUF"
                value={hfRepoInput}
                onChange={(e) => setHfRepoInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchHf()}
                className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
              />
              <button
                onClick={handleSearchHf}
                disabled={hfSearching}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition disabled:opacity-50"
              >
                <Search className="w-4 h-4" />
                <span>{hfSearching ? "Aranıyor..." : "Modeli Getir"}</span>
              </button>
            </div>
          </div>

          {/* Download progress card */}
          {downloadProgress && (
            <div className="p-5 rounded-xl bg-slate-900 border border-blue-500/30 space-y-3">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-200">{downloadProgress.filename}</span>
                <span className="text-blue-400 font-mono">
                  %{downloadProgress.percent} {downloadProgress.speed_mb_s ? `(${downloadProgress.speed_mb_s} MB/s)` : ""}
                </span>
              </div>
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${downloadProgress.percent}%` }}
                />
              </div>
              {downloadProgress.eta_seconds !== undefined && downloadProgress.eta_seconds !== null && (
                <p className="text-[11px] text-slate-400">Tahmini Kalan Süre: {downloadProgress.eta_seconds} saniye</p>
              )}
            </div>
          )}

          {/* Search results */}
          {hfModelInfo && (
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h4 className="font-bold text-slate-100 text-base">{hfModelInfo.repo_id}</h4>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                    <span>Lisans: <strong className="text-slate-300">{hfModelInfo.license}</strong></span>
                    <span>İndirme: <strong className="text-slate-300">{hfModelInfo.downloads}</strong></span>
                    {hfModelInfo.gated && (
                      <span className="flex items-center gap-1 text-amber-400 font-semibold">
                        <Lock className="w-3 h-3" /> Gated Model (HF_TOKEN Gerekir)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-300">Mevcut GGUF Kuantizasyon Dosyaları:</span>
                <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
                  {hfModelInfo.gguf_files.map((f: any, idx: number) => (
                    <div key={idx} className="p-3.5 flex items-center justify-between text-xs hover:bg-slate-900/50">
                      <span className="font-mono text-slate-300">{f.filename}</span>
                      <button
                        onClick={() => handleStartDownload(f.filename)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition"
                      >
                        <DownloadCloud className="w-3.5 h-3.5" />
                        <span>İndir</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Offload Planner Modal */}
      {selectedModelForOffload && (
        <OffloadPlanner
          model={selectedModelForOffload}
          onLoadModel={handleLoadModel}
          onClose={() => setSelectedModelForOffload(null)}
        />
      )}
    </div>
  );
};
