import React, { useEffect, useState } from "react";
import {
  Blocks,
  Server,
  Plus,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Sliders,
  Shield,
  Activity,
  AlertCircle,
} from "lucide-react";

interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  permissions: string[];
  tools_count: number;
  enabled: boolean;
}

interface MCPServerInfo {
  id: string;
  name: string;
  transport: string;
  command_or_url: string;
  enabled: boolean;
  status: string;
  connected: boolean;
}

export const PluginsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"plugins" | "mcp">("plugins");
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [mcpServers, setMcpServers] = useState<MCPServerInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // New MCP Modal state
  const [showAddMcp, setShowAddMcp] = useState(false);
  const [mcpName, setMcpName] = useState("");
  const [mcpCommand, setMcpCommand] = useState("");
  const [mcpTransport, setMcpTransport] = useState("stdio");

  const loadData = async () => {
    setIsLoading(true);
    try {
      const pRes = await fetch("/api/plugins");
      if (pRes.ok) {
        setPlugins(await pRes.json());
      }
      const mRes = await fetch("/api/plugins/mcp/servers");
      if (mRes.ok) {
        setMcpServers(await mRes.json());
      }
    } catch (err) {
      console.error("Failed to fetch plugins or MCP data", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const togglePlugin = async (id: string, current: boolean) => {
    try {
      await fetch(`/api/plugins/${id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !current }),
      });
      setPlugins((prev) =>
        prev.map((p) => (p.id === id ? { ...p, enabled: !current } : p))
      );
    } catch (err) {
      console.error("Toggle error:", err);
    }
  };

  const handleAddMcp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mcpName.trim() || !mcpCommand.trim()) return;

    try {
      const res = await fetch("/api/plugins/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: mcpName,
          transport: mcpTransport,
          command_or_url: mcpCommand,
        }),
      });
      if (res.ok) {
        setShowAddMcp(false);
        setMcpName("");
        setMcpCommand("");
        loadData();
      }
    } catch (err) {
      console.error("Add MCP error:", err);
    }
  };

  const handleConnectMcp = async (serverId: string) => {
    try {
      await fetch(`/api/plugins/mcp/servers/${serverId}/connect`, {
        method: "POST",
      });
      loadData();
    } catch (err) {
      console.error("Connect error:", err);
    }
  };

  const handleDeleteMcp = async (serverId: string) => {
    try {
      await fetch(`/api/plugins/mcp/servers/${serverId}`, {
        method: "DELETE",
      });
      setMcpServers((prev) => prev.filter((s) => s.id !== serverId));
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Blocks className="w-7 h-7 text-indigo-400" />
            Eklentiler & MCP Sistemi (Plugins & MCP)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Giggle Studio eklenti ekosistemi ve harici Model Context Protocol istemcisi
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2 text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-6">
        <button
          onClick={() => setActiveTab("plugins")}
          className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "plugins"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sliders className="w-4 h-4" />
          Yüklü Eklentiler ({plugins.length})
        </button>
        <button
          onClick={() => setActiveTab("mcp")}
          className={`flex items-center gap-2 pb-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "mcp"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Server className="w-4 h-4" />
          MCP Sunucuları ({mcpServers.length})
        </button>
      </div>

      {/* Plugins Tab Content */}
      {activeTab === "plugins" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {plugins.map((plugin) => (
            <div
              key={plugin.id}
              className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-colors shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-100 text-base">
                      {plugin.name}
                    </h3>
                    <span className="text-xs text-slate-500 font-mono">
                      v{plugin.version} • {plugin.id}
                    </span>
                  </div>
                  <button
                    onClick={() => togglePlugin(plugin.id, plugin.enabled)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      plugin.enabled ? "bg-indigo-600" : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        plugin.enabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  {plugin.description}
                </p>
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <div className="flex flex-wrap gap-1.5">
                  {plugin.permissions.length === 0 ? (
                    <span className="text-[10px] bg-slate-800/80 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
                      Özel İzin Yok
                    </span>
                  ) : (
                    plugin.permissions.map((perm, i) => (
                      <span
                        key={i}
                        className="text-[10px] bg-amber-950/40 text-amber-300 border border-amber-800/50 px-2 py-0.5 rounded font-mono flex items-center gap-1"
                      >
                        <Shield className="w-2.5 h-2.5" />
                        {perm}
                      </span>
                    ))
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Yazar: {plugin.author}</span>
                  <span className="text-indigo-400 font-mono">
                    {plugin.tools_count} Araç
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MCP Servers Tab Content */}
      {activeTab === "mcp" && (
        <div className="space-y-5">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-400">
              Model Context Protocol (MCP) stdio sunucuları doğrudan Giggle Agent araçlarına bağlanır.
            </p>
            <button
              onClick={() => setShowAddMcp(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" /> Sunucu Ekle
            </button>
          </div>

          {/* Add MCP Form Modal */}
          {showAddMcp && (
            <form
              onSubmit={handleAddMcp}
              className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4 shadow-xl"
            >
              <h3 className="text-sm font-bold text-slate-200">
                Yeni MCP Sunucusu Tanımla
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    Sunucu Adı
                  </label>
                  <input
                    type="text"
                    value={mcpName}
                    onChange={(e) => setMcpName(e.target.value)}
                    placeholder="Örn: Filesystem Server"
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    İletişim Türü (Transport)
                  </label>
                  <select
                    value={mcpTransport}
                    onChange={(e) => setMcpTransport(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100"
                  >
                    <option value="stdio">stdio (Alt İşlem)</option>
                    <option value="sse">sse (HTTP SSE)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Komut ve Argümanlar
                </label>
                <input
                  type="text"
                  value={mcpCommand}
                  onChange={(e) => setMcpCommand(e.target.value)}
                  placeholder="Örn: npx -y @modelcontextprotocol/server-filesystem /path/to/dir"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-100 font-mono"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddMcp(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold"
                >
                  Kaydet
                </button>
              </div>
            </form>
          )}

          {/* Servers list */}
          <div className="space-y-3">
            {mcpServers.length === 0 && (
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-sm">
                Henüz kayıtlı bir MCP sunucusu yok. &quot;Sunucu Ekle&quot; ile yeni bir MCP istemcisi bağlayabilirsiniz.
              </div>
            )}

            {mcpServers.map((srv) => (
              <div
                key={srv.id}
                className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex items-center justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-200">
                      {srv.name}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1 ${
                        srv.connected
                          ? "bg-emerald-950/70 border border-emerald-700 text-emerald-300"
                          : "bg-slate-800 border border-slate-700 text-slate-400"
                      }`}
                    >
                      {srv.connected ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          Bağlı
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3 h-3 text-slate-400" />
                          Bağlantı Yok
                        </>
                      )}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    [{srv.transport}] {srv.command_or_url}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleConnectMcp(srv.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors"
                  >
                    <Activity className="w-3.5 h-3.5 text-indigo-400" />
                    {srv.connected ? "Yeniden Bağlan" : "Bağlan"}
                  </button>
                  <button
                    onClick={() => handleDeleteMcp(srv.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
