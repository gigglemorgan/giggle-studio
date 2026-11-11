import React, { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  Play,
  Shield,
  FileCode,
  FolderOpen,
  Terminal,
  Download,
  Wrench,
  Plus,
  Trash2,
} from "lucide-react";

export const CodePage: React.FC = () => {
  const [workspaceId] = useState<string>("default");
  const [files, setFiles] = useState<any[]>([]);
  const [activeFile, setActiveFile] = useState<string>("main.py");
  const [fileContent, setFileContent] = useState<string>(
    '# Giggle Studio Sandbox Execution\nimport sys\n\nprint(f"Running securely inside sandbox with Python {sys.version}")\n'
  );
  const [outputTerminal, setOutputTerminal] = useState<string>("");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [sandboxInfo, setSandboxInfo] = useState<any>(null);
  const [newFileName, setNewFileName] = useState<string>("");
  const [showNewFileModal, setShowNewFileModal] = useState<boolean>(false);

  const loadFiles = async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/files`);
      const data = await res.json();
      setFiles(data);
      if (data.length > 0 && !data.some((f: any) => f.path === activeFile)) {
        loadFileContent(data[0].path);
      }
    } catch (err) {
      console.error("Dosyalar alınamadı:", err);
    }
  };

  const loadFileContent = async (path: string) => {
    try {
      setActiveFile(path);
      const res = await fetch(`/api/workspaces/${workspaceId}/files/content?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      setFileContent(data.content);
    } catch (err) {
      console.error("Dosya içeriği okunamadı:", err);
    }
  };

  const loadSandboxStatus = async () => {
    try {
      const res = await fetch("/api/workspaces/sandbox-status");
      const data = await res.json();
      setSandboxInfo(data);
    } catch {}
  };

  useEffect(() => {
    loadFiles();
    loadSandboxStatus();
  }, [workspaceId]);

  const handleSaveFile = async (content?: string) => {
    const textToSave = content !== undefined ? content : fileContent;
    try {
      await fetch(`/api/workspaces/${workspaceId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: activeFile, content: textToSave }),
      });
      loadFiles();
    } catch (err) {
      console.error("Dosya kaydedilemedi:", err);
    }
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim()) return;
    await handleSaveFile("");
    setActiveFile(newFileName.trim());
    setFileContent("");
    setShowNewFileModal(false);
    setNewFileName("");
    await fetch(`/api/workspaces/${workspaceId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: newFileName.trim(), content: "" }),
    });
    loadFiles();
  };

  const handleDeleteFile = async (path: string) => {
    await fetch(`/api/workspaces/${workspaceId}/files?path=${encodeURIComponent(path)}`, {
      method: "DELETE",
    });
    loadFiles();
  };

  const handleRunCode = async () => {
    await handleSaveFile();
    setIsRunning(true);
    setOutputTerminal("⏳ Kumhavuzunda çalıştırılıyor...\n");

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
      termOutput += `\n\n[Çıkış Kodu: ${data.exit_code} | Süre: ${data.duration_ms} ms | Yalıtım: ${data.isolation_level}]`;

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

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-950">
      {/* Workspace Files Sidebar */}
      <div className="w-60 border-r border-slate-800 bg-slate-900/40 p-3 flex flex-col justify-between">
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
              Çalışma Alanı
            </span>
            <button
              onClick={() => setShowNewFileModal(true)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
              title="Yeni Dosya"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1 overflow-y-auto max-h-[calc(100vh-250px)]">
            {files.map((f) => (
              <div
                key={f.path}
                className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition ${
                  activeFile === f.path
                    ? "bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
                onClick={() => loadFileContent(f.path)}
              >
                <div className="flex items-center gap-2 truncate">
                  <FileCode className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{f.path}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteFile(f.path);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-0.5"
                  title="Sil"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2 pt-3 border-t border-slate-800/80">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-950 border border-slate-800/80 text-[11px] text-emerald-400">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Yalıtım: {sandboxInfo?.active_backend?.toUpperCase() || "BWRAP"}</span>
          </div>
          <button
            onClick={handleExportZip}
            className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Zip İndir</span>
          </button>
        </div>
      </div>

      {/* Center Monaco Multi-file Editor & Terminal Split */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Editor Toolbar */}
        <div className="h-12 border-b border-slate-800 bg-slate-900/60 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <FileCode className="w-4 h-4 text-blue-400" />
            <span className="font-mono text-slate-200 font-semibold">{activeFile}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRunCode}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-500/20 transition disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>{isRunning ? "Çalışıyor..." : "Kumhavuzunda Çalıştır"}</span>
            </button>
          </div>
        </div>

        {/* Monaco Editor Pane */}
        <div className="flex-1 overflow-hidden relative">
          <Editor
            height="100%"
            theme="vs-dark"
            path={activeFile}
            defaultLanguage={activeFile.endsWith(".py") ? "python" : "shell"}
            value={fileContent}
            onChange={(val) => setFileContent(val || "")}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "JetBrains Mono, Fira Code, monospace",
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>

        {/* Output Terminal Pane */}
        <div className="h-48 border-t border-slate-800 bg-slate-950 flex flex-col">
          <div className="h-8 border-b border-slate-800 px-4 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-semibold text-slate-300">Terminal & Kumhavuzu Çıktısı</span>
            </div>
            {outputTerminal.includes("[STDERR]") && (
              <button
                onClick={() => {
                  /* Pre-fills chat with traceback */
                  alert("Hata teşhisi paneli: " + outputTerminal);
                }}
                className="flex items-center gap-1 text-[11px] text-amber-400 hover:underline font-medium"
              >
                <Wrench className="w-3 h-3" />
                <span>Bu Hatayı Düzelt</span>
              </button>
            )}
          </div>
          <pre className="flex-1 p-3 font-mono text-xs text-slate-300 overflow-y-auto whitespace-pre-wrap select-text">
            {outputTerminal || "Henüz bir komut çalıştırılmadı. 'Kumhavuzunda Çalıştır' butonuna basarak kodu test edebilirsiniz."}
          </pre>
        </div>
      </div>

      {/* New file modal */}
      {showNewFileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 w-80 space-y-4">
            <h4 className="text-sm font-semibold text-slate-100">Yeni Dosya Oluştur</h4>
            <input
              type="text"
              placeholder="örn: script.py"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewFileModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300"
              >
                İptal
              </button>
              <button
                onClick={handleCreateFile}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-xs text-white font-semibold"
              >
                Oluştur
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
