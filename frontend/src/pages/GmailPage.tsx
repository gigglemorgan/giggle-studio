import React, { useEffect, useState } from "react";
import {
  Mail,
  Search,
  Send,
  FileEdit,
  RefreshCw,
  Shield,
  ShieldCheck,
  AlertTriangle,
  Inbox,
} from "lucide-react";
import { toast } from "../store/toastStore";
import { Skeleton } from "../components/ui/StatusStates";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/Dialog";

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
  const [selectedMessage, setSelectedMessage] = useState<MessageItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Compose State
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Sending confirmation modal
  const [showSendConfirmModal, setShowSendConfirmModal] = useState(false);
  const [authCode, setAuthCode] = useState("");

  const scopes = [
    { name: "gmail.readonly", label: "Okuma (Readonly)", level: "safe" },
    { name: "gmail.compose", label: "Taslak Oluşturma (Compose)", level: "write" },
    { name: "gmail.send", label: "E-Posta Gönderme (Send)", level: "exec" },
  ];

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
    } catch {}
  };

  const loadMessages = async (query = "") => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/gmail/messages?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
        if (data.length > 0 && !selectedMessage) {
          setSelectedMessage(data[0]);
        }
      }
    } catch {
      toast.error("Hata", "E-postalar yüklenemedi.");
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
    } catch {}
  };

  useEffect(() => {
    loadStatus();
    loadAuditLogs();
  }, []);

  const handleStartAuth = async () => {
    try {
      const res = await fetch("/api/gmail/auth/start", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.auth_url) {
          window.open(data.auth_url, "_blank");
        }
      }
    } catch {
      toast.error("Hata", "OAuth2 yetkilendirme başlatılamadı.");
    }
  };

  const handleExchangeCode = async () => {
    if (!authCode.trim()) return;
    try {
      const res = await fetch("/api/gmail/auth/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: authCode.trim() }),
      });
      if (res.ok) {
        toast.success("Bağlantı Kuruldu", "Gmail hesabı başarıyla bağlandı.");
        setAuthCode("");
        loadStatus();
      } else {
        toast.error("Hata", "Kod doğrulanamadı.");
      }
    } catch {}
  };

  const handleDisconnect = async () => {
    try {
      await fetch("/api/gmail/disconnect", { method: "POST" });
      setStatus({ connected: false, email: null, client_id_configured: true });
      setMessages([]);
      setSelectedMessage(null);
      toast.info("Bağlantı Kesildi", "Gmail kimlik bilgileri silindi.");
    } catch {}
  };

  const handleConfirmSend = async () => {
    setShowSendConfirmModal(false);
    setIsSending(true);

    try {
      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: composeTo,
          subject: composeSubject,
          body: composeBody,
        }),
      });

      if (res.ok) {
        toast.success("E-Posta Gönderildi", `${composeTo} adresine başarıyla iletildi.`);
        setComposeTo("");
        setComposeSubject("");
        setComposeBody("");
        setActiveTab("inbox");
        loadMessages();
        loadAuditLogs();
      } else {
        toast.error("Hata", "E-posta gönderilemedi.");
      }
    } catch {
      toast.error("Hata", "İletişim hatası.");
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      const res = await fetch("/api/gmail/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: composeTo,
          subject: composeSubject,
          body: composeBody,
        }),
      });
      if (res.ok) {
        toast.success("Taslak Kaydedildi", "Taslak Gmail hesabınıza eklendi.");
        loadAuditLogs();
      }
    } catch {
      toast.error("Hata", "Taslak kaydedilemedi.");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Connection Card Header */}
      <div className="p-4 border-b border-border bg-card/60 backdrop-blur-md shrink-0">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Mail className="w-5 h-5 stroke-[1.8]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-foreground">Gmail Entegrasyonu & Güvenlik</h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono flex items-center gap-1 ${
                    status.connected
                      ? "bg-success/15 text-success border border-success/30"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      status.connected ? "bg-success animate-pulse" : "bg-muted-foreground"
                    }`}
                  />
                  {status.connected ? status.email : "Bağlantı Yok"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Loopback OAuth 2.0 PKCE ve Fernet şifrelemeli yerel kimlik deposu.
              </p>
            </div>
          </div>

          {/* Scope chips */}
          <div className="flex flex-wrap items-center gap-2">
            {scopes.map((s) => (
              <span
                key={s.name}
                className="px-2.5 py-1 rounded-lg bg-card-muted/60 border border-border text-[11px] font-mono text-muted-foreground flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3 h-3 text-primary" />
                <span>{s.label}</span>
              </span>
            ))}

            {status.connected ? (
              <button
                onClick={handleDisconnect}
                className="py-1 px-3 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-colors ml-2"
              >
                Bağlantıyı Kes
              </button>
            ) : (
              <button
                onClick={handleStartAuth}
                className="py-1.5 px-3.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shadow-subtle ml-2"
              >
                Google ile Bağlan (OAuth PKCE)
              </button>
            )}
          </div>
        </div>

        {/* Code exchange row if needed */}
        {!status.connected && (
          <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 max-w-6xl mx-auto">
            <span className="text-xs text-muted-foreground shrink-0">Manuel Yetki Kodu:</span>
            <input
              type="text"
              placeholder="Google OAuth ekranından dönen onay kodunu buraya yapıştırın..."
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              className="flex-1 p-1.5 rounded-lg bg-card border border-border text-xs text-foreground font-mono outline-none focus:border-primary"
            />
            <button
              onClick={handleExchangeCode}
              className="py-1.5 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 shadow-subtle"
            >
              Bağlantıyı Doğrula
            </button>
          </div>
        )}
      </div>

      {/* Main Tabs Navigation */}
      <div className="h-10 border-b border-border bg-card/40 flex items-center px-4 gap-2 shrink-0 select-none">
        {[
          { id: "inbox", label: "Gelen Kutusu & İleti Görünümü", icon: Inbox },
          { id: "compose", label: "E-Posta & Taslak Oluştur", icon: FileEdit },
          { id: "audit", label: "Güvenlik Denetim Günlüğü (Audit Log)", icon: Shield },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === t.id
                  ? "bg-primary text-primary-foreground shadow-subtle"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {/* TAB 1: INBOX & THREAD VIEWER SPLIT */}
        {activeTab === "inbox" && (
          <div className="flex h-full w-full overflow-hidden">
            {/* Messages List Left */}
            <div className="w-80 md:w-96 border-r border-border bg-card/30 flex flex-col shrink-0 select-none">
              <div className="p-3 border-b border-border">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="E-postalarda ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") loadMessages(searchQuery);
                    }}
                    className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-card border border-border text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {isLoading ? (
                  <div className="p-4 space-y-2">
                    <Skeleton className="w-full h-12" />
                    <Skeleton className="w-full h-12" />
                    <Skeleton className="w-full h-12" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    E-posta bulunamadı veya henüz hesap bağlanmadı.
                  </div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => setSelectedMessage(m)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedMessage?.id === m.id
                          ? "bg-primary/10 border-primary/30 shadow-subtle"
                          : "bg-card border-border hover:border-border/80"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-xs text-foreground truncate max-w-[180px]">
                          {m.from}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">{m.date}</span>
                      </div>
                      <h4 className="text-xs font-medium text-foreground truncate mb-1">{m.subject}</h4>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-tight">
                        {m.snippet}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Reading Pane Right */}
            <div className="flex-1 p-6 overflow-y-auto bg-card/10">
              {selectedMessage ? (
                <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
                  <div className="p-6 rounded-2xl bg-card border border-border shadow-card space-y-4">
                    <div className="border-b border-border pb-4 space-y-2">
                      <h2 className="text-base font-bold text-foreground">{selectedMessage.subject}</h2>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div>
                          <span>Kimden: </span>
                          <strong className="text-foreground">{selectedMessage.from}</strong>
                        </div>
                        <span className="font-mono">{selectedMessage.date}</span>
                      </div>
                    </div>

                    <div className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap font-sans min-h-[140px]">
                      {selectedMessage.snippet}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  Okumak için soldan bir e-posta seçin.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: COMPOSE & DRAFT */}
        {activeTab === "compose" && (
          <div className="p-6 max-w-3xl mx-auto overflow-y-auto w-full h-full animate-fade-in">
            <div className="p-6 rounded-2xl bg-card border border-border shadow-card space-y-4">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <FileEdit className="w-4 h-4 text-primary" />
                <span>Yeni İleti Oluştur</span>
              </h3>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Alıcı (To)</label>
                <input
                  type="email"
                  placeholder="ornek@alanadi.com"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  className="w-full p-2 rounded-lg bg-card-muted/60 border border-border text-xs text-foreground outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Konu (Subject)</label>
                <input
                  type="text"
                  placeholder="E-posta konusu..."
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className="w-full p-2 rounded-lg bg-card-muted/60 border border-border text-xs text-foreground outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">İleti Gövdesi</label>
                <textarea
                  rows={8}
                  placeholder="Mesajınızı buraya yazın..."
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="w-full p-3 rounded-lg bg-card-muted/60 border border-border text-xs text-foreground outline-none resize-none focus:border-primary leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={!composeTo || !composeSubject}
                  className="py-2 px-4 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  Taslak Olarak Kaydet
                </button>

                <button
                  type="button"
                  onClick={() => setShowSendConfirmModal(true)}
                  disabled={!composeTo || !composeSubject || isSending}
                  className="py-2 px-6 rounded-lg bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all shadow-subtle flex items-center gap-2 disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSending ? "Gönderiliyor..." : "E-Postayı Gönder"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: AUDIT LOG TABLE */}
        {activeTab === "audit" && (
          <div className="p-6 max-w-5xl mx-auto h-full overflow-y-auto animate-fade-in space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">Gmail Güvenlik Denetim Günlüğü</h3>
                <p className="text-xs text-muted-foreground">
                  Giggle Studio üzerinden yapılan tüm Gmail okuma, taslak ve gönderme hareketleri kriptografik olarak kaydedilir.
                </p>
              </div>
              <button
                onClick={loadAuditLogs}
                className="py-1.5 px-3 rounded-lg border border-border bg-card text-xs hover:bg-muted transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Günlüğü Yenile</span>
              </button>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden shadow-card">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-card-muted/60 border-b border-border text-muted-foreground uppercase text-[10px] font-semibold tracking-wider">
                  <tr>
                    <th className="p-3">Eylem</th>
                    <th className="p-3">Hedef</th>
                    <th className="p-3">Onay Durumu</th>
                    <th className="p-3">Zaman Damgası</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground font-sans text-xs">
                        Henüz kaydedilmiş bir Gmail denetim kaydı bulunmuyor.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/40 transition-colors">
                        <td className="p-3 font-semibold text-primary">{log.action}</td>
                        <td className="p-3 text-foreground/90">{log.target_id || "-"}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] ${
                              log.approved
                                ? "bg-success/15 text-success border border-success/30"
                                : "bg-warning/15 text-warning border border-warning/30"
                            }`}
                          >
                            {log.approved ? "ONAYLANDI" : "BEKLEMEDE"}
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground text-[11px]">{log.created_at || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Prominent Send Confirmation Modal */}
      <Dialog open={showSendConfirmModal} onOpenChange={setShowSendConfirmModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-warning mb-1">
              <AlertTriangle className="w-5 h-5" />
              <DialogTitle>E-Posta Gönderme Onayı</DialogTitle>
            </div>
            <DialogDescription>
              Bu e-posta harici bir alıcıya gönderilecektir. Lütfen bilgileri kontrol edin:
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 rounded-xl bg-card-muted/70 border border-border space-y-2 text-xs">
            <div>
              <span className="text-muted-foreground">Alıcı: </span>
              <strong className="text-foreground">{composeTo}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Konu: </span>
              <strong className="text-foreground">{composeSubject}</strong>
            </div>
            <div className="pt-2 border-t border-border">
              <span className="text-muted-foreground block mb-1">Gövde Özeti:</span>
              <p className="text-[11px] text-foreground/90 line-clamp-3 bg-card p-2 rounded border border-border">
                {composeBody}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setShowSendConfirmModal(false)}
              className="py-1.5 px-4 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground"
            >
              Vazgeç
            </button>
            <button
              onClick={handleConfirmSend}
              className="py-1.5 px-5 rounded-lg bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 shadow-subtle flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Evet, Gönder</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
