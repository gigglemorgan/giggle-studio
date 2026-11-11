import React, { useState } from "react";
import {
  Binary,
  Upload,
  Shield,
  FileCode,
  Terminal,
  Activity,
  Layers,
  Sparkles,
  Copy,
  Check,
  Search,
  Hash,
  Database,
  ArrowRight,
} from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<
    "overview" | "disasm" | "hex" | "callgraph" | "yara"
  >("overview");
  const [sample, setSample] = useState<SampleMeta | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFunction, setSelectedFunction] = useState<FunctionItem | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [yaraRule, setYaraRule] = useState<string>("");
  const [hexData, setHexData] = useState<{ offset: number; hex: string; ascii: string } | null>(null);
  const [hexOffset, setHexOffset] = useState(0);
  const [funcSearch, setFuncSearch] = useState("");
  const [copied, setCopied] = useState(false);

  // Default project ID
  const projectId = "default-re-proj";

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`/api/re/samples/upload?project_id=${projectId}`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setSample(data);
        if (data.analysis?.functions?.length > 0) {
          setSelectedFunction(data.analysis.functions[0]);
        }
        loadHex(data.id, 0);
      }
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setIsUploading(false);
    }
  };

  const loadHex = async (sampleId: string, offset: number) => {
    try {
      const res = await fetch(`/api/re/samples/${sampleId}/hex?offset=${offset}&length=256`);
      if (res.ok) {
        setHexData(await res.json());
      }
    } catch (err) {
      console.error("Hex load error:", err);
    }
  };

  const handleAnalyzeFunction = async () => {
    if (!selectedFunction || !sample) return;
    setIsAnalyzing(true);
    setAiAnalysis(null);

    // Find function id from sample if available
    try {
      // Find function item in functions list
      const fnsRes = await fetch(`/api/re/samples/${sample.id}/functions`);
      if (fnsRes.ok) {
        const fns = await fnsRes.json();
        const matched = fns.find((f: { name: string }) => f.name === selectedFunction.name);
        if (matched) {
          const aRes = await fetch(`/api/re/functions/${matched.id}/analyze`, {
            method: "POST",
          });
          if (aRes.ok) {
            setAiAnalysis(await aRes.json());
          }
        }
      }
    } catch (err) {
      console.error("Analysis error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateYara = async () => {
    if (!sample) return;
    try {
      const res = await fetch(`/api/re/samples/${sample.id}/yara`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setYaraRule(data.rule);
      }
    } catch (err) {
      console.error("Yara generation error:", err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 p-6 space-y-6 overflow-y-auto font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Binary className="w-7 h-7 text-indigo-400" />
            Tersine Mühendislik Tezgahı (Defensive RE Workbench)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            0400 Yalıtımlı Karantina, Capstone Ayrıştırıcı, Çağrı Çizgesi ve Kanıt Alıntılı Yapay Zeka
          </p>
        </div>

        {/* Upload Trigger */}
        <label className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-sm">
          <Upload className="w-4 h-4" />
          {isUploading ? "Analiz Ediliyor..." : "Numune İkili Yükle (ELF / PE)"}
          <input
            type="file"
            onChange={handleFileUpload}
            disabled={isUploading}
            className="hidden"
          />
        </label>
      </div>

      {/* Quarantine Safety Banner */}
      <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-3.5 flex items-center gap-3 text-xs text-emerald-300">
        <Shield className="w-5 h-5 text-emerald-400 shrink-0" />
        <div>
          <strong>Savunma ve Yalıtım Güvencesi:</strong> Yüklenen tüm ikili numuneler doğrudan{" "}
          <code className="bg-emerald-950 px-1 py-0.5 rounded font-mono text-emerald-200">
            data/quarantine/
          </code>{" "}
          altında SHA256 adıyla saklanır ve dosya izinleri katı olarak{" "}
          <code className="bg-emerald-950 px-1 py-0.5 rounded font-mono text-emerald-200">
            0400 (Salt Okunur)
          </code>{" "}
          yapılır. İkili dosyalar host üzerinde asla çalıştırılmaz.
        </div>
      </div>

      {/* No Sample Uploaded Placeholder */}
      {!sample && (
        <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-16 text-center space-y-4">
          <FileCode className="w-12 h-12 text-slate-600 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-slate-300">
              Henüz Analiz Edilecek Bir İkili Numune Yüklenmedi
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Linux ELF (x86_64, ARM) veya Windows PE (.exe / .dll) dosyanızı yukarıdaki butonu kullanarak yükleyiniz.
            </p>
          </div>
        </div>
      )}

      {/* Sample Workbench Active */}
      {sample && (
        <div className="space-y-6">
          {/* Tabs */}
          <div className="flex border-b border-slate-800 space-x-6">
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === "overview"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Activity className="w-4 h-4" />
              Genel Bakış & Bölümler
            </button>
            <button
              onClick={() => setActiveTab("disasm")}
              className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === "disasm"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Terminal className="w-4 h-4" />
              Ayrıştırıcı & Yapay Zeka ({sample.analysis?.functions?.length || 0})
            </button>
            <button
              onClick={() => {
                setActiveTab("hex");
                loadHex(sample.id, hexOffset);
              }}
              className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === "hex"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Layers className="w-4 h-4" />
              Hex Görüntüleyici
            </button>
            <button
              onClick={() => {
                setActiveTab("yara");
                handleGenerateYara();
              }}
              className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === "yara"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileCode className="w-4 h-4" />
              YARA Kuralı Üretici
            </button>
          </div>

          {/* Tab 1: Overview */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Hashes & File Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-indigo-400" /> Format & Mimari
                  </span>
                  <div className="text-base font-bold text-slate-100 font-mono">
                    {sample.analysis?.format} ({sample.analysis?.architecture})
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {sample.analysis?.bits}-bit • {sample.analysis?.endianness} endian
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-emerald-400" /> Dosya Boyutu
                  </span>
                  <div className="text-base font-bold text-slate-100 font-mono">
                    {(sample.file_size / 1024).toFixed(1)} KB
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {sample.file_size} bayt
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5 text-amber-400" /> Giriş Noktası (Entry Point)
                  </span>
                  <div className="text-base font-bold text-amber-300 font-mono">
                    {sample.analysis?.entry_point}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {sample.analysis?.functions?.length || 0} tespit edilen fonksiyon
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-blue-400" /> Karantina Durumu
                  </span>
                  <div className="text-base font-bold text-emerald-400 font-mono">
                    0400 Salt Okunur
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono truncate">
                    {sample.sha256.slice(0, 16)}...
                  </div>
                </div>
              </div>

              {/* Sections & Shannon Entropy */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  Bölümler ve Shannon Entropi Dağılımı (Section Entropy)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-3">Bölüm Adı</th>
                        <th className="p-3">Sanal Adres</th>
                        <th className="p-3">Boyut</th>
                        <th className="p-3">İzinler</th>
                        <th className="p-3">Entropi (0.0 - 8.0)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {sample.analysis?.sections?.map((sec, idx) => {
                        const isHighEntropy = sec.entropy > 7.0;
                        return (
                          <tr key={idx} className="hover:bg-slate-900/60">
                            <td className="p-3 font-bold text-slate-100">{sec.name}</td>
                            <td className="p-3 text-slate-400">{sec.virtual_address}</td>
                            <td className="p-3">{sec.size} B</td>
                            <td className="p-3">
                              {sec.is_executable && (
                                <span className="bg-red-950 text-red-300 px-1.5 py-0.5 rounded text-[10px] mr-1">
                                  EXEC
                                </span>
                              )}
                              {sec.is_writable && (
                                <span className="bg-amber-950 text-amber-300 px-1.5 py-0.5 rounded text-[10px]">
                                  WRITE
                                </span>
                              )}
                              {!sec.is_executable && !sec.is_writable && (
                                <span className="text-slate-500">READ</span>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-3">
                                <span
                                  className={`w-12 font-bold ${
                                    isHighEntropy ? "text-amber-400" : "text-emerald-400"
                                  }`}
                                >
                                  {sec.entropy.toFixed(2)}
                                </span>
                                <div className="w-32 bg-slate-950 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`h-full ${
                                      isHighEntropy ? "bg-amber-500" : "bg-emerald-500"
                                    }`}
                                    style={{ width: `${(sec.entropy / 8.0) * 100}%` }}
                                  />
                                </div>
                                {isHighEntropy && (
                                  <span className="text-[10px] text-amber-400">
                                    Paketlenmiş / Şifreli
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Disassembly & AI Assistant */}
          {activeTab === "disasm" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[700px]">
              {/* Functions Sidebar (Col 3) */}
              <div className="lg:col-span-3 bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-col space-y-3 overflow-hidden">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    value={funcSearch}
                    onChange={(e) => setFuncSearch(e.target.value)}
                    placeholder="Fonksiyonlarda ara..."
                    className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-2 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
                  />
                </div>

                <div className="flex-1 overflow-y-auto space-y-1">
                  {sample.analysis?.functions
                    ?.filter((f) => f.name.toLowerCase().includes(funcSearch.toLowerCase()))
                    .map((f, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setSelectedFunction(f);
                          setAiAnalysis(null);
                        }}
                        className={`w-full text-left px-3 py-2 rounded text-xs font-mono transition-colors flex items-center justify-between ${
                          selectedFunction?.name === f.name
                            ? "bg-indigo-600 text-white"
                            : "text-slate-300 hover:bg-slate-800/80"
                        }`}
                      >
                        <span className="truncate">{f.name}</span>
                        <span className="text-[10px] opacity-75">{f.address}</span>
                      </button>
                    ))}
                </div>
              </div>

              {/* Disassembly View (Col 5) */}
              <div className="lg:col-span-5 bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col space-y-3 overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-200 font-mono">
                      {selectedFunction?.name}
                    </h3>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {selectedFunction?.address} • {selectedFunction?.size} bayt
                    </span>
                  </div>
                  <button
                    onClick={handleAnalyzeFunction}
                    disabled={isAnalyzing}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold shadow-sm transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {isAnalyzing ? "Analiz Ediliyor..." : "Yapay Zeka ile Analiz Et"}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto font-mono text-xs space-y-1 bg-slate-950 p-3 rounded-lg border border-slate-800">
                  {selectedFunction?.assembly?.map((insn, idx) => (
                    <div key={idx} className="flex hover:bg-slate-900/80 px-1 py-0.5 rounded">
                      <span className="text-slate-500 w-24 shrink-0">{insn.address}</span>
                      <span className="text-slate-400 w-28 shrink-0">{insn.bytes_hex}</span>
                      <span className="text-indigo-400 font-bold w-16 shrink-0">
                        {insn.mnemonic}
                      </span>
                      <span className="text-slate-200">{insn.op_str}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Analysis & Citations Panel (Col 4) */}
              <div className="lg:col-span-4 bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col space-y-4 overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    Yapay Zeka Analiz Paneli
                  </h3>
                  {aiAnalysis?.confidence && (
                    <span className="bg-emerald-950/70 border border-emerald-800 text-emerald-300 px-2 py-0.5 rounded text-[10px] font-mono">
                      %{Math.round(aiAnalysis.confidence * 100)} Güven
                    </span>
                  )}
                </div>

                {!aiAnalysis && !isAnalyzing && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500 text-xs space-y-2">
                    <Sparkles className="w-8 h-8 text-slate-700" />
                    <p>
                      Seçili fonksiyonun davranışını özetlemek, güvenlik açığı taramak veya alıntı kanıtlarını görmek için &quot;Yapay Zeka ile Analiz Et&quot; butonuna basınız.
                    </p>
                  </div>
                )}

                {isAnalyzing && (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-indigo-400 text-xs space-y-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-500 border-t-transparent" />
                    <span>Yapay zeka komutları ve çağrı çizgesini inceliyor...</span>
                  </div>
                )}

                {aiAnalysis && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        Fonksiyon Davranış Özeti
                      </span>
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                        {aiAnalysis.summary}
                      </div>
                    </div>

                    {aiAnalysis.citations?.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                          Kanıt Adres Alıntıları (Evidence Citations)
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {aiAnalysis.citations.map((cite, i) => (
                            <span
                              key={i}
                              className="bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 font-mono text-[11px] px-2 py-0.5 rounded"
                            >
                              {cite}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: Hex Viewer */}
          {activeTab === "hex" && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4 font-mono">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">
                  Ofset: 0x{hexOffset.toString(16).padStart(8, "0")} (256 bayt blok)
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const next = Math.max(0, hexOffset - 256);
                      setHexOffset(next);
                      loadHex(sample.id, next);
                    }}
                    disabled={hexOffset === 0}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs disabled:opacity-50"
                  >
                    ◀ Önceki Blok
                  </button>
                  <button
                    onClick={() => {
                      const next = hexOffset + 256;
                      setHexOffset(next);
                      loadHex(sample.id, next);
                    }}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs"
                  >
                    Sonraki Blok ▶
                  </button>
                </div>
              </div>

              {hexData && (
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs text-slate-300 leading-relaxed overflow-x-auto">
                  {Array.from({ length: 16 }).map((_, rowIdx) => {
                    const rowOffset = hexOffset + rowIdx * 16;
                    const hexPart = hexData.hex.slice(rowIdx * 32, (rowIdx + 1) * 32);
                    const asciiPart = hexData.ascii.slice(rowIdx * 16, (rowIdx + 1) * 16);
                    if (!hexPart) return null;

                    const formattedHex = hexPart.match(/.{1,2}/g)?.join(" ") || "";

                    return (
                      <div key={rowIdx} className="flex hover:bg-slate-900/80 px-2 py-0.5 rounded">
                        <span className="text-indigo-400 w-28 shrink-0">
                          {rowOffset.toString(16).padStart(8, "0")}
                        </span>
                        <span className="text-slate-200 w-96 shrink-0">{formattedHex}</span>
                        <span className="text-slate-400 font-sans border-l border-slate-800 pl-3">
                          {asciiPart}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab 4: YARA Generator */}
          {activeTab === "yara" && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">
                    Otomatik Üretilen Savunma YARA Kuralı (Defensive IOC)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    İkili numunenin sihirli başlıkları ve benzersiz dizgilerinden derlenmiştir.
                  </p>
                </div>
                <button
                  onClick={() => copyToClipboard(yaraRule)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  Kopyala
                </button>
              </div>

              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 font-mono text-xs text-emerald-400 overflow-x-auto">
                <pre>{yaraRule || "YARA kuralı oluşturuluyor..."}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
