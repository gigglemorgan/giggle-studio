import React, { useEffect, useState } from "react";
import {
  GraduationCap,
  Upload,
  Play,
  Square,
  AlertTriangle,
  Sliders,
  TrendingDown,
  Clock,
  Layers,
  Zap,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface DatasetItem {
  id: string;
  name: string;
  format: string;
  row_count: number;
  token_count: number;
  columns: string[];
}

interface PreflightResult {
  status: "SAFE" | "WARNING" | "REFUSED";
  is_safe: boolean;
  projected_vram_mb: number;
  max_safe_vram_mb: number;
  total_gpu_vram_mb: number;
  headroom_mb: number;
  projected_host_ram_mb: number;
  breakdown: {
    base_model_weights_mb: number;
    lora_adapter_weights_mb: number;
    gradients_mb: number;
    optimizer_states_mb: number;
    activations_mb: number;
    cuda_overhead_mb: number;
  };
  suggestions: string[];
}

interface MetricPoint {
  step: number;
  epoch: number;
  loss: number;
  eval_loss: number;
  lr: number;
  vram_mb: number;
  tokens_per_sec: number;
}

export const TrainingPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"dataset" | "config" | "monitor">("config");
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);

  // Hyperparameters
  const [baseModelId, setBaseModelId] = useState("qwen2.5-0.5b-instruct-q4_k_m.gguf");
  const [paramCountB, setParamCountB] = useState(0.5);
  const [loraR, setLoraR] = useState(16);
  const [loraAlpha, setLoraAlpha] = useState(32);
  const [batchSize, setBatchSize] = useState(1);
  const [gradAccum, setGradAccum] = useState(4);
  const [epochs, setEpochs] = useState(3);
  const [learningRate, setLearningRate] = useState(0.0002);
  const [maxSeqLen, setMaxSeqLen] = useState(2048);
  const [gradCheckpointing, setGradCheckpointing] = useState(true);
  const [quantization, setQuantization] = useState("4bit");

  // Preflight state
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);

  // Live Monitor State
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [isTraining, setIsTraining] = useState(false);

  const loadDatasets = async () => {
    try {
      const res = await fetch("/api/training/datasets");
      if (res.ok) {
        const data = await res.json();
        setDatasets(data);
        if (data.length > 0 && !selectedDatasetId) {
          setSelectedDatasetId(data[0].id);
        }
      }
    } catch (err) {
      console.error("Datasets load error", err);
    }
  };

  const calculatePreflight = async () => {
    try {
      const res = await fetch("/api/training/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          param_count_b: paramCountB,
          quantization,
          lora_r: loraR,
          batch_size: batchSize,
          max_seq_len: maxSeqLen,
          gradient_checkpointing: gradCheckpointing,
          optimizer: "paged_adamw_8bit",
        }),
      });
      if (res.ok) {
        setPreflight(await res.json());
      }
    } catch (err) {
      console.error("Preflight error", err);
    }
  };

  useEffect(() => {
    loadDatasets();
    calculatePreflight();
  }, []);

  useEffect(() => {
    calculatePreflight();
  }, [paramCountB, quantization, loraR, batchSize, maxSeqLen, gradCheckpointing]);

  const handleDatasetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(
        `/api/training/datasets/upload?name=${encodeURIComponent(file.name)}&target_max_seq_len=${maxSeqLen}`,
        {
          method: "POST",
          body: formData,
        }
      );
      if (res.ok) {
        loadDatasets();
      }
    } catch (err) {
      console.error("Upload error", err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartTraining = async () => {
    if (!selectedDatasetId && datasets.length === 0) return;
    setIsTraining(true);
    setMetrics([]);
    setActiveTab("monitor");

    try {
      // 1. Create Run
      const createRes = await fetch("/api/training/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `LoRA-${baseModelId.slice(0, 10)}-${Date.now()}`,
          base_model_id: baseModelId,
          dataset_id: selectedDatasetId || datasets[0]?.id || "default",
          config: {
            epochs,
            max_steps: 25,
            learning_rate: learningRate,
            lora_r: loraR,
            batch_size: batchSize,
            grad_accum: gradAccum,
          },
        }),
      });

      if (!createRes.ok) {
        setIsTraining(false);
        return;
      }

      const runData = await createRes.json();
      setActiveRunId(runData.id);

      // 2. Stream Metrics via SSE
      const streamRes = await fetch(`/api/training/runs/${runData.id}/stream`);
      if (!streamRes.body) {
        setIsTraining(false);
        return;
      }

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          if (!block.startsWith("data: ")) continue;
          const payload = JSON.parse(block.replace("data: ", ""));

          if (payload.type === "metric") {
            setMetrics((prev) => [
              ...prev,
              {
                step: payload.step,
                epoch: payload.epoch,
                loss: payload.loss,
                eval_loss: payload.eval_loss,
                lr: payload.lr,
                vram_mb: payload.vram_mb,
                tokens_per_sec: payload.tokens_per_sec,
              },
            ]);
          } else if (payload.type === "run_done" || payload.type === "finished") {
            setIsTraining(false);
          }
        }
      }
    } catch (err) {
      console.error("Training stream error", err);
    } finally {
      setIsTraining(false);
    }
  };

  const handleStopTraining = async () => {
    if (!activeRunId) return;
    try {
      await fetch(`/api/training/runs/${activeRunId}/stop`, { method: "POST" });
      setIsTraining(false);
    } catch (err) {
      console.error("Stop error", err);
    }
  };

  const latestMetric = metrics[metrics.length - 1];

  return (
    <div className="flex flex-col h-full bg-slate-950 p-6 space-y-6 overflow-y-auto font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <GraduationCap className="w-7 h-7 text-indigo-400" />
            Eğitim Stüdyosu (LoRA / QLoRA SFT)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            RTX 5070 (12 GB) İçin Preflight Kuru Çalıştırma, 4-bit NF4, paged_adamw_8bit ve Canlı Metrikler
          </p>
        </div>

        {/* Upload Dataset Trigger */}
        <label className="flex items-center gap-2 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-sm">
          <Upload className="w-4 h-4 text-indigo-400" />
          {isUploading ? "Yükleniyor..." : "Veri Seti Yükle (.jsonl / .csv)"}
          <input
            type="file"
            onChange={handleDatasetUpload}
            disabled={isUploading}
            className="hidden"
          />
        </label>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-6">
        <button
          onClick={() => setActiveTab("config")}
          className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "config"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sliders className="w-4 h-4" />
          İnce Ayar & Preflight Kuru Çalıştırma
        </button>
        <button
          onClick={() => setActiveTab("monitor")}
          className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "monitor"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          Canlı Eğitim Takibi & Kayıplar ({metrics.length})
        </button>
        <button
          onClick={() => setActiveTab("dataset")}
          className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "dataset"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Layers className="w-4 h-4" />
          Veri Setleri ({datasets.length})
        </button>
      </div>

      {/* Tab 1: Config & Preflight */}
      {activeTab === "config" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Hyperparameters Form (Col 7) */}
          <div className="lg:col-span-7 bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-5">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              Eğitim Parametreleri
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Temel Model</label>
                <input
                  type="text"
                  value={baseModelId}
                  onChange={(e) => setBaseModelId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Model Parametre Boyutu ({paramCountB}B)
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="14"
                  step="0.5"
                  value={paramCountB}
                  onChange={(e) => setParamCountB(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  LoRA Rank (r): {loraR}
                </label>
                <select
                  value={loraR}
                  onChange={(e) => setLoraR(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200"
                >
                  <option value={8}>r = 8 (Minimum Bellek)</option>
                  <option value={16}>r = 16 (Dengeli & Standart)</option>
                  <option value={32}>r = 32 (Yüksek Kapasite)</option>
                  <option value={64}>r = 64 (Maksimum İfade)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">LoRA Alpha</label>
                <input
                  type="number"
                  value={loraAlpha}
                  onChange={(e) => setLoraAlpha(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Mikro-Yığın (Batch Size)
                </label>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={batchSize}
                  onChange={(e) => setBatchSize(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Gradient Accumulation
                </label>
                <input
                  type="number"
                  min="1"
                  max="32"
                  value={gradAccum}
                  onChange={(e) => setGradAccum(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Maksimum Dizi Uzunluğu (Max Seq Len)
                </label>
                <select
                  value={maxSeqLen}
                  onChange={(e) => setMaxSeqLen(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200 font-mono"
                >
                  <option value={1024}>1024 token</option>
                  <option value={2048}>2048 token</option>
                  <option value={4096}>4096 token</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Nicelleştirme (Quantization)</label>
                <select
                  value={quantization}
                  onChange={(e) => setQuantization(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200 font-mono"
                >
                  <option value="4bit">4-bit NF4 (QLoRA Önerilen)</option>
                  <option value="8bit">8-bit</option>
                  <option value="16bit">16-bit (Tam FP16)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Epok Sayısı (Epochs)</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={epochs}
                  onChange={(e) => setEpochs(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Öğrenme Hızı (Learning Rate)</label>
                <input
                  type="number"
                  step="0.00005"
                  value={learningRate}
                  onChange={(e) => setLearningRate(parseFloat(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={gradCheckpointing}
                  onChange={(e) => setGradCheckpointing(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                />
                <span>Gradient Checkpointing Etkin (Aktivasyon belleğini %60 düşürür)</span>
              </label>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={handleStartTraining}
                disabled={isTraining || preflight?.status === "REFUSED"}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-semibold shadow-md transition-colors ${
                  isTraining || preflight?.status === "REFUSED"
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950"
                }`}
              >
                <Play className="w-4 h-4 fill-white" />
                {isTraining ? "Eğitim Sürüyor..." : "Eğitimi Başlat (Run Training)"}
              </button>
            </div>
          </div>

          {/* Preflight Dry-Run Card (Col 5) */}
          <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                Preflight Kuru Çalıştırma & Bellek Projeksiyonu
              </h3>
              {preflight && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                    preflight.status === "SAFE"
                      ? "bg-emerald-950/80 border border-emerald-700 text-emerald-300"
                      : preflight.status === "WARNING"
                      ? "bg-amber-950/80 border border-amber-700 text-amber-300"
                      : "bg-red-950/80 border border-red-700 text-red-300"
                  }`}
                >
                  {preflight.status === "SAFE"
                    ? "GÜVENLİ (SAFE)"
                    : preflight.status === "WARNING"
                    ? "UYARI (WARNING)"
                    : "REDDEDİLDİ (REFUSED)"}
                </span>
              )}
            </div>

            {preflight && (
              <div className="space-y-4">
                {/* Visual Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400 font-mono">
                    <span>Öngörülen Tepe VRAM: {preflight.projected_vram_mb} MB</span>
                    <span>Tavan: {preflight.max_safe_vram_mb} MB (12 GB)</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden flex">
                    <div
                      className={`h-full transition-all ${
                        preflight.status === "SAFE"
                          ? "bg-emerald-500"
                          : preflight.status === "WARNING"
                          ? "bg-amber-500"
                          : "bg-red-600"
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          (preflight.projected_vram_mb / preflight.total_gpu_vram_mb) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Detailed Breakdown */}
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 font-mono text-xs space-y-1.5">
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-400">Temel Model Ağırlıkları (4-bit):</span>
                    <span>{preflight.breakdown.base_model_weights_mb} MB</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-400">LoRA Adaptör Ağırlıkları:</span>
                    <span>{preflight.breakdown.lora_adapter_weights_mb} MB</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-400">Gradyanlar (FP16/BF16):</span>
                    <span>{preflight.breakdown.gradients_mb} MB</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-400">Optimizer (paged_adamw_8bit):</span>
                    <span>{preflight.breakdown.optimizer_states_mb} MB</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-400">Aktivasyonlar & Önbellek:</span>
                    <span>{preflight.breakdown.activations_mb} MB</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-400">CUDA Bağlamı & Hesaplama Payı:</span>
                    <span>{preflight.breakdown.cuda_overhead_mb} MB</span>
                  </div>
                </div>

                {/* Suggestions if any */}
                {preflight.suggestions.length > 0 && (
                  <div className="bg-amber-950/20 border border-amber-800/40 rounded-lg p-3 space-y-1 text-xs text-amber-300">
                    <span className="font-semibold block flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> İyileştirme Önerileri:
                    </span>
                    {preflight.suggestions.map((sug, i) => (
                      <p key={i}>• {sug}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Live Monitor */}
      {activeTab === "monitor" && (
        <div className="space-y-6">
          {/* Live Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-indigo-400" /> Adım / Epok
              </span>
              <div className="text-lg font-bold text-slate-100 font-mono">
                {latestMetric ? `${latestMetric.step} (E: ${latestMetric.epoch})` : "—"}
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5 text-emerald-400" /> Eğitim Kaybı (Train Loss)
              </span>
              <div className="text-lg font-bold text-emerald-400 font-mono">
                {latestMetric ? latestMetric.loss.toFixed(4) : "—"}
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5 text-blue-400" /> Değerlendirme (Eval Loss)
              </span>
              <div className="text-lg font-bold text-blue-400 font-mono">
                {latestMetric ? latestMetric.eval_loss.toFixed(4) : "—"}
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" /> Tepe VRAM Kullanımı
              </span>
              <div className="text-lg font-bold text-amber-300 font-mono">
                {latestMetric ? `${latestMetric.vram_mb} MB` : "—"}
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block">Durum</span>
                <span className="text-xs font-mono font-bold text-slate-200">
                  {isTraining ? "Eğitiliyor" : "Boşta / Tamamlandı"}
                </span>
              </div>
              {isTraining && (
                <button
                  onClick={handleStopTraining}
                  className="p-2 bg-red-950/80 border border-red-800 hover:bg-red-900 text-red-300 rounded-lg transition-colors"
                >
                  <Square className="w-4 h-4 fill-red-400" />
                </button>
              )}
            </div>
          </div>

          {/* Loss Curve Chart */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-indigo-400" />
              Kayıp Eğrisi (Loss Convergence Curve)
            </h3>

            <div className="h-80 w-full">
              {metrics.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                  Henüz bir eğitim çalıştırılmadı. &quot;İnce Ayar&quot; sekmesinden eğitimi başlatınız.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="step" stroke="#64748b" />
                    <YAxis stroke="#64748b" domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#020617",
                        borderColor: "#334155",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="loss"
                      name="Train Loss"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="eval_loss"
                      name="Eval Loss"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Datasets */}
      {activeTab === "dataset" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {datasets.map((ds) => (
              <div
                key={ds.id}
                className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-slate-100 truncate">
                    {ds.name}
                  </span>
                  <span className="bg-indigo-950/60 border border-indigo-800 text-indigo-300 font-mono text-[10px] px-2 py-0.5 rounded">
                    {ds.format.toUpperCase()}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-mono space-y-1">
                  <div>Satır Sayısı: {ds.row_count}</div>
                  <div>Tahmini Token: {ds.token_count.toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
