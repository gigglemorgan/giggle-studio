import React, { useState } from "react";
import {
  Bot,
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Shield,
  Copy,
  Terminal,
  FileCode,
  Check,
  X,
  Loader2,
} from "lucide-react";

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

export const AgentPage: React.FC = () => {
  const [goal, setGoal] = useState("");
  const [workspaceId, setWorkspaceId] = useState("default");
  const [policyMode, setPolicyMode] = useState("balanced");
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<AgentStepEvent[]>([]);
  const [pendingApproval, setPendingApproval] = useState<AgentStepEvent | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const startAgent = async () => {
    if (!goal.trim() || isRunning) return;
    setIsRunning(true);
    setEvents([]);
    setPendingApproval(null);

    try {
      // 1. Create session
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

      // 2. Stream SSE events
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
    } catch (err) {
      console.error("Agent error:", err);
    } finally {
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
      setPendingApproval(null);
      // Restart loop to continue
      startAgent();
    } catch (err) {
      console.error("Approval error:", err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Bot className="w-7 h-7 text-indigo-400" />
            Otonom Ajan Modu (Agent Mode)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Planla ➔ Araç Çağır ➔ Kumhavuzunda Yürüt ➔ İnsan Onayı & Savunma
          </p>
        </div>

        {/* Policy Selector */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400 flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-emerald-400" /> Onay Politikası:
          </label>
          <select
            value={policyMode}
            onChange={(e) => setPolicyMode(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-xs rounded px-2.5 py-1.5 text-slate-200"
          >
            <option value="balanced">Dengeli (Exec & Network Onaylı)</option>
            <option value="strict">Katı (Strict - Her Yazma/İcrada Sor)</option>
            <option value="autonomous">Otonom (Kumhavuzu İçi Otomatik)</option>
          </select>
        </div>
      </div>

      {/* Goal Input Section */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Ajan Görev Hedefi
        </label>
        <textarea
          rows={3}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Örnek: main.py dosyasını analiz et, Fibonacci hesaplama fonksiyonunu ekle ve kumhavuzunda test et..."
          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
        />

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Çalışma Alanı (Workspace):</span>
            <input
              type="text"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 w-28 font-mono"
            />
          </div>

          <button
            onClick={startAgent}
            disabled={isRunning || !goal.trim()}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-md ${
              isRunning || !goal.trim()
                ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/30"
            }`}
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Ajan Çalışıyor...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                Görevi Başlat
              </>
            )}
          </button>
        </div>
      </div>

      {/* Pending Human Approval Modal / Alert */}
      {pendingApproval && (
        <div className="bg-amber-950/40 border border-amber-600/50 rounded-xl p-5 shadow-xl space-y-4 animate-pulse-subtle">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-amber-200">
                  İnsan Onayı Gerekiyor (Human Approval Required)
                </span>
                <span className="bg-red-900/60 border border-red-700 text-red-200 text-xs px-2 py-0.5 rounded font-mono font-bold">
                  {pendingApproval.risk_level?.toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-amber-300/90 mt-1">
                {pendingApproval.reason}
              </p>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-300 overflow-x-auto">
            <div className="text-slate-400 mb-1">
              Çağrılan Araç:{" "}
              <strong className="text-indigo-300">
                {pendingApproval.tool_name}
              </strong>
            </div>
            <pre className="text-emerald-400">
              {JSON.stringify(pendingApproval.arguments, null, 2)}
            </pre>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => handleApprove(false)}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors"
            >
              <X className="w-4 h-4 text-red-400" /> Reddet (Reject)
            </button>
            <button
              onClick={() => handleApprove(true)}
              className="flex items-center gap-1.5 px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-amber-950 transition-colors"
            >
              <Check className="w-4 h-4" /> Onayla ve Çalıştır (Approve & Run)
            </button>
          </div>
        </div>
      )}

      {/* Execution Trace Stream */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Terminal className="w-4 h-4 text-slate-400" />
          Yürütme Günlüğü & Düşünce İzi (Execution Trace)
        </h2>

        {events.length === 0 && !isRunning && (
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-8 text-center text-slate-500 text-sm">
            Henüz başlatılmış bir ajan görevi yok. Yukarıdaki kutuya bir hedef
            yazıp &quot;Görevi Başlat&quot; butonuna basınız.
          </div>
        )}

        {events.map((evt, idx) => (
          <div
            key={idx}
            className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3"
          >
            {/* Step header */}
            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/60 pb-2">
              <span className="font-semibold text-slate-300">
                Adım {evt.step_index}
              </span>
              {evt.duration_ms !== undefined && (
                <span className="flex items-center gap-1 text-slate-400 font-mono">
                  <Clock className="w-3.5 h-3.5" />
                  {evt.duration_ms} ms
                </span>
              )}
            </div>

            {/* Thought */}
            {evt.thought && (
              <div className="text-sm text-slate-200 bg-indigo-950/20 border-l-2 border-indigo-500 px-3 py-2 rounded-r">
                <span className="text-xs text-indigo-400 block font-semibold mb-0.5">
                  Düşünce:
                </span>
                {evt.thought}
              </div>
            )}

            {/* Tool Executed */}
            {evt.tool_name && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <FileCode className="w-4 h-4 text-emerald-400" />
                  <span className="text-slate-300 font-semibold">
                    Araç Çağrısı:
                  </span>
                  <code className="bg-slate-800 px-2 py-0.5 rounded text-emerald-300 font-mono">
                    {evt.tool_name}
                  </code>
                </div>

                {evt.output && (
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-300 max-h-60 overflow-y-auto">
                    <pre className="whitespace-pre-wrap">{evt.output}</pre>
                  </div>
                )}
              </div>
            )}

            {/* Final Answer */}
            {evt.final_answer && (
              <div className="bg-emerald-950/30 border border-emerald-600/40 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Tamamlandı - Nihai
                    Yanıt
                  </span>
                  <button
                    onClick={() => copyToClipboard(evt.final_answer || "")}
                    className="text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    Kopyala
                  </button>
                </div>
                <div className="text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">
                  {evt.final_answer}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
