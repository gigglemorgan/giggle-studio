import React, { useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  Send,
  Square,
  Copy,
  Check,
  Sliders,
  Plus,
  RotateCcw,
  GitBranch,
  Edit2,
  Search,
  ChevronDown,
  ChevronRight,
  Paperclip,
  Sparkles,
  Eye,
  WrapText,
  FileText,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useModelStore } from "../store/modelStore";
import { toast } from "../store/toastStore";
import { useLanguageStore } from "../i18n";
import { EmptyState } from "../components/ui/StatusStates";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/Dialog";
import { TooltipProvider } from "../components/ui/Tooltip";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokens_in?: number;
  tokens_out?: number;
  ttft_ms?: number;
  tps?: number;
}

const SYSTEM_PRESETS = [
  {
    id: "default",
    name: "Varsayılan Asistan",
    prompt: "Sen Giggle Studio'nun yetenekli, analitik ve yardımsever yerel yapay zeka asistanısın. Yanıtlarını net, yapılandırılmış ve Türkçe olarak ver.",
  },
  {
    id: "coder",
    name: "Yazılım Mimarı & Kıdemli Geliştirici",
    prompt: "Sen üst düzey bir yazılım mühendisisin. Temiz, tür güvenli, test edilebilir ve iyi belgelenmiş kodlar yazarsın. Modern pratiklere odaklan.",
  },
  {
    id: "re_analyst",
    name: "Tersine Mühendislik & Güvenlik Analisti",
    prompt: "Sen zararlı yazılım analizi, ELF/PE ikili dosya yapısı, x86/x64 disassembly ve zafiyet araştırması konularında uzman bir güvenlik araştırmacısısın.",
  },
  {
    id: "concise",
    name: "Kısa ve Öz Yanıtlayıcı",
    prompt: "Tüm sorulara gereksiz dolgu cümleleri olmadan, doğrudan, nokta atışı ve en verimli şekilde yanıt ver.",
  },
];

