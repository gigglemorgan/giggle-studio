import React, { useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  Send,
  Square,
  Copy,
  Check,
  Sliders,
  Plus,
  Zap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokens_in?: number;
  tokens_out?: number;
  ttft_ms?: number;
  tps?: number;
}

export const ChatPage: React.FC = () => {
  const [chats, setChats] = useState<any[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sampling settings
  const [showSettings, setShowSettings] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.95);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [repeatPenalty, setRepeatPenalty] = useState(1.1);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadChats = async () => {
    try {
      const res = await fetch("/api/chats");
      const data = await res.json();
      setChats(data);
      if (data.length > 0 && !activeChatId) {
        selectChat(data[0].id);
      }
    } catch (err) {
      console.error("Sohbetler alınamadı:", err);
    }
  };

  const selectChat = async (chatId: string) => {
    setActiveChatId(chatId);
    try {
      const res = await fetch(`/api/chats/${chatId}/messages`);
      const data = await res.json();
      setMessages(data);
    } catch (err) {
      console.error("Mesajlar alınamadı:", err);
    }
  };

  const handleCreateChat = async () => {
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Yeni Sohbet",
          sampling_params: {
            temperature,
            top_p: topP,
            max_tokens: maxTokens,
            repeat_penalty: repeatPenalty,
          },
        }),
      });
      const newChat = await res.json();
      setChats([newChat, ...chats]);
      setActiveChatId(newChat.id);
      setMessages([]);
    } catch (err) {
      console.error("Sohbet oluşturulamadı:", err);
    }
  };

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  const handleSendMessage = async () => {
    if (!inputPrompt.trim() || isGenerating) return;

    let chatId = activeChatId;
    if (!chatId) {
      // Auto-create chat if none exists
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: inputPrompt.slice(0, 30) }),
      });
      const newChat = await res.json();
      setChats([newChat, ...chats]);
      chatId = newChat.id;
      setActiveChatId(chatId);
    }

    const userText = inputPrompt;
    setInputPrompt("");

    // Optimistically append user message and placeholder assistant message
    const tempUserMsg: Message = { id: `u-${Date.now()}`, role: "user", content: userText };
    const tempAssistantMsg: Message = { id: `a-${Date.now()}`, role: "assistant", content: "" };

    setMessages((prev) => [...prev, tempUserMsg, tempAssistantMsg]);
    setIsGenerating(true);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: userText,
          sampling_params: {
            temperature,
            top_p: topP,
            max_tokens: maxTokens,
            repeat_penalty: repeatPenalty,
          },
        }),
        signal: abortControllerRef.current.signal,
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let assistantText = "";
      let lastStats: any = null;

      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "").trim();
            if (dataStr === "[DONE]") break;

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.token) {
                assistantText += parsed.token;
              }
              if (parsed.stats) {
                lastStats = parsed.stats;
              }
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === "assistant") {
                  last.content = assistantText;
                  if (lastStats) {
                    last.tokens_out = lastStats.tokens_out;
                    last.ttft_ms = lastStats.ttft_ms;
                    last.tps = lastStats.tps;
                  }
                }
                return updated;
              });
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            last.content += `\n\n*[Hata: ${err.message || "Çıkarım sırasında bağlantı kesildi"}]*`;
          }
          return updated;
        });
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsGenerating(false);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-950">
      {/* Chats history sidebar */}
      <div className="w-64 border-r border-slate-800 bg-slate-900/40 p-4 flex flex-col justify-between">
        <div className="space-y-3">
          <button
            onClick={handleCreateChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Sohbet</span>
          </button>

          <div className="space-y-1 overflow-y-auto max-h-[calc(100vh-220px)]">
            {chats.map((c) => (
              <button
                key={c.id}
                onClick={() => selectChat(c.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs truncate transition flex items-center gap-2 ${
                  activeChatId === c.id
                    ? "bg-slate-800 text-white font-medium"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{c.title}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/80 text-xs text-slate-300 font-medium hover:bg-slate-700 transition"
        >
          <Sliders className="w-4 h-4 text-blue-400" />
          <span>Üretim Parametreleri</span>
        </button>
      </div>

      {/* Main chat window */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Messages feed */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3 text-slate-500">
              <MessageSquare className="w-12 h-12 text-slate-700" />
              <h3 className="text-slate-300 font-semibold text-base">Giggle Studio Sohbet</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Model yöneticisinden bir model yükleyip hemen mesaj göndererek yerel LLM çıkarımını başlatabilirsiniz.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${
                  m.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div className="flex items-center gap-2 mb-1 px-1 text-[11px] text-slate-400 font-medium">
                  <span>{m.role === "user" ? "Siz" : "Giggle Model"}</span>
                  {m.tps !== undefined && (
                    <span className="flex items-center gap-1 text-emerald-400 font-mono text-[10px]">
                      <Zap className="w-3 h-3" /> {m.tps} t/s (TTFT: {m.ttft_ms} ms)
                    </span>
                  )}
                </div>

                <div
                  className={`p-4 rounded-2xl max-w-3xl text-sm leading-relaxed relative group ${
                    m.role === "user"
                      ? "bg-blue-600 text-white rounded-br-none shadow-md shadow-blue-500/10"
                      : "bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none"
                  }`}
                >
                  <div className="prose prose-invert prose-sm max-w-none break-words">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>

                  <button
                    onClick={() => copyToClipboard(m.content, m.id)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-800/80 text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition"
                    title="Kopyala"
                  >
                    {copiedId === m.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input box */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 backdrop-blur">
          <div className="max-w-4xl mx-auto flex items-end gap-3">
            <textarea
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Bir mesaj yazın (Shift+Enter yeni satır)..."
              rows={2}
              className="flex-1 px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-blue-500 resize-none font-sans"
            />

            {isGenerating ? (
              <button
                onClick={handleStop}
                className="h-12 px-5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-red-500/20 transition"
              >
                <Square className="w-4 h-4 fill-white" />
                <span>Durdur</span>
              </button>
            ) : (
              <button
                onClick={handleSendMessage}
                disabled={!inputPrompt.trim()}
                className="h-12 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                <span>Gönder</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sampling parameter side drawer */}
      {showSettings && (
        <div className="w-72 border-l border-slate-800 bg-slate-900/90 p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h4 className="font-semibold text-slate-200 text-xs">Örnekleme (Sampling)</h4>
            <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white text-xs">✕</button>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <div className="flex justify-between mb-1 text-slate-400">
                <span>Sıcaklık (Temperature)</span>
                <span className="font-mono text-blue-400">{temperature}</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={2.0}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1 text-slate-400">
                <span>Top-P</span>
                <span className="font-mono text-blue-400">{topP}</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={topP}
                onChange={(e) => setTopP(parseFloat(e.target.value))}
                className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1 text-slate-400">
                <span>Tekrar Cezası (Repeat Penalty)</span>
                <span className="font-mono text-blue-400">{repeatPenalty}</span>
              </div>
              <input
                type="range"
                min={1.0}
                max={1.5}
                step={0.05}
                value={repeatPenalty}
                onChange={(e) => setRepeatPenalty(parseFloat(e.target.value))}
                className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1 text-slate-400">
                <span>Maksimum Token</span>
                <span className="font-mono text-blue-400">{maxTokens}</span>
              </div>
              <input
                type="range"
                min={256}
                max={8192}
                step={256}
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
