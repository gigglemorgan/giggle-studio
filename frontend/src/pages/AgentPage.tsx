import React, { useState, useEffect } from "react";
import {
  Bot,
  Play,
  CheckCircle2,
  Clock,
  Shield,
  Copy,
  Terminal,
  Check,
  X,
  Loader2,
  Sparkles,
  ShieldAlert,
  History,
} from "lucide-react";
import { toast } from "../store/toastStore";
import { EmptyState } from "../components/ui/StatusStates";

interface AgentStepEvent {
  step_index: number;
  thought?: string;
  tool_name?: string;
  arguments?: Record<string, unknown>;
  output?: string;
  risk_level?: string;
  duration_ms?: number;
  final_answer?: string;
  reason?: string;
  step_id?: string;
}

interface AgentSession {
  id: string;
  title: string;
  status: "running" | "awaiting_approval" | "done" | "error";
  created_at?: string;
}

export const AgentPage: React.FC = () => {
  const [goal, setGoal] = useState("");
  const [workspaceId] = useState("default");
  const [policyMode, setPolicyMode] = useState<"strict" | "balanced" | "permissive">("balanced");
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<AgentStepEvent[]>([]);
  const [pendingApproval, setPendingApproval] = useState<AgentStepEvent | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AgentSession[]>([
    { id: "s-1", title: "ELF Güvenlik & String Taraması", status: "done" },
    { id: "s-2", title: "API Endpoint Sağlık Testi", status: "done" },
  ]);
  const [copied, setCopied] = useState(false);

  // Keyboard shortcut listener for approval
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!pendingApproval) return;
      if (e.key === "a" || e.key === "A") {
        if (!["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
          e.preventDefault();
          handleApprove(true);
        }
      } else if (e.key === "d" || e.key === "D") {
        if (!["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
          e.preventDefault();
          handleApprove(false);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [pendingApproval, currentSessionId]);

  const startAgent = async () => {
    if (!goal.trim() || isRunning) return;
    setIsRunning(true);
    setEvents([]);
    setPendingApproval(null);

    try {
      const createRes = await fetch("/api/agent/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: goal.slice(0, 40) + "...",
          workspace_id: workspaceId,
          approval_policy: policyMode,
        }),
      });
      const sessionData = await createRes.json();
      setCurrentSessionId(sessionData.id);

      setSessions((prev) => [
        { id: sessionData.id, title: goal.slice(0, 35) + "...", status: "running" },
        ...prev,
      ]);

      const runRes = await fetch(`/api/agent/sessions/${sessionData.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          workspace_id: workspaceId,
          policy_mode: policyMode,
        }),
      });

      if (!runRes.body) {
        setIsRunning(false);
        return;
      }

      const reader = runRes.body.getReader();
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

          if (payload.type === "step_start") {
            setEvents((prev) => [...prev, { step_index: payload.step_index }]);
          } else if (payload.type === "thought") {
            setEvents((prev) =>
              prev.map((evt) =>
                evt.step_index === payload.step_index
                  ? { ...evt, thought: payload.thought }
                  : evt
              )
            );
          } else if (payload.type === "tool_executed") {
            setEvents((prev) =>
              prev.map((evt) =>
                evt.step_index === payload.step_index
                  ? {
                      ...evt,
                      tool_name: payload.tool_name,
                      output: payload.output,
                      duration_ms: payload.duration_ms,
                    }
                  : evt
              )
            );
          } else if (payload.type === "awaiting_approval") {
            const approvalEvent: AgentStepEvent = {
              step_id: payload.step_id,
              step_index: payload.step_index,
              tool_name: payload.tool_name,
              arguments: payload.arguments,
              risk_level: payload.risk_level,
              reason: payload.reason,
            };
            setPendingApproval(approvalEvent);
            setEvents((prev) => [...prev, approvalEvent]);
            setIsRunning(false);
            setSessions((prev) =>
              prev.map((s) =>
                s.id === sessionData.id ? { ...s, status: "awaiting_approval" } : s
              )
            );
            return;
          } else if (payload.type === "done") {
            setEvents((prev) => [
              ...prev,
              {
                step_index: payload.step_index,
                final_answer: payload.final_answer,
              },
            ]);
            setIsRunning(false);
            setSessions((prev) =>
              prev.map((s) =>
                s.id === sessionData.id ? { ...s, status: "done" } : s
              )
            );
          } else if (payload.type === "error") {
            setEvents((prev) => [
              ...prev,
              {
                step_index: 0,
                thought: `HATA: ${payload.message}`,
              },
            ]);
            setIsRunning(false);
          }
        }
      }
    } catch {
      toast.error("Agent Hatası", "Görev yürütülürken bir hata oluştu.");
      setIsRunning(false);
    }
  };

  const handleApprove = async (approved: boolean) => {
    if (!pendingApproval || !currentSessionId) return;

    try {
      await fetch(
        `/api/agent/sessions/${currentSessionId}/steps/${pendingApproval.step_id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved }),
        }
      );
      toast.info(
        approved ? "İşlem Onaylandı" : "İşlem Reddedildi",
        approved ? "Agent çalışmaya devam ediyor." : "İşlem durduruldu."
      );
      setPendingApproval(null);
      if (approved) {
        startAgent();
      }
    } catch {
      toast.error("Hata", "Onay kararı iletilemedi.");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getRiskBadge = (risk?: string) => {
    switch (risk?.toLowerCase()) {
      case "safe":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-success/15 text-success border border-success/30">GÜVENLİ</span>;
      case "write":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-warning/15 text-warning border border-warning/30">YAZMA</span>;
      case "exec":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-destructive/15 text-destructive border border-destructive/30">KOMUT ÇALIŞTIRMA</span>;
      case "network":
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-info/15 text-info border border-info/30">AĞ İŞLEMİ</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground">STANDART</span>;
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Left: Session List Sidebar */}
      <div className="w-64 border-r border-border bg-card/40 flex flex-col justify-between shrink-0 select-none hidden md:flex">
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <History className="w-3.5 h-3.5 text-primary" />
              <span>Agent Oturumları</span>
            </span>
          </div>
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map((sess) => (
            <div
              key={sess.id}
              className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                currentSessionId === sess.id
                  ? "bg-primary/10 border-primary/25 text-foreground font-semibold"
                  : "bg-card border-border hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="truncate flex-1 text-[11px] font-medium">{sess.title}</span>
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ml-1.5 ${
                    sess.status === "running"
                      ? "bg-primary animate-pulse"
                      : sess.status === "awaiting_approval"
                      ? "bg-warning animate-bounce"
                      : "bg-success"
                  }`}
                />
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">
                {sess.status === "awaiting_approval" ? "Onay Bekliyor" : sess.status === "running" ? "Yürütülüyor" : "Tamamlandı"}
              </span>
            </div>
          ))}
        </div>

        {/* Security Policy Selector Footer */}
        <div className="p-3 border-t border-border bg-card-muted/50 space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Shield className="w-3 h-3 text-primary" />
            <span>Onay Politikası</span>
          </label>
          <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-card border border-border text-[11px]">
            <button
              onClick={() => setPolicyMode("strict")}
              className={`py-1 rounded text-center transition-all ${
                policyMode === "strict"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Her yazma ve çalıştırma adımında onay sor"
            >
              Sıkı
            </button>
            <button
              onClick={() => setPolicyMode("balanced")}
              className={`py-1 rounded text-center transition-all ${
                policyMode === "balanced"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Komut çalıştırma ve ağ adımlarında onay sor"
            >
              Dengeli
            </button>
            <button
              onClick={() => setPolicyMode("permissive")}
              className={`py-1 rounded text-center transition-all ${
                policyMode === "permissive"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Yalnızca yüksek riskli komutlarda onay sor"
            >
              Gevşek
            </button>
          </div>
        </div>
      </div>

      {/* Center: Mission goal input & Timeline trace */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Goal bar */}
        <div className="p-4 border-b border-border bg-card/60 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2 max-w-4xl mx-auto">
            <div className="relative flex-1">
              <Bot className="w-4 h-4 absolute left-3 top-3 text-primary" />
              <input
                type="text"
                placeholder="Agent hedefi girin (Örn: 'main.py dosyasını analiz et, varsa testleri çalıştır ve raporla')..."
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") startAgent();
                }}
                disabled={isRunning}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-card border border-border text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 font-sans shadow-subtle"
              />
            </div>
            <button
              onClick={startAgent}
              disabled={isRunning || !goal.trim()}
              className="py-2 px-5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all shadow-subtle disabled:opacity-40 flex items-center gap-2 shrink-0"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Yürütülüyor...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Görevi Başlat</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Main Timeline View */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-4xl mx-auto w-full">
          {/* Approval Card (Hero when pending) */}
          {pendingApproval && (
            <div className="p-5 rounded-2xl border-2 border-warning bg-warning/10 shadow-overlay animate-fade-in space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-warning font-bold text-sm">
                  <ShieldAlert className="w-5 h-5 animate-pulse" />
                  <span>Kullanıcı Onayı Bekleniyor</span>
                </div>
                {getRiskBadge(pendingApproval.risk_level)}
              </div>

              <p className="text-xs text-foreground leading-relaxed">
                Agent şu aracı çalıştırmak üzere onayınızı talep ediyor:{" "}
                <strong className="font-mono text-primary">{pendingApproval.tool_name}</strong>
              </p>

              {pendingApproval.reason && (
                <p className="text-xs text-muted-foreground italic">
                  Gerekçe: {pendingApproval.reason}
                </p>
              )}

              {/* Exact command / diff */}
              <div className="p-3 rounded-lg bg-card border border-border font-mono text-xs overflow-x-auto text-foreground/90">
                <pre>{JSON.stringify(pendingApproval.arguments, null, 2)}</pre>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-warning/20">
                <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                  <span>Kısayollar: </span>
                  <kbd className="px-1.5 py-0.5 rounded bg-card border border-border text-foreground font-mono">
                    A (Onayla)
                  </kbd>
                  <kbd className="px-1.5 py-0.5 rounded bg-card border border-border text-foreground font-mono">
                    D (Reddet)
                  </kbd>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApprove(false)}
                    className="py-1.5 px-4 rounded-lg border border-border bg-card hover:bg-card-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5 text-destructive" />
                    <span>Reddet (D)</span>
                  </button>
                  <button
                    onClick={() => handleApprove(true)}
                    className="py-1.5 px-5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shadow-subtle flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Onayla ve Devam Et (A)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Steps Timeline */}
          {events.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center pt-16">
              <EmptyState
                icon={Bot}
                title="Agent Görevi Bekleniyor"
                description="Agent; araçları kullanarak dosya oluşturabilir, kod çalıştırabilir, tersine mühendislik yapabilir ve hedefinizi adım adım tamamlar."
                action={{
                  label: "Örnek Görev Başlat",
                  onClick: () => {
                    setGoal("Mevcut çalışma alanındaki python dosyalarını listele ve syntax kontrolü yap.");
                  },
                }}
              />
            </div>
          ) : (
            <div className="space-y-4 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/60">
              {events.map((evt, idx) => (
                <div key={idx} className="relative pl-10 animate-fade-in">
                  {/* Timeline dot */}
                  <div className="absolute left-2.5 top-3 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-card border-2 border-primary flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  </div>

                  {/* Card content */}
                  <div className="rounded-xl border border-border bg-card p-4 shadow-card space-y-2.5 text-xs">
                    {/* Header: Step index & Duration */}
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="font-mono font-semibold text-foreground text-[11px] uppercase tracking-wider">
                        Adım {evt.step_index || idx + 1}
                      </span>
                      {evt.duration_ms !== undefined && (
                        <span className="flex items-center gap-1 text-[10px] font-mono">
                          <Clock className="w-3 h-3 text-primary" />
                          <span>{evt.duration_ms} ms</span>
                        </span>
                      )}
                    </div>

                    {/* Thought card */}
                    {evt.thought && (
                      <div className="p-3 rounded-lg bg-card-muted/50 border border-border/80 text-foreground/90 leading-relaxed font-sans">
                        <div className="flex items-center gap-1.5 text-primary text-[10px] font-semibold uppercase tracking-wider mb-1">
                          <Sparkles className="w-3 h-3" />
                          <span>Düşünce & Planlama</span>
                        </div>
                        <p>{evt.thought}</p>
                      </div>
                    )}

                    {/* Tool Call card */}
                    {evt.tool_name && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-mono text-primary font-semibold">
                            <Terminal className="w-3.5 h-3.5" />
                            <span>Araç: {evt.tool_name}</span>
                          </span>
                          {getRiskBadge(evt.risk_level)}
                        </div>

                        {evt.arguments && (
                          <div className="p-2.5 rounded-lg bg-background border border-border font-mono text-[11px] text-muted-foreground overflow-x-auto">
                            <pre>{JSON.stringify(evt.arguments, null, 2)}</pre>
                          </div>
                        )}

                        {evt.output && (
                          <div className="p-2.5 rounded-lg bg-card-muted/70 border border-border font-mono text-[11px] text-foreground/90 overflow-x-auto max-h-48">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                              Çıktı Sonucu:
                            </div>
                            <pre className="whitespace-pre-wrap">{evt.output}</pre>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Final Answer celebratory card */}
                    {evt.final_answer && (
                      <div className="p-4 rounded-xl border border-success/40 bg-success/10 space-y-2 mt-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-success flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Görev Başarıyla Tamamlandı</span>
                          </span>
                          <button
                            onClick={() => copyToClipboard(evt.final_answer!)}
                            className="p-1 rounded hover:bg-success/20 text-success transition-colors"
                            title="Yanıtı Kopyala"
                          >
                            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap font-sans">
                          {evt.final_answer}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
