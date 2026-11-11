import React, { useEffect, useState } from "react";
import {
  Mail,
  Search,
  Send,
  FileEdit,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  ExternalLink,
  Clock,
  User,
} from "lucide-react";

interface GmailStatus {
  connected: boolean;
  email: string | null;
  client_id_configured: boolean;
}

interface MessageItem {
  id: string;
  thread_id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
}

interface AuditItem {
  id: string;
  action: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
  approved: boolean;
  created_at: string | null;
}

export const GmailPage: React.FC = () => {
  const [status, setStatus] = useState<GmailStatus>({
    connected: false,
    email: null,
    client_id_configured: false,
  });
  const [activeTab, setActiveTab] = useState<"inbox" | "compose" | "audit">("inbox");
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Compose State
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeStatus, setComposeStatus] = useState<string | null>(null);

  // Auth exchange manual code
  const [authCode, setAuthCode] = useState("");

  const loadStatus = async () => {
    try {
      const res = await fetch("/api/gmail/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.connected) {
          loadMessages();
        }
      }
    } catch (err) {
      console.error("Status load error", err);
    }
  };

  const loadMessages = async (query = "") => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/gmail/messages?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        setMessages(await res.json());
      }
    } catch (err) {
      console.error("Messages load error", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const res = await fetch("/api/gmail/audit");
      if (res.ok) {
        setAuditLogs(await res.json());
      }
    } catch (err) {
      console.error("Audit load error", err);
    }
  };

  useEffect(() => {
    loadStatus();
    loadAuditLogs();
  }, []);

  const handleStartOAuth = async () => {
    try {
      const res = await fetch("/api/gmail/auth/start", { method: "POST" });
      if (res.ok) {
        const { auth_url } = await res.json();
        window.open(auth_url, "_blank");
      }
    } catch (err) {
      console.error("OAuth start error", err);
    }
  };

  const handleExchangeCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authCode.trim()) return;
    try {
      const res = await fetch("/api/gmail/auth/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: authCode.trim() }),
      });
      if (res.ok) {
        setAuthCode("");
        loadStatus();
      }
    } catch (err) {
      console.error("Exchange error", err);
    }
  };

  const handleDisconnect = async () => {
    try {
      await fetch("/api/gmail/disconnect", { method: "POST" });
      setStatus({ connected: false, email: null, client_id_configured: status.client_id_configured });
      setMessages([]);
    } catch (err) {
      console.error("Disconnect error", err);
    }
  };

  const handleSendOrDraft = async (isDraft: boolean) => {
    if (!composeTo.trim() || !composeSubject.trim()) return;
    setComposeStatus("İşlem yürütülüyor...");
    try {
      const endpoint = isDraft ? "/api/gmail/drafts" : "/api/gmail/send";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: composeTo,
          subject: composeSubject,
          body: composeBody,
        }),
      });
      if (res.ok) {
        setComposeStatus(isDraft ? "Taslak başarıyla kaydedildi!" : "E-posta başarıyla gönderildi!");
        setComposeTo("");
        setComposeSubject("");
        setComposeBody("");
        loadAuditLogs();
        setTimeout(() => setComposeStatus(null), 3000);
      } else {
        const err = await res.json();
        setComposeStatus(`Hata: ${err.detail || "Bilinmeyen hata"}`);
      }
    } catch (err) {
      setComposeStatus("Ağ hatası meydana geldi.");
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Mail className="w-7 h-7 text-indigo-400" />
            Gmail Entegrasyonu & Güvenli E-Posta
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Yerel OAuth 2.0 PKCE, şifreli anahtarlık saklama ve onay zorunlu denetim günlüğü
          </p>
        </div>

        {/* Connection status badge */}
        <div className="flex items-center gap-3">
          {status.connected ? (
            <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-800/60 px-3 py-1.5 rounded-lg text-xs font-mono text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{status.email}</span>
              <button
                onClick={handleDisconnect}
                title="Bağlantıyı Kes"
                className="ml-2 text-slate-400 hover:text-red-400 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-xs text-amber-400">
              <AlertCircle className="w-3.5 h-3.5" />
              Bağlantı Yok
            </div>
          )}
        </div>
      </div>

      {/* Disconnected State / Setup Wizard */}
      {!status.connected && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-6 h-6 text-indigo-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-200">
                Gmail Hesabınızı Güvenle Bağlayın
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
                Giggle Studio, e-postalarınızı hiçbir üçüncü taraf sunucuya aktarmaz. Tüm jetonlar yerel cihazınızda Fernet simetrik anahtarıyla şifrelenir. Google Cloud Console&apos;da oluşturduğunuz masaüstü OAuth istemcisi ile bağlanın.
              </p>
            </div>
          </div>

          <div className="pt-2 flex flex-col md:flex-row gap-4">
            <button
              onClick={handleStartOAuth}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-5 py-2.5 rounded-lg transition-colors shadow-sm"
            >
              <ExternalLink className="w-4 h-4" />
              Google ile Giriş Yap (OAuth 2.0 PKCE)
            </button>
          </div>

          <form onSubmit={handleExchangeCode} className="pt-2 flex gap-3 max-w-md">
            <input
              type="text"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              placeholder="Yönlendirme yetkilendirme kodunu yapıştırın..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
            />
            <button
              type="submit"
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium"
            >
              Kodu Doğrula
            </button>
          </form>
        </div>
      )}

      {/* Connected State Tabs */}
      {status.connected && (
        <>
          <div className="flex border-b border-slate-800 space-x-6">
            <button
              onClick={() => setActiveTab("inbox")}
              className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === "inbox"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Mail className="w-4 h-4" />
              Gelen Kutusu ({messages.length})
            </button>
            <button
              onClick={() => setActiveTab("compose")}
              className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === "compose"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileEdit className="w-4 h-4" />
              Yeni E-Posta / Taslak
            </button>
            <button
              onClick={() => {
                setActiveTab("audit");
                loadAuditLogs();
              }}
              className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === "audit"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Clock className="w-4 h-4" />
              Denetim Günlüğü ({auditLogs.length})
            </button>
          </div>

          {/* Inbox Tab */}
          {activeTab === "inbox" && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && loadMessages(searchQuery)}
                    placeholder="E-postalarda ara (ör: from:github, is:unread)..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  onClick={() => loadMessages(searchQuery)}
                  className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                  Ara / Yenile
                </button>
              </div>

              <div className="space-y-2">
                {messages.length === 0 && (
                  <div className="p-8 text-center text-slate-500 text-sm bg-slate-900/30 border border-slate-800 rounded-xl">
                    Mesaj bulunamadı veya arama sonucu boş.
                  </div>
                )}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className="bg-slate-900/50 hover:bg-slate-900/80 border border-slate-800 rounded-xl p-4 transition-colors space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-indigo-400" />
                        {msg.from}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {msg.date}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-slate-100">
                      {msg.subject}
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2">
                      {msg.snippet}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compose Tab */}
          {activeTab === "compose" && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4 max-w-2xl">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Kime (To)</label>
                <input
                  type="email"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="alici@example.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Konu (Subject)</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="E-posta konusu..."
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-100"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">İleti İçeriği (Body)</label>
                <textarea
                  rows={8}
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="İletinizi buraya yazınız..."
                  className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-xs text-slate-100 font-sans"
                />
              </div>

              {composeStatus && (
                <div className="text-xs text-indigo-400 font-medium">
                  {composeStatus}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => handleSendOrDraft(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold"
                >
                  <FileEdit className="w-3.5 h-3.5" />
                  Taslak Kaydet
                </button>
                <button
                  onClick={() => handleSendOrDraft(false)}
                  className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-950"
                >
                  <Send className="w-3.5 h-3.5" />
                  Gönder
                </button>
              </div>
            </div>
          )}

          {/* Audit Log Tab */}
          {activeTab === "audit" && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Gmail API üzerinden gerçekleştirilen her taslak kaydı ve ileti gönderimi denetim amacıyla bu günlüğe kaydedilir.
              </p>
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-3">Zaman Damgası</th>
                      <th className="p-3">Eylem (Action)</th>
                      <th className="p-3">Hedef ID</th>
                      <th className="p-3">Onay Durumu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-500">
                          Henüz bir işlem kaydedilmedi.
                        </td>
                      </tr>
                    )}
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-900/60">
                        <td className="p-3 font-mono text-slate-400">{log.created_at || "—"}</td>
                        <td className="p-3 font-semibold text-indigo-300">{log.action}</td>
                        <td className="p-3 font-mono text-[11px] text-slate-400">{log.target_id || "—"}</td>
                        <td className="p-3">
                          <span className="bg-emerald-950/60 border border-emerald-800 text-emerald-300 px-2 py-0.5 rounded text-[10px] font-mono">
                            ONAYLANDI
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
