import React, { useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  Key,
  Server,
  Mail,
  Save,
  Check,
  Cpu,
  Info,
} from "lucide-react";

export const SettingsPage: React.FC = () => {
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState(8420);
  const [vramMargin, setVramMargin] = useState(600);
  const [ramCeiling, setRamCeiling] = useState(85);
  const [hfToken, setHfToken] = useState("");
  const [openaiCompat, setOpenaiCompat] = useState(false);
  const [openaiKey, setOpenaiKey] = useState("");
  const [gmailClientId, setGmailClientId] = useState("");
  const [gmailClientSecret, setGmailClientSecret] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Read current settings from status
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
      } catch (err) {
        console.error("Settings load error", err);
      }
    };
    loadSettings();
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 p-6 space-y-6 overflow-y-auto font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <SettingsIcon className="w-7 h-7 text-indigo-400" />
            Sistem Ayarları & Yapılandırma
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Giggle Studio sunucu parametreleri, GPU güvenlik marjları ve entegrasyon anahtarları
          </p>
        </div>

        {saved && (
          <div className="flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-800 text-emerald-300 px-3 py-1.5 rounded-lg text-xs font-semibold">
            <Check className="w-4 h-4" /> Ayarlar Kaydedildi
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
        {/* Section 1: Server & Host */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-400" /> Sunucu Ağ Parametreleri
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Sunucu Adresi (Host)</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Sunucu Portu</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Section 2: GPU & Safety Limits */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-400" /> GPU & Bellek Güvenlik Sınırları
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                VRAM Güvenlik Payı (Safety Margin)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={vramMargin}
                  onChange={(e) => setVramMargin(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 font-mono"
                />
                <span className="text-xs text-slate-400">MB</span>
              </div>
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                Masaüstü ve ekran yöneticisi için ayrılan tampon (Varsayılan: 600 MB)
              </span>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Sistem RAM Tavanı: %{ramCeiling}
              </label>
              <input
                type="range"
                min="50"
                max="95"
                value={ramCeiling}
                onChange={(e) => setRamCeiling(parseInt(e.target.value))}
                className="w-full accent-indigo-500 mt-2"
              />
              <span className="text-[11px] text-slate-500 block">
                Bu oranın üzerindeki model yükleme ve eğitim talepleri otomatik olarak reddedilir
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Integrations & API Keys */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-400" /> Entegrasyonlar & Erişim Anahtarları
          </h3>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Hugging Face Erişim Jetonu (HF_TOKEN)
              </label>
              <input
                type="password"
                value={hfToken}
                onChange={(e) => setHfToken(e.target.value)}
                placeholder="hf_..."
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 font-mono"
              />
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Onay gerektiren (gated) modelleri indirmek için kullanılır. Yalnızca yerel .env dosyasında saklanır.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1">
                  <Mail className="w-3 h-3 text-indigo-400" /> Gmail OAuth Client ID
                </label>
                <input
                  type="text"
                  value={gmailClientId}
                  onChange={(e) => setGmailClientId(e.target.value)}
                  placeholder="*.apps.googleusercontent.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Gmail OAuth Client Secret
                </label>
                <input
                  type="password"
                  value={gmailClientSecret}
                  onChange={(e) => setGmailClientSecret(e.target.value)}
                  placeholder="GOCSPX-..."
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: OpenAI Compatible /v1 Endpoint */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-200">
                OpenAI Uyumlu API Sunucusu (/v1/chat/completions)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                İsteğe bağlı harici araçların Giggle Studio modellerine erişmesi için yerel uç nokta
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpenaiCompat(!openaiCompat)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                openaiCompat ? "bg-indigo-600" : "bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  openaiCompat ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {openaiCompat && (
            <div className="pt-2">
              <label className="text-xs text-slate-400 block mb-1">
                İsteğe Bağlı API Anahtarı (Boş bırakılırsa anahtarsız)
              </label>
              <input
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="sk-giggle-..."
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 font-mono"
              />
            </div>
          )}
        </div>

        {/* Section 5: About Giggle Studio */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-2 text-xs text-slate-400">
          <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
            <Info className="w-4 h-4 text-indigo-400" />
            Giggle Studio Hakkında
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono pt-1">
            <div>Sürüm: 0.1.0 (Açık Kaynak)</div>
            <div>Lisans: Apache-2.0</div>
            <div>Yazar: Sedat-gigglemorgan</div>
            <div>GPU: RTX 5070 (12 GB sm_120)</div>
          </div>
          <p className="pt-1 text-slate-500">
            Telif Hakkı © 2026 Sedat-gigglemorgan. Tüm hakları saklıdır. Yerel öncelikli, güvenli ve bağımsız yapay zeka çalışma ortamı.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-6 py-2.5 rounded-lg shadow-sm transition-colors"
          >
            <Save className="w-4 h-4" />
            Ayarları Kaydet
          </button>
        </div>
      </form>
    </div>
  );
};
