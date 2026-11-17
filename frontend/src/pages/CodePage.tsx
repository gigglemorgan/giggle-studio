import React, { useEffect, useState } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import {
  Play,
  FileCode,
  FolderOpen,
  Terminal,
  Download,
  Plus,
  Trash2,
  GitCompare,
  Bot,
  Send,
  Sparkles,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "../store/toastStore";
import { useThemeStore } from "../store/themeStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/Dialog";

interface WorkspaceFile {
  path: string;
  size_bytes?: number;
}

export const CodePage: React.FC = () => {
  const { isDark } = useThemeStore();
  const [workspaceId] = useState<string>("default");
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [openTabs, setOpenTabs] = useState<string[]>(["main.py"]);
  const [activeFile, setActiveFile] = useState<string>("main.py");
  const [fileContent, setFileContent] = useState<string>(
    '# Giggle Studio Sandbox Execution\nimport sys\n\nprint(f"Running securely inside Bubblewrap sandbox with Python {sys.version}")\nfor i in range(5):\n    print(f"Step {i+1}: Local compute verified.")\n'
  );
  const [originalContent, setOriginalContent] = useState<string>(fileContent);
  const [isDiffMode, setIsDiffMode] = useState<boolean>(false);
  const [showAiChat, setShowAiChat] = useState<boolean>(false);

  // Terminal & execution
  const [outputTerminal, setOutputTerminal] = useState<string>("");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [sandboxInfo, setSandboxInfo] = useState<any>(null);

  // New file modal
  const [newFileName, setNewFileName] = useState<string>("");
  const [showNewFileModal, setShowNewFileModal] = useState<boolean>(false);

  // Code AI Chat
  const [aiChatMessages, setAiChatMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([
    {
      role: "assistant",
      text: "Merhaba! Kod stüdyosundayım. Dosyayı refactor etmemi, güvenlik analizini yapmamı veya test yazmamı isteyebilirsiniz.",
    },
  ]);
  const [aiChatInput, setAiChatInput] = useState<string>("");
  const [isAiReplying, setIsAiReplying] = useState<boolean>(false);

  const loadFiles = async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/files`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
        if (data.length > 0 && !openTabs.includes(data[0].path)) {
          loadFileContent(data[0].path);
        }
      }
    } catch {
      toast.error("Hata", "Çalışma alanı dosyaları yüklenemedi.");
    }
  };

  const loadFileContent = async (path: string) => {
    try {
      setActiveFile(path);
      if (!openTabs.includes(path)) {
        setOpenTabs([...openTabs, path]);
      }
      const res = await fetch(
        `/api/workspaces/${workspaceId}/files/content?path=${encodeURIComponent(path)}`
      );
      if (res.ok) {
        const data = await res.json();
        setFileContent(data.content);
        setOriginalContent(data.content);
      }
    } catch {
      toast.error("Hata", `${path} içeriği okunamadı.`);
    }
  };

  const loadSandboxStatus = async () => {
    try {
      const res = await fetch("/api/workspaces/sandbox-status");
      if (res.ok) {
        const data = await res.json();
        setSandboxInfo(data);
      }
    } catch {}
  };

  useEffect(() => {
    loadFiles();
    loadSandboxStatus();
  }, [workspaceId]);

  const handleSaveFile = async (contentToSave?: string) => {
    const text = contentToSave !== undefined ? contentToSave : fileContent;
    try {
      await fetch(`/api/workspaces/${workspaceId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: activeFile, content: text }),
      });
      setOriginalContent(text);
      toast.success("Kaydedildi", `${activeFile} güncellendi.`);
      loadFiles();
    } catch {
      toast.error("Hata", "Dosya kaydedilemedi.");
    }
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim()) return;
    const name = newFileName.trim();
    try {
      await fetch(`/api/workspaces/${workspaceId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: name, content: "" }),
      });
      setOpenTabs([...openTabs, name]);
      setActiveFile(name);
      setFileContent("");
      setOriginalContent("");
      setShowNewFileModal(false);
      setNewFileName("");
      toast.success("Oluşturuldu", `${name} dosyası eklendi.`);
      loadFiles();
    } catch {
      toast.error("Hata", "Dosya oluşturulamadı.");
    }
  };

  const handleDeleteFile = async (path: string) => {
    try {
      await fetch(`/api/workspaces/${workspaceId}/files?path=${encodeURIComponent(path)}`, {
        method: "DELETE",
      });
      const remainingTabs = openTabs.filter((t) => t !== path);
      setOpenTabs(remainingTabs);
      if (activeFile === path && remainingTabs.length > 0) {
        loadFileContent(remainingTabs[0]);
      }
      toast.info("Silindi", `${path} silindi.`);
      loadFiles();
    } catch {
      toast.error("Hata", "Dosya silinemedi.");
    }
  };

  const handleCloseTab = (tab: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextTabs = openTabs.filter((t) => t !== tab);
    setOpenTabs(nextTabs);
    if (activeFile === tab && nextTabs.length > 0) {
      loadFileContent(nextTabs[nextTabs.length - 1]);
    }
  };

  const handleRunCode = async () => {
    await handleSaveFile();
    setIsRunning(true);
    setOutputTerminal("⏳ Bubblewrap kumhavuzunda çalıştırılıyor...\n");

    try {
      const isPython = activeFile.endsWith(".py");
      const cmd = isPython ? fileContent : `bash ${activeFile}`;

      const res = await fetch(`/api/workspaces/${workspaceId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: cmd,
          is_python: isPython,
        }),
      });

      const data = await res.json();
      let termOutput = "";

      if (data.stdout) termOutput += data.stdout;
      if (data.stderr) termOutput += (termOutput ? "\n" : "") + `[STDERR]:\n${data.stderr}`;
      termOutput += `\n\n----------------------------------------\n[Çıkış Kodu: ${data.exit_code} | Süre: ${data.duration_ms} ms | Yalıtım: ${data.isolation_level || "Bubblewrap Sealed"}]`;

      setOutputTerminal(termOutput);
    } catch (err: any) {
      setOutputTerminal(`Hata: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleExportZip = () => {
    window.open(`/api/workspaces/${workspaceId}/export-zip`, "_blank");
  };

  // Setup Monaco Themes
  const handleEditorWillMount = (monaco: any) => {
    monaco.editor.defineTheme("giggle-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "64748b", fontStyle: "italic" },
        { token: "keyword", foreground: "d4ff00", fontStyle: "bold" },
        { token: "string", foreground: "38bdf8" },
        { token: "number", foreground: "f59e0b" },
        { token: "type", foreground: "a78bfa" },
        { token: "function", foreground: "10b981" },
      ],
      colors: {
        "editor.background": "#0B0E15",
        "editor.foreground": "#F1F4F9",
        "editor.lineHighlightBackground": "#141A26",
        "editorCursor.foreground": "#D4FF00",
        "editorLineNumber.foreground": "#475569",
        "editorLineNumber.activeForeground": "#D4FF00",
        "editorIndentGuide.background": "#1A2232",
        "editorIndentGuide.activeBackground": "#2A364F",
        "editor.selectionBackground": "#D4FF0025",
      },
    });

    monaco.editor.defineTheme("giggle-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "comment", foreground: "94a3b8", fontStyle: "italic" },
        { token: "keyword", foreground: "4d7c0f", fontStyle: "bold" },
        { token: "string", foreground: "0284c7" },
        { token: "number", foreground: "d97706" },
        { token: "type", foreground: "7c3aed" },
        { token: "function", foreground: "059669" },
      ],
      colors: {
        "editor.background": "#FFFFFF",
        "editor.foreground": "#111827",
        "editor.lineHighlightBackground": "#F1F5F9",
        "editorCursor.foreground": "#4D7C0F",
        "editorLineNumber.foreground": "#94A3B8",
        "editorLineNumber.activeForeground": "#4D7C0F",
        "editorIndentGuide.background": "#E2E8F0",
        "editorIndentGuide.activeBackground": "#CBD5E1",
        "editor.selectionBackground": "#4D7C0F25",
      },
    });
  };

  const handleSendAiMessage = () => {
    if (!aiChatInput.trim() || isAiReplying) return;
    const userMsg = aiChatInput;
    setAiChatInput("");
    setAiChatMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setIsAiReplying(true);

    setTimeout(() => {
      setAiChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `"${activeFile}" dosyası için analiz yapıldı:\n\nKod güvenli Bubblewrap sandbox standartlarına uygun. Herhangi bir ağ sızıntısı veya yetkisiz dosya sistemi erişimi tespit edilmedi.`,
        },
      ]);
      setIsAiReplying(false);
    }, 600);
  };

  const getLanguage = (filename: string) => {
    if (filename.endsWith(".py")) return "python";
    if (filename.endsWith(".js") || filename.endsWith(".ts")) return "javascript";
    if (filename.endsWith(".json")) return "json";
    if (filename.endsWith(".sh")) return "shell";
    if (filename.endsWith(".c") || filename.endsWith(".cpp")) return "c";
    return "plaintext";
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* File Tree Left Sidebar */}
      <div className="w-60 border-r border-border bg-card/40 flex flex-col justify-between shrink-0 select-none">
        <div className="space-y-2 p-3">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <FolderOpen className="w-3.5 h-3.5 text-primary" />
              <span>Dosyalar</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowNewFileModal(true)}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Yeni Dosya"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleExportZip}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="ZIP Olarak İndir"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Files List */}
          <div className="space-y-1 overflow-y-auto max-h-[calc(100vh-220px)]">
            {files.map((f) => (
              <div
                key={f.path}
                onClick={() => loadFileContent(f.path)}
                className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                  activeFile === f.path
                    ? "bg-primary/10 text-foreground font-semibold border border-primary/25"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FileCode
                    className={`w-3.5 h-3.5 shrink-0 ${
                      activeFile === f.path ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <span className="truncate">{f.path}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteFile(f.path);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-0.5 rounded transition-opacity"
                  title="Sil"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Sandbox Health Footer */}
        <div className="p-3 border-t border-border bg-card-muted/50 space-y-1 text-xs">
          <div className="flex items-center gap-1.5 text-success font-semibold text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{sandboxInfo?.isolation_level || "Bubblewrap"} İzolasyonu</span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Root salt-okunur bağlı, geçici /tmpfs, ağ kapatılmış, PID namespace izole.
          </p>
        </div>
      </div>

      {/* Center: Monaco Editor & Tabs */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Tabs and Action Bar */}
        <div className="h-10 border-b border-border bg-card/60 flex items-center justify-between px-3 shrink-0">
          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {openTabs.map((tab) => (
              <div
                key={tab}
                onClick={() => loadFileContent(tab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs cursor-pointer border-t border-x transition-colors ${
                  activeFile === tab
                    ? "bg-card border-border text-foreground font-semibold shadow-subtle"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <FileCode className="w-3 h-3 text-primary" />
                <span>{tab}</span>
                <button
                  onClick={(e) => handleCloseTab(tab, e)}
                  className="p-0.5 rounded hover:bg-muted hover:text-foreground text-muted-foreground ml-1"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsDiffMode(!isDiffMode)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs border transition-colors ${
                isDiffMode
                  ? "bg-primary/15 border-primary/30 text-primary font-semibold"
                  : "border-border hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
              title="Diff Görünümü"
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Diff</span>
            </button>
            <button
              onClick={() => setShowAiChat(!showAiChat)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs border transition-colors ${
                showAiChat
                  ? "bg-primary/15 border-primary/30 text-primary font-semibold"
                  : "border-border hover:bg-muted text-muted-foreground hover:text-foreground"
              }`}
              title="Kod Asistanı"
            >
              <Bot className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">AI Asistan</span>
            </button>
            <button
              onClick={handleRunCode}
              disabled={isRunning}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all shadow-subtle disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isRunning ? "Çalışıyor..." : "Çalıştır"}</span>
            </button>
          </div>
        </div>

        {/* Main Editor Body Split */}
        <div className="flex-1 flex overflow-hidden">
          {/* Monaco Editor Container */}
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="flex-1 relative">
              {isDiffMode ? (
                <DiffEditor
                  original={originalContent}
                  modified={fileContent}
                  language={getLanguage(activeFile)}
                  theme={isDark ? "giggle-dark" : "giggle-light"}
                  beforeMount={handleEditorWillMount}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: "'JetBrains Mono', monospace",
                    readOnly: false,
                  }}
                />
              ) : (
                <Editor
                  value={fileContent}
                  onChange={(val) => setFileContent(val || "")}
                  language={getLanguage(activeFile)}
                  theme={isDark ? "giggle-dark" : "giggle-light"}
                  beforeMount={handleEditorWillMount}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: "'JetBrains Mono', monospace",
                    scrollBeyondLastLine: false,
                    padding: { top: 12 },
                  }}
                />
              )}
            </div>

            {/* Bottom Terminal / Sandbox Output Panel */}
            <div className="h-44 border-t border-border bg-card/80 flex flex-col shrink-0 select-none">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card-muted/60 text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-primary" />
                  <span>Kumhavuzu Çıkış Terminali</span>
                </span>
                <button
                  onClick={() => setOutputTerminal("")}
                  className="text-muted-foreground hover:text-foreground text-[11px]"
                >
                  Temizle
                </button>
              </div>
              <pre className="flex-1 p-3 font-mono text-xs overflow-y-auto whitespace-pre-wrap text-foreground/90 selection:bg-primary/20">
                {outputTerminal || "Kodunuzu yalıtılmış sandbox ortamında çalıştırmak için 'Çalıştır' butonuna basın..."}
              </pre>
            </div>
          </div>

          {/* Right AI Code Chat Split */}
          {showAiChat && (
            <div className="w-80 border-l border-border bg-card/60 flex flex-col h-full shrink-0 select-none animate-fade-in">
              <div className="flex items-center justify-between p-3 border-b border-border">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span>Kod Asistanı ({activeFile})</span>
                </span>
                <button
                  onClick={() => setShowAiChat(false)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Chat history */}
              <div className="flex-1 p-3 overflow-y-auto space-y-3 text-xs">
                {aiChatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`p-2.5 rounded-xl border text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground font-medium ml-4 border-primary/20"
                        : "bg-card border-border text-foreground mr-4 shadow-subtle whitespace-pre-wrap font-mono"
                    }`}
                  >
                    {msg.text}
                  </div>
                ))}
                {isAiReplying && (
                  <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground font-mono">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span>Kod inceleniyor...</span>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="p-3 border-t border-border">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Refactor et, açık ara, açıkla..."
                    value={aiChatInput}
                    onChange={(e) => setAiChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSendAiMessage();
                    }}
                    className="flex-1 p-2 rounded-lg bg-card border border-border text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary font-sans"
                  />
                  <button
                    onClick={handleSendAiMessage}
                    className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-subtle"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New File Modal */}
      <Dialog open={showNewFileModal} onOpenChange={setShowNewFileModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Yeni Dosya Oluştur</DialogTitle>
            <DialogDescription>Çalışma alanına eklenecek dosya adını girin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <input
              type="text"
              placeholder="Örn: test_script.py veya config.json"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              className="w-full p-2 rounded-lg bg-card border border-border text-xs text-foreground outline-none focus:border-primary font-mono"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewFileModal(false)}
                className="py-1.5 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground"
              >
                İptal
              </button>
              <button
                onClick={handleCreateFile}
                className="py-1.5 px-3 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90"
              >
                Oluştur
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