export const ChatPage: React.FC = () => {
  const { t } = useLanguageStore();
  const { activeStatus, setTokensPerSec } = useModelStore();

  const [chats, setChats] = useState<any[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Sampling settings
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.95);
  const [topK, setTopK] = useState(40);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [repeatPenalty, setRepeatPenalty] = useState(1.1);
  const [selectedPreset, setSelectedPreset] = useState<string>("default");
  const [customSystemPrompt, setCustomSystemPrompt] = useState(SYSTEM_PRESETS[0].prompt);

  // Debug prompt modal
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [attachments, setAttachments] = useState<{ name: string; content: string }[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadChats = async () => {
    try {
      const res = await fetch("/api/chats");
      if (res.ok) {
        const data = await res.json();
        setChats(data);
        if (data.length > 0 && !activeChatId) {
          selectChat(data[0].id);
        }
      }
    } catch (err) {
      console.error("Sohbetler alınamadı:", err);
    }
  };

  const selectChat = async (chatId: string) => {
    setActiveChatId(chatId);
    try {
      const res = await fetch(`/api/chats/${chatId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
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
      if (res.ok) {
        const newChat = await res.json();
        setChats([newChat, ...chats]);
        setActiveChatId(newChat.id);
        setMessages([]);
        if (textareaRef.current) textareaRef.current.focus();
      }
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

  // Auto-grow textarea
  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputPrompt(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  const handleSendMessage = async (overridePrompt?: string) => {
    const textToSend = overridePrompt !== undefined ? overridePrompt : inputPrompt;
    if ((!textToSend.trim() && attachments.length === 0) || isGenerating) return;

    let chatId = activeChatId;
    if (!chatId) {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: textToSend.slice(0, 30) || "Yeni Sohbet" }),
      });
      const newChat = await res.json();
      setChats([newChat, ...chats]);
      chatId = newChat.id;
      setActiveChatId(chatId);
    }

    let fullUserMessage = textToSend;
    if (attachments.length > 0) {
      const attachedText = attachments
        .map((a) => `\n\n\`\`\`${a.name}\n${a.content}\n\`\`\``)
        .join("");
      fullUserMessage += attachedText;
      setAttachments([]);
    }

    if (overridePrompt === undefined) {
      setInputPrompt("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }

    const tempUserMsg: Message = { id: `u-${Date.now()}`, role: "user", content: fullUserMessage };
    const tempAssistantMsg: Message = { id: `a-${Date.now()}`, role: "assistant", content: "" };

    setMessages((prev) => [...prev, tempUserMsg, tempAssistantMsg]);
    setIsGenerating(true);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: fullUserMessage,
          system_prompt: customSystemPrompt,
          sampling_params: {
            temperature,
            top_p: topP,
            top_k: topK,
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

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n\n");

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
                if (parsed.stats.tps) {
                  setTokensPerSec(parsed.stats.tps);
                }
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
        toast.error("İletişim Hatası", "Model yanıt üretirken bir hata oluştu.");
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
      toast.info("Durduruldu", "Yanıt üretimi durduruldu.");
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRegenerate = async (msgIndex: number) => {
    // Find the prior user message
    let priorUserMessage = "";
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        priorUserMessage = messages[i].content;
        break;
      }
    }
    if (priorUserMessage) {
      // Drop messages from msgIndex onward
      setMessages((prev) => prev.slice(0, msgIndex));
      handleSendMessage(priorUserMessage);
    }
  };

  const handleBranchChat = async (msgIndex: number) => {
    try {
      const branchMessages = messages.slice(0, msgIndex + 1);
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Dal: ${branchMessages[0]?.content.slice(0, 20) || "Yeni Sohbet"}`,
        }),
      });
      if (res.ok) {
        const newChat = await res.json();
        setChats([newChat, ...chats]);
        setActiveChatId(newChat.id);
        setMessages(branchMessages);
        toast.success("Dal Oluşturuldu", "Konuşma yeni bir sohbet koluna ayrıldı.");
      }
    } catch {
      toast.error("Hata", "Dal oluşturulamadı.");
    }
  };

  const handleSaveEdit = (msgIndex: number) => {
    if (!editingContent.trim()) return;
    const updated = [...messages];
    updated[msgIndex].content = editingContent;
    setMessages(updated.slice(0, msgIndex + 1));
    setEditingMessageId(null);
    handleSendMessage(editingContent);
  };

  // Estimate total tokens in conversation
  const totalTokens = messages.reduce(
    (acc, m) => acc + (m.tokens_out || Math.ceil(m.content.length / 4)),
    0
  );
  const contextCapacity = activeStatus?.config?.ctx_size || 4096;
  const contextPercent = Math.min(100, Math.round((totalTokens / contextCapacity) * 100));

  const filteredChats = chats.filter((c) =>
    c.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full w-full overflow-hidden bg-background">
        {/* Left: Chat history & folders */}
        <div className="w-64 border-r border-border bg-card/40 flex flex-col shrink-0 select-none hidden md:flex">
          {/* Header & New Chat button */}
          <div className="p-3 border-b border-border space-y-2">
            <button
              onClick={handleCreateChat}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow-subtle hover:bg-primary/90 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{t("chat.new_chat")}</span>
            </button>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <input
                type="text"
                placeholder={t("chat.search_chats")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-card-muted/70 border border-border text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
              />
            </div>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredChats.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {t("chat.no_chats")}
              </div>
            ) : (
              filteredChats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => selectChat(chat.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all text-left group ${
                    activeChatId === chat.id
                      ? "bg-primary/10 border border-primary/25 text-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent"
                  }`}
                >
                  <MessageSquare
                    className={`w-3.5 h-3.5 shrink-0 ${
                      activeChatId === chat.id ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <span className="truncate flex-1">{chat.title || t("chat.new_chat")}</span>
                </button>
              ))
            )}
          </div>

          {/* Context Meter Footer */}
          <div className="p-3 border-t border-border bg-card-muted/40">
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5 font-mono">
              <span>{t("chat.context_meter")}</span>
              <span className={contextPercent > 80 ? "text-warning" : "text-primary"}>
                {totalTokens} / {contextCapacity} ({contextPercent}%)
              </span>
            </div>
            <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  contextPercent > 85 ? "bg-warning" : "bg-primary"
                }`}
                style={{ width: `${contextPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Center: Messages stream & Composer */}
        <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          {/* Subheader bar */}
          <div className="h-10 border-b border-border bg-card/30 px-4 flex items-center justify-between text-xs text-muted-foreground shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground truncate max-w-[240px]">
                {chats.find((c) => c.id === activeChatId)?.title || "Aktif Sohbet"}
              </span>
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                {messages.length} mesaj
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDebugModal(true)}
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="İstem Hata Ayıklama"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="text-[11px]">İstem Hata Ayıkla</span>
              </button>
              <button
                onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded border transition-colors ${
                  showSettingsDrawer
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span className="text-[11px]">Parametreler</span>
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center">
                <EmptyState
                  icon={Sparkles}
                  title="Yeni Bir Sohbet Başlatın"
                  description="Yerel modelinizle kodlama, tersine mühendislik veya genel analizler hakkında konuşun."
                  action={{
                    label: "Örnek Soru Gönder",
                    onClick: () =>
                      handleSendMessage("Giggle Studio'nun mimarisi ve RTX 5070 optimizasyonları nelerdir?"),
                  }}
                />
              </div>
            ) : (
              messages.map((msg, index) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  index={index}
                  isCopied={copiedId === msg.id}
                  isGenerating={isGenerating && index === messages.length - 1}
                  isEditing={editingMessageId === msg.id}
                  editingContent={editingContent}
                  setEditingContent={setEditingContent}
                  onSaveEdit={() => handleSaveEdit(index)}
                  onCancelEdit={() => setEditingMessageId(null)}
                  onStartEdit={() => {
                    setEditingMessageId(msg.id);
                    setEditingContent(msg.content);
                  }}
                  onCopy={() => handleCopy(msg.id, msg.content)}
                  onRegenerate={() => handleRegenerate(index)}
                  onBranch={() => handleBranchChat(index)}
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Composer */}
          <div className="p-3 md:p-4 border-t border-border bg-card/60 backdrop-blur-md shrink-0">
            {/* Attachment preview tags */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachments.map((att, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card border border-border text-xs text-foreground"
                  >
                    <FileText className="w-3 h-3 text-primary" />
                    <span className="font-mono">{att.name}</span>
                    <button
                      onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground hover:text-destructive ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl border border-border bg-card shadow-subtle focus-within:border-primary/60 transition-colors p-2 flex flex-col">
              <textarea
                ref={textareaRef}
                value={inputPrompt}
                onChange={handleTextareaInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={t("chat.composer_placeholder")}
                rows={1}
                disabled={isGenerating}
                className="w-full bg-transparent resize-none outline-none text-xs md:text-sm text-foreground placeholder:text-muted-foreground p-1.5 max-h-[180px] font-sans"
              />

              <div className="flex items-center justify-between pt-2 border-t border-border/50 mt-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <label className="p-1.5 rounded-lg hover:bg-muted cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                    <Paperclip className="w-4 h-4" />
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (re) => {
                            setAttachments([
                              ...attachments,
                              { name: file.name, content: re.target?.result as string },
                            ]);
                          };
                          reader.readAsText(file);
                        }
                      }}
                    />
                  </label>
                  <span className="text-[11px] text-muted-foreground hidden sm:inline">
                    {t("chat.system_prompt_label")}: <strong className="text-foreground">{SYSTEM_PRESETS.find((p) => p.id === selectedPreset)?.name}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {isGenerating ? (
                    <button
                      onClick={handleStop}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold hover:bg-destructive/90 transition-colors shadow-subtle"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      <span>{t("chat.stop_button")}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSendMessage()}
                      disabled={!inputPrompt.trim() && attachments.length === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-subtle"
                    >
                      <span>{t("chat.send_button")}</span>
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Drawer: Sampling Parameters & System Presets */}
        {showSettingsDrawer && (
          <div className="w-72 border-l border-border bg-card/70 backdrop-blur-md p-4 flex flex-col overflow-y-auto select-none shrink-0 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-primary" />
                <span>{t("chat.sampling_drawer_title")}</span>
              </h3>
              <button
                onClick={() => setShowSettingsDrawer(false)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 pt-4 text-xs">
              {/* Presets */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground">Sistem Rolü</label>
                <select
                  value={selectedPreset}
                  onChange={(e) => {
                    const preset = SYSTEM_PRESETS.find((p) => p.id === e.target.value);
                    if (preset) {
                      setSelectedPreset(preset.id);
                      setCustomSystemPrompt(preset.prompt);
                    }
                  }}
                  className="w-full p-2 rounded-lg bg-card border border-border text-xs text-foreground outline-none focus:border-primary"
                >
                  {SYSTEM_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <textarea
                  value={customSystemPrompt}
                  onChange={(e) => setCustomSystemPrompt(e.target.value)}
                  rows={3}
                  className="w-full mt-1.5 p-2 rounded-lg bg-card-muted/60 border border-border text-[11px] text-foreground font-mono outline-none resize-none focus:border-primary/50"
                />
              </div>

              {/* Temperature */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sıcaklık (Temperature)</span>
                  <span className="font-mono text-primary font-semibold">{temperature}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="2.0"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>

              {/* Top P */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Top-P</span>
                  <span className="font-mono text-primary font-semibold">{topP}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={topP}
                  onChange={(e) => setTopP(parseFloat(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>

              {/* Top K */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Top-K</span>
                  <span className="font-mono text-primary font-semibold">{topK}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={topK}
                  onChange={(e) => setTopK(parseInt(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>

              {/* Max Tokens */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Maksimum Token</span>
                  <span className="font-mono text-primary font-semibold">{maxTokens}</span>
                </div>
                <input
                  type="range"
                  min="128"
                  max="8192"
                  step="128"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>

              {/* Repeat Penalty */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tekrar Cezası</span>
                  <span className="font-mono text-primary font-semibold">{repeatPenalty}</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="1.5"
                  step="0.05"
                  value={repeatPenalty}
                  onChange={(e) => setRepeatPenalty(parseFloat(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* Rendered Prompt Debug Modal */}
        <Dialog open={showDebugModal} onOpenChange={setShowDebugModal}>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Oluşturulan İstem Hata Ayıklama (Rendered Prompt)</DialogTitle>
              <DialogDescription>
                LLM arka ucuna iletilen birleştirilmiş sistem ve kullanıcı bağlamı.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto p-3 rounded-lg bg-card-muted/80 border border-border font-mono text-xs text-foreground whitespace-pre-wrap">
              {`<|im_start|>system\n${customSystemPrompt}<|im_end|>\n` +
                messages
                  .map((m) => `<|im_start|>${m.role}\n${m.content}<|im_end|>`)
                  .join("\n")}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

// Sub-component for individual message cards
interface MessageBubbleProps {
  msg: Message;
  index: number;
  isCopied: boolean;
  isGenerating: boolean;
  isEditing: boolean;
  editingContent: string;
  setEditingContent: (val: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onCopy: () => void;
  onRegenerate: () => void;
  onBranch: () => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  msg,
  isCopied,
  isGenerating,
  isEditing,
  editingContent,
  setEditingContent,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onCopy,
  onRegenerate,
  onBranch,
}) => {
  const [showThinking, setShowThinking] = useState(false);

  // Check for <think>...</think> blocks
  let thinkingContent = "";
  let cleanContent = msg.content;
  const thinkMatch = msg.content.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    thinkingContent = thinkMatch[1].trim();
    cleanContent = msg.content.replace(/<think>[\s\S]*?<\/think>/, "").trim();
  }

  const isUser = msg.role === "user";

  return (
    <div
      className={`flex flex-col group ${
        isUser ? "items-end" : "items-start"
      } animate-fade-in`}
    >
      {/* Role and metadata badge */}
      <div className="flex items-center gap-2 mb-1 px-1 text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">
          {isUser ? "Siz" : "Giggle Asistan"}
        </span>
        {!isUser && msg.tps && msg.tps > 0 && (
          <span className="font-mono text-success text-[10px] tabular-nums">
            {msg.tps.toFixed(1)} t/s
          </span>
        )}
        {!isUser && msg.ttft_ms && msg.ttft_ms > 0 && (
          <span className="font-mono text-muted-foreground text-[10px]">
            {msg.ttft_ms}ms TTFT
          </span>
        )}
      </div>

      {/* Bubble card */}
      <div
        className={`max-w-[85%] md:max-w-[75%] rounded-2xl p-4 text-xs md:text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground font-medium shadow-subtle"
            : "bg-card border border-border/80 text-foreground shadow-card"
        }`}
      >
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editingContent}
              onChange={(e) => setEditingContent(e.target.value)}
              className="w-full p-2 rounded-lg bg-background text-foreground border border-border text-xs outline-none focus:border-primary"
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={onCancelEdit}
                className="px-2.5 py-1 rounded bg-secondary text-secondary-foreground text-xs"
              >
                İptal
              </button>
              <button
                onClick={onSaveEdit}
                className="px-2.5 py-1 rounded bg-primary text-primary-foreground text-xs font-semibold"
              >
                Kaydet & Gönder
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Collapsible Thinking block */}
            {thinkingContent && (
              <div className="mb-3 rounded-lg border border-border/80 bg-card-muted/40 overflow-hidden">
                <button
                  onClick={() => setShowThinking(!showThinking)}
                  className="w-full flex items-center justify-between p-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-card-muted/60 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span>Düşünce Süreci (Akıl Yürütme)</span>
                  </span>
                  {showThinking ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                {showThinking && (
                  <div className="p-3 text-[11px] font-mono text-muted-foreground border-t border-border/60 whitespace-pre-wrap leading-normal bg-card-muted/20">
                    {thinkingContent}
                  </div>
                )}
              </div>
            )}

            {/* Markdown content with custom code block renderer */}
            <div className="prose prose-invert max-w-none break-words">
              <ReactMarkdown
                components={{
                  code({ node, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "");
                    const isInline = !match && !String(children).includes("\n");
                    const codeText = String(children).replace(/\n$/, "");

                    if (isInline) {
                      return (
                        <code
                          className="px-1.5 py-0.5 rounded bg-muted font-mono text-[11px] text-foreground border border-border/60"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    }

                    return (
                      <CodeBlock
                        language={match ? match[1] : "text"}
                        code={codeText}
                      />
                    );
                  },
                }}
              >
                {cleanContent}
              </ReactMarkdown>

              {isGenerating && !cleanContent && (
                <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
              )}
            </div>
          </>
        )}
      </div>

      {/* Per-message actions row */}
      {!isEditing && (
        <div className="flex items-center gap-1 mt-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground">
          <button
            onClick={onCopy}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Kopyala"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {isUser ? (
            <button
              onClick={onStartEdit}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Düzenle"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <>
              <button
                onClick={onRegenerate}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Yeniden Üret"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onBranch}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Yeni Dala Ayır"
              >
                <GitBranch className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// Shiki-style code block with language chip, wrap toggle, and copy
const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-xl border border-border bg-card-muted/70 overflow-hidden font-mono text-xs">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card/90">
        <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
          {language}
        </span>
        <div className="flex items-center gap-2 text-muted-foreground">
          <button
            onClick={() => setWrap(!wrap)}
            className={`p-1 rounded hover:bg-muted transition-colors ${
              wrap ? "text-primary" : "text-muted-foreground"
            }`}
            title="Metin Kaydırma"
          >
            <WrapText className="w-3 h-3" />
          </button>
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Kodu Kopyala"
          >
            {copied ? (
              <Check className="w-3 h-3 text-success" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            <span className="text-[10px]">{copied ? "Kopyalandı" : "Kopyala"}</span>
          </button>
        </div>
      </div>
      {/* Code Content */}
      <pre
        className={`p-3 text-[11px] leading-relaxed text-foreground/90 overflow-x-auto ${
          wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"
        }`}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
};
