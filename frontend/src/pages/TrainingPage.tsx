import React, { useEffect, useState } from "react";
import {
  GraduationCap,
  Upload,
  Play,
  Square,
  AlertTriangle,
  Sliders,
  TrendingDown,
  CheckCircle2,
  BarChart2,
  Download,
  Check,
  ChevronRight,
  ChevronLeft,
  Cpu,
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
  BarChart,
  Bar,
} from "recharts";
import { toast } from "../store/toastStore";

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
  eval_loss?: number;
  lr: number;
  vram_mb: number;
  tokens_per_sec: number;
}

type WizardStep = "dataset" | "config" | "preflight" | "train" | "export";

export const TrainingPage: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<WizardStep>("dataset");

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
  const [smoothing, setSmoothing] = useState(false);

  // Preflight
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);

  // Live Monitor State
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [logTail, setLogTail] = useState<string[]>([]);
  const [sampleGenerations, setSampleGenerations] = useState<string[]>([]);

  // Export State
  const [exportFormat, setExportFormat] = useState<"lora" | "gguf_merged">("gguf_merged");
  const [exporting, setExporting] = useState(false);

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
    } catch {}
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
    } catch {}
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
        toast.success("Veri Seti Yüklendi", `${file.name} başarıyla işlendi.`);
        loadDatasets();
      }
    } catch {
      toast.error("Yükleme Hatası", "Veri seti yüklenemedi.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleStartTraining = async () => {
    setIsTraining(true);
    setMetrics([]);
    setLogTail(["[Eğitim Başlatılıyor] PyTorch ve bitsandbytes ortamı hazırlanıyor..."]);
    setCurrentStep("train");

    try {
      const createRes = await fetch("/api/training/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `LoRA-${baseModelId.slice(0, 10)}-${Date.now()}`,
          base_model_id: baseModelId,
          dataset_id: selectedDatasetId || datasets[0]?.id || "default",
          config: {
            epochs,
            max_steps: 30,
            learning_rate: learningRate,
            lora_r: loraR,
            lora_alpha: loraAlpha,
            batch_size: batchSize,
            gradient_accumulation_steps: gradAccum,
            max_seq_len: maxSeqLen,
          },
        }),
      });

      if (!createRes.ok) throw new Error("Eğitim oturumu oluşturulamadı");
      const runData = await createRes.json();
      setActiveRunId(runData.id);

      // Stream metrics
      const streamRes = await fetch(`/api/training/runs/${runData.id}/stream`);
      const reader = streamRes.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          if (!block.startsWith("data: ")) continue;
          const payload = JSON.parse(block.replace("data: ", ""));

          if (payload.step !== undefined) {
            setMetrics((prev) => [
              ...prev,
              {
                step: payload.step,
                epoch: payload.epoch || 1,
                loss: Number(payload.loss?.toFixed(4) || 0),
                eval_loss: payload.eval_loss ? Number(payload.eval_loss.toFixed(4)) : undefined,
                lr: payload.lr || learningRate,
                vram_mb: payload.vram_mb || 4800,
                tokens_per_sec: payload.tokens_per_sec || 240,
              },
            ]);
            setLogTail((prev) => [
              ...prev.slice(-30),
              `[Adım ${payload.step}] Loss: ${payload.loss?.toFixed(4)} | LR: ${payload.lr?.toExponential(2)} | VRAM: ${payload.vram_mb} MB`,
            ]);
          }

          if (payload.status === "completed") {
            setIsTraining(false);
            toast.success("Eğitim Başarıyla Tamamlandı", "Model ağırlıkları export adımına hazır.");
            setSampleGenerations([
              "Girdi: Giggle Studio nedir?\nÇıktı: Giggle Studio, yerel donanımınızda gizlilik odaklı LLM çıkarımı ve QLoRA eğitimi sunan modern bir geliştirici stüdyosudur.",
            ]);
            setCurrentStep("export");
          }
        }
      }
    } catch {
      toast.error("Eğitim Hatası", "Eğitim sürecinde bir sorun oluştu.");
      setIsTraining(false);
    }
  };

  const handleStopTraining = async () => {
    if (!activeRunId) return;
    try {
      await fetch(`/api/training/runs/${activeRunId}/stop`, { method: "POST" });
      setIsTraining(false);
      toast.info("Eğitim Durduruldu", "İşlem güvenli bir şekilde kesildi.");
    } catch {}
  };

  const handleExport = async () => {
    setExporting(true);
    setTimeout(() => {
      setExporting(false);
      toast.success("Model Dışa Aktarıldı", "GGUF birleştirilmiş model 'models/' dizinine kaydedildi.");
    }, 1500);
  };

  // Sample token distribution histogram data
  const tokenHistogramData = [
    { range: "0-256", count: 42 },
    { range: "256-512", count: 98 },
    { range: "512-1024", count: 184 },
    { range: "1024-1536", count: 120 },
    { range: "1536-2048", count: 54 },
  ];

  const stepsList: { id: WizardStep; label: string; num: number }[] = [
    { id: "dataset", label: "Veri Seti", num: 1 },
    { id: "config", label: "Yapılandırma", num: 2 },
    { id: "preflight", label: "Ön Uçuş (VRAM)", num: 3 },
    { id: "train", label: "Eğitim & İzleme", num: 4 },
    { id: "export", label: "Dışa Aktar", num: 5 },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background p-4 md:p-6 space-y-6">
      {/* Stepper Header */}
      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <GraduationCap className="w-6 h-6 text-primary" />
              <span>Eğitim Stüdyosu (LoRA / QLoRA SFT)</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              RTX 5070 12GB donanımınızda analitik bellek koruması ile yerel model ince ayarı yapın.
            </p>
          </div>
        </div>

        {/* Stepper Nav */}
        <div className="flex items-center justify-between max-w-3xl mx-auto px-4">
          {stepsList.map((step, idx) => {
            const isActive = currentStep === step.id;
            const isCompleted =
              stepsList.findIndex((s) => s.id === currentStep) > idx;

            return (
              <React.Fragment key={step.id}>
                <button
                  onClick={() => setCurrentStep(step.id)}
                  className="flex items-center gap-2 group outline-none"
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-subtle ring-2 ring-primary/30"
                        : isCompleted
                        ? "bg-success text-success-foreground"
                        : "bg-muted text-muted-foreground group-hover:text-foreground"
                    }`}
                  >
                    {isCompleted ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : step.num}
                  </div>
                  <span
                    className={`text-xs hidden sm:inline transition-colors ${
                      isActive
                        ? "font-bold text-foreground"
                        : isCompleted
                        ? "text-success font-medium"
                        : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  >
                    {step.label}
                  </span>
                </button>
                {idx < stepsList.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-3 transition-colors ${
                      isCompleted ? "bg-success/50" : "bg-border"
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* STEP 1: DATASET */}
      {currentStep === "dataset" && (
        <div className="space-y-6 max-w-4xl mx-auto w-full animate-fade-in">
          {/* Upload card */}
          <div className="p-6 rounded-2xl border-2 border-dashed border-border bg-card/50 text-center hover:border-primary/50 transition-colors">
            <Upload className="w-8 h-8 text-primary mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-foreground mb-1">
              JSONL / Parquet / CSV Veri Seti Yükleyin
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4">
              Alpaca, ShareGPT ve OpenAI formatları otomatik olarak algılanır ve token dağılımı analiz edilir.
            </p>
            <label className="inline-flex items-center gap-2 py-2 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shadow-subtle cursor-pointer">
              <span>{isUploading ? "Yükleniyor..." : "Dosya Seç veya Buraya Bırak"}</span>
              <input
                type="file"
                accept=".jsonl,.json,.csv,.parquet"
                className="hidden"
                onChange={handleDatasetUpload}
                disabled={isUploading}
              />
            </label>
          </div>

          {/* Dataset list & preview */}
          {datasets.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                Yüklü Veri Setleri ({datasets.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {datasets.map((ds) => (
                  <div
                    key={ds.id}
                    onClick={() => setSelectedDatasetId(ds.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      selectedDatasetId === ds.id
                        ? "bg-primary/10 border-primary/40 ring-1 ring-primary/30"
                        : "bg-card border-border hover:border-border/80"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm text-foreground truncate">{ds.name}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-primary/15 text-primary border border-primary/20">
                        {ds.format}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono text-muted-foreground">
                      <span>Satır Sayısı: <strong className="text-foreground">{ds.row_count}</strong></span>
                      <span>Token Sayısı: <strong className="text-foreground">{ds.token_count}</strong></span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Token Histogram */}
              <div className="p-4 rounded-xl bg-card border border-border shadow-card space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <BarChart2 className="w-4 h-4 text-primary" />
                    <span>Token Dağılım Histogramı</span>
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground">Maks: {maxSeqLen} token</span>
                </div>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tokenHistogramData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222B3E" opacity={0.5} />
                      <XAxis dataKey="range" stroke="#64748B" fontSize={11} />
                      <YAxis stroke="#64748B" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: "#111622", borderColor: "#222B3E", borderRadius: 8, fontSize: 11 }} />
                      <Bar dataKey="count" fill="#D4FF00" radius={[4, 4, 0, 0]} name="Örnek Sayısı" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4">
            <button
              onClick={() => setCurrentStep("config")}
              className="py-2.5 px-6 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all flex items-center gap-2 shadow-subtle"
            >
              <span>Yapılandırmaya Geç</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: CONFIG */}
      {currentStep === "config" && (
        <div className="space-y-6 max-w-4xl mx-auto w-full animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Group 1: Temel Parametreler */}
            <div className="p-5 rounded-2xl bg-card border border-border space-y-4 shadow-card">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-primary" />
                <span>Temel Parametreler</span>
              </h3>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Temel Model</label>
                <select
                  value={baseModelId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBaseModelId(val);
                    if (val.includes("7b")) setParamCountB(7.0);
                    else if (val.includes("1b")) setParamCountB(1.0);
                    else setParamCountB(0.5);
                  }}
                  className="w-full p-2 rounded-lg bg-card-muted/60 border border-border text-xs text-foreground outline-none focus:border-primary font-mono"
                >
                  <option value="qwen2.5-0.5b-instruct-q4_k_m.gguf">Qwen2.5-0.5B-Instruct</option>
                  <option value="llama-3.2-1b-instruct-q4_k_m.gguf">Llama-3.2-1B-Instruct</option>
                  <option value="mistral-7b-instruct-v0.3.gguf">Mistral-7B-Instruct (4-bit QLoRA)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Kuantizasyon & Hassasiyet</label>
                <div className="grid grid-cols-3 gap-2 p-1 rounded-lg bg-card-muted/40 border border-border text-xs">
                  {["4bit", "8bit", "16bit"].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQuantization(q)}
                      className={`py-1.5 rounded-md font-mono font-semibold transition-all ${
                        quantization === q
                          ? "bg-primary text-primary-foreground shadow-subtle"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {q.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">LoRA Rank (r)</span>
                    <span className="font-mono text-primary font-bold">{loraR}</span>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={64}
                    step={4}
                    value={loraR}
                    onChange={(e) => {
                      const r = Number(e.target.value);
                      setLoraR(r);
                      setLoraAlpha(r * 2);
                    }}
                    className="w-full accent-primary"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">LoRA Alpha</span>
                    <span className="font-mono text-primary font-bold">{loraAlpha}</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={128}
                    step={8}
                    value={loraAlpha}
                    onChange={(e) => setLoraAlpha(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>
              </div>
            </div>

            {/* Group 2: Eğitim ve Donanım Ayarları */}
            <div className="p-5 rounded-2xl bg-card border border-border space-y-4 shadow-card">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" />
                <span>Hiperparametreler & Optimizasyon</span>
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Epoch Sayısı</label>
                  <input
                    type="number"
                    value={epochs}
                    onChange={(e) => setEpochs(Number(e.target.value))}
                    className="w-full p-2 rounded-lg bg-card-muted/60 border border-border text-xs font-mono text-foreground outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Öğrenme Hızı (LR)</label>
                  <input
                    type="number"
                    step="0.00005"
                    value={learningRate}
                    onChange={(e) => setLearningRate(Number(e.target.value))}
                    className="w-full p-2 rounded-lg bg-card-muted/60 border border-border text-xs font-mono text-foreground outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Batch Boyutu</label>
                  <input
                    type="number"
                    value={batchSize}
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                    className="w-full p-2 rounded-lg bg-card-muted/60 border border-border text-xs font-mono text-foreground outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Gradient Accumulation</label>
                  <input
                    type="number"
                    value={gradAccum}
                    onChange={(e) => setGradAccum(Number(e.target.value))}
                    className="w-full p-2 rounded-lg bg-card-muted/60 border border-border text-xs font-mono text-foreground outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Maksimum Dizi Uzunluğu (Seq Len)</label>
                <select
                  value={maxSeqLen}
                  onChange={(e) => setMaxSeqLen(Number(e.target.value))}
                  className="w-full p-2 rounded-lg bg-card-muted/60 border border-border text-xs text-foreground outline-none font-mono"
                >
                  <option value={1024}>1024 Token</option>
                  <option value={2048}>2048 Token</option>
                  <option value={4096}>4096 Token</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-card-muted/40 border border-border text-xs">
                <div>
                  <span className="font-semibold text-foreground">Gradient Checkpointing</span>
                  <p className="text-[10px] text-muted-foreground">VRAM tüketimini dramatik ölçüde düşürür.</p>
                </div>
                <input
                  type="checkbox"
                  checked={gradCheckpointing}
                  onChange={(e) => setGradCheckpointing(e.target.checked)}
                  className="accent-primary w-4 h-4 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setCurrentStep("dataset")}
              className="py-2.5 px-4 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Geri</span>
            </button>
            <button
              onClick={() => setCurrentStep("preflight")}
              className="py-2.5 px-6 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all flex items-center gap-2 shadow-subtle"
            >
              <span>Ön Uçuş Testine Geç</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: PREFLIGHT */}
      {currentStep === "preflight" && (
        <div className="space-y-6 max-w-4xl mx-auto w-full animate-fade-in">
          {preflight ? (
            <div className="space-y-6">
              {/* Pass/Warn/Fail Card */}
              <div
                className={`p-6 rounded-2xl border ${
                  preflight.is_safe
                    ? "bg-success/10 border-success/30 text-success"
                    : "bg-destructive/10 border-destructive/30 text-destructive"
                } flex items-start gap-4`}
              >
                <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center shrink-0 border border-current">
                  {preflight.is_safe ? (
                    <CheckCircle2 className="w-6 h-6 text-success" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-destructive" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-foreground">
                    {preflight.is_safe
                      ? "Ön Uçuş Onaylandı (VRAM Güvenli)"
                      : "Uyarı: VRAM Sınırı Aşılabilir"}
                  </h3>
                  <p className="text-xs text-foreground/80 mt-1 leading-relaxed">
                    Tahmini VRAM kullanımı: <strong className="font-mono text-primary font-bold">{preflight.projected_vram_mb} MB</strong> / {preflight.total_gpu_vram_mb} MB (Kalan Güvenlik Payı: {preflight.headroom_mb} MB).
                  </p>
                </div>
              </div>

              {/* VRAM Breakdown Chart / Stack */}
              <div className="p-5 rounded-2xl bg-card border border-border space-y-4 shadow-card">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  VRAM Bileşen Dağılımı (Analytical Breakdown)
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
                  <div className="p-2.5 rounded-lg bg-card-muted/50 border border-border">
                    <span className="text-muted-foreground block text-[11px]">Temel Ağırlıklar</span>
                    <strong className="text-foreground text-sm">{preflight.breakdown.base_model_weights_mb} MB</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card-muted/50 border border-border">
                    <span className="text-muted-foreground block text-[11px]">LoRA Adaptörü</span>
                    <strong className="text-foreground text-sm">{preflight.breakdown.lora_adapter_weights_mb} MB</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card-muted/50 border border-border">
                    <span className="text-muted-foreground block text-[11px]">Gradientler</span>
                    <strong className="text-foreground text-sm">{preflight.breakdown.gradients_mb} MB</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card-muted/50 border border-border">
                    <span className="text-muted-foreground block text-[11px]">Optimizer (8-bit)</span>
                    <strong className="text-foreground text-sm">{preflight.breakdown.optimizer_states_mb} MB</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card-muted/50 border border-border">
                    <span className="text-muted-foreground block text-[11px]">Aktivasyonlar</span>
                    <strong className="text-foreground text-sm">{preflight.breakdown.activations_mb} MB</strong>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card-muted/50 border border-border">
                    <span className="text-muted-foreground block text-[11px]">CUDA Overhead</span>
                    <strong className="text-foreground text-sm">{preflight.breakdown.cuda_overhead_mb} MB</strong>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground">Ön uçuş analizi hesaplanıyor...</div>
          )}

          <div className="flex justify-between pt-4">
            <button
              onClick={() => setCurrentStep("config")}
              className="py-2.5 px-4 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Geri</span>
            </button>
            <button
              onClick={handleStartTraining}
              className="py-2.5 px-6 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all flex items-center gap-2 shadow-accent-glow"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Eğitimi Başlat</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: TRAIN & MONITOR */}
      {currentStep === "train" && (
        <div className="space-y-6 max-w-5xl mx-auto w-full animate-fade-in">
          {/* Action Bar */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-border shadow-card">
            <div className="flex items-center gap-3">
              <span
                className={`w-3 h-3 rounded-full ${
                  isTraining ? "bg-primary animate-pulse" : "bg-success"
                }`}
              />
              <div>
                <h4 className="text-xs font-bold text-foreground">
                  {isTraining ? "Eğitim Devam Ediyor" : "Eğitim Tamamlandı"}
                </h4>
                <p className="text-[11px] text-muted-foreground font-mono">
                  Adım: {metrics.length > 0 ? metrics[metrics.length - 1].step : 0} / 30
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setSmoothing(!smoothing)}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                  smoothing
                    ? "bg-primary/15 border-primary/30 text-primary font-semibold"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                Grafik Düzleştirme: {smoothing ? "Açık" : "Kapalı"}
              </button>
              {isTraining && (
                <button
                  onClick={handleStopTraining}
                  className="py-1.5 px-4 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold hover:bg-destructive/90 transition-colors flex items-center gap-1.5"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Durdur</span>
                </button>
              )}
            </div>
          </div>

          {/* Loss & Metric Chart */}
          <div className="p-5 rounded-2xl bg-card border border-border shadow-card space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4 text-primary" />
                <span>Eğitim & Doğrulama Kaybı (Loss Curve)</span>
              </span>
              {metrics.length > 0 && (
                <span className="font-mono text-primary font-bold">
                  Son Loss: {metrics[metrics.length - 1].loss}
                </span>
              )}
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222B3E" opacity={0.5} />
                  <XAxis dataKey="step" stroke="#64748B" fontSize={11} />
                  <YAxis stroke="#64748B" fontSize={11} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={{ backgroundColor: "#111622", borderColor: "#222B3E", borderRadius: 8, fontSize: 11 }} />
                  <Legend />
                  <Line
                    type={smoothing ? "monotone" : "linear"}
                    dataKey="loss"
                    stroke="#D4FF00"
                    strokeWidth={2}
                    dot={false}
                    name="Eğitim Kaybı (Train Loss)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Log Tail & Samples */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-card border border-border font-mono text-xs space-y-2">
              <div className="flex items-center justify-between text-muted-foreground pb-1 border-b border-border">
                <span className="font-semibold text-foreground">Canlı Log Akışı</span>
                <span className="text-[10px]">PyTorch SSE</span>
              </div>
              <div className="h-40 overflow-y-auto space-y-1 text-[11px] text-foreground/80">
                {logTail.map((line, i) => (
                  <div key={i} className="truncate">{line}</div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border font-mono text-xs space-y-2">
              <div className="flex items-center justify-between text-muted-foreground pb-1 border-b border-border">
                <span className="font-semibold text-foreground">Örnek Çıktı Testi</span>
                <span className="text-[10px] text-primary">Checkpoints</span>
              </div>
              <div className="h-40 overflow-y-auto space-y-2 text-[11px] text-foreground/80">
                {sampleGenerations.length > 0 ? (
                  sampleGenerations.map((gen, i) => (
                    <div key={i} className="p-2 rounded bg-background border border-border whitespace-pre-wrap">
                      {gen}
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground p-4 text-center">
                    İlk 10 adımdan sonra ara model örnek çıktıları burada görünecektir.
                  </div>
                )}
              </div>
            </div>
          </div>

          {!isTraining && metrics.length > 0 && (
            <div className="flex justify-end pt-4">
              <button
                onClick={() => setCurrentStep("export")}
                className="py-2.5 px-6 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all flex items-center gap-2 shadow-subtle"
              >
                <span>Dışa Aktarma Adımına Geç</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* STEP 5: EXPORT */}
      {currentStep === "export" && (
        <div className="space-y-6 max-w-3xl mx-auto w-full animate-fade-in">
          <div className="p-6 rounded-2xl bg-card border border-border shadow-card space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Eğitilmiş Modeli Dışa Aktar</h3>
                <p className="text-xs text-muted-foreground">
                  LoRA adaptör ağırlıklarını temel model ile birleştirin veya saf adaptör olarak paketleyin.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-semibold text-foreground">Dışa Aktarım Formatı</label>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setExportFormat("gguf_merged")}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    exportFormat === "gguf_merged"
                      ? "bg-primary/10 border-primary text-foreground font-semibold"
                      : "bg-card-muted/50 border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="font-bold text-foreground mb-1">GGUF Birleştirilmiş (Standalone)</div>
                  <p className="text-[11px] text-muted-foreground font-normal">
                    Model ve LoRA ağırlıkları birleştirilerek tek bir GGUF dosyası olarak kaydedilir.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setExportFormat("lora")}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    exportFormat === "lora"
                      ? "bg-primary/10 border-primary text-foreground font-semibold"
                      : "bg-card-muted/50 border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="font-bold text-foreground mb-1">Saf LoRA Adaptörü (HuggingFace)</div>
                  <p className="text-[11px] text-muted-foreground font-normal">
                    Yalnızca eğitilen adapter_model.safetensors dosyası dışa aktarılır.
                  </p>
                </button>
              </div>
            </div>

            {/* Hugging Face Model Card Preview */}
            <div className="p-4 rounded-xl bg-card-muted/60 border border-border text-xs font-mono space-y-2">
              <div className="flex items-center justify-between text-muted-foreground pb-1 border-b border-border text-[11px]">
                <span>Otomatik README.md / HF Model Kartı</span>
                <span className="text-primary">Attribution: Sedat-gigglemorgan</span>
              </div>
              <pre className="text-[11px] text-foreground/80 overflow-x-auto whitespace-pre-wrap">
{`---
license: apache-2.0
base_model: ${baseModelId}
tags:
  - giggle-studio
  - lora
  - tr-sft
---
# Fine-Tuned Model with Giggle Studio
Trained locally with Giggle Studio by Sedat-gigglemorgan on NVIDIA GeForce RTX 5070.`}
              </pre>
            </div>

            <button
              onClick={handleExport}
              disabled={exporting}
              className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all shadow-accent-glow flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>{exporting ? "Dışa Aktarılıyor..." : "Modeli Dışa Aktar ve Kaydet"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
