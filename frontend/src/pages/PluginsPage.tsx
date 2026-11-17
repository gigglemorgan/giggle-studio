import React, { useEffect, useState } from "react";
import {
  Blocks,
  Server,
  Plus,
  Trash2,
  RefreshCw,
  Shield,
  Check,
  Lock,
} from "lucide-react";
import { toast } from "../store/toastStore";
import { Switch } from "../components/ui/Switch";
import { EmptyState } from "../components/ui/StatusStates";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/Dialog";

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

  // Install / Permission prompt modal
  const [permissionPromptPlugin, setPermissionPromptPlugin] = useState<PluginInfo | null>(null);

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
    } catch {
      toast.error("Hata", "Eklentiler veya MCP sunucuları yüklenemedi.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleClick = (p: PluginInfo) => {
    if (!p.enabled && p.permissions && p.permissions.length > 0) {
      // Show permission prompt before enabling
      setPermissionPromptPlugin(p);
    } else {
      executeToggle(p.id, p.enabled);
    }
  };

  const executeToggle = async (id: string, current: boolean) => {
    try {
      await fetch(`/api/plugins/${id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !current }),
      });
      setPlugins((prev) =>
        prev.map((p) => (p.id === id ? { ...p, enabled: !current } : p))
      );
      toast.success(
        !current ? "Eklenti Etkinleştirildi" : "Eklenti Devre Dışı Bırakıldı",
        "Araç listesi güncellendi."
      );
    } catch {
      toast.error("Hata", "Eklenti durumu değiştirilemedi.");
    }
  };

  const handleConfirmPermissions = () => {
    if (permissionPromptPlugin) {
      executeToggle(permissionPromptPlugin.id, false);
      setPermissionPromptPlugin(null);
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
        toast.success("MCP Sunucusu Eklendi", `${mcpName} başarıyla kaydedildi.`);
        loadData();
      }
    } catch {
      toast.error("Hata", "MCP sunucusu eklenemedi.");
    }
  };

  const handleConnectMcp = async (serverId: string) => {
    try {
      await fetch(`/api/plugins/mcp/servers/${serverId}/connect`, { method: "POST" });
      toast.success("Bağlantı Kuruldu", "MCP sunucusu ile el sıkışma tamamlandı.");
      loadData();
    } catch {
      toast.error("Hata", "MCP sunucusuna bağlanılamadı.");
    }
  };

  const handleDeleteMcp = async (serverId: string) => {
    try {
      await fetch(`/api/plugins/mcp/servers/${serverId}`, { method: "DELETE" });
      toast.info("Silindi", "MCP sunucusu kaldırıldı.");
      loadData();
    } catch {
      toast.error("Hata", "MCP sunucusu silinemedi.");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Blocks className="w-6 h-6 text-primary" />
            <span>Eklenti Galerisi & MCP Sunucuları</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Giggle Studio Agent araçlarını eklentiler ve Model Context Protocol (MCP) ile genişletin.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "mcp" && (
            <button
              onClick={() => setShowAddMcp(true)}
              className="py-2 px-3.5 rounded-lg bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all shadow-subtle flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni MCP Sunucusu</span>
            </button>
          )}
          <button
            onClick={loadData}
            className="p-2 rounded-lg border border-border bg-card hover:bg-card-muted text-muted-foreground hover:text-foreground transition-colors shadow-subtle"
            title="Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <button
          onClick={() => setActiveTab("plugins")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === "plugins"
              ? "bg-primary text-primary-foreground shadow-subtle"
              : "text-muted-foreground hover:text-foreground hover:bg-card"
          }`}
        >
          <Blocks className="w-4 h-4" />
          <span>Eklenti Galerisi ({plugins.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("mcp")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === "mcp"
              ? "bg-primary text-primary-foreground shadow-subtle"
              : "text-muted-foreground hover:text-foreground hover:bg-card"
          }`}
        >
          <Server className="w-4 h-4" />
          <span>MCP Sunucuları ({mcpServers.length})</span>
        </button>
      </div>

      {/* TAB 1: PLUGINS GALLERY CARDS */}
      {activeTab === "plugins" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
          {plugins.length === 0 ? (
            <div className="col-span-full">
              <EmptyState
                icon={Blocks}
                title="Yüklü Eklenti Bulunamadı"
                description="'plugins/' dizininde kayıtlı eklenti bildirimleri otomatik olarak taranır."
              />
            </div>
          ) : (
            plugins.map((plugin) => (
              <div
                key={plugin.id}
                className="p-5 rounded-2xl bg-card border border-border shadow-card flex flex-col justify-between hover:border-border/80 transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{plugin.name}</h3>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        v{plugin.version} · {plugin.author}
                      </span>
                    </div>
                    <Switch
                      checked={plugin.enabled}
                      onCheckedChange={() => handleToggleClick(plugin)}
                    />
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {plugin.description}
                  </p>

                  {/* Permissions badges */}
                  {plugin.permissions && plugin.permissions.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                        İzinler:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {plugin.permissions.map((perm) => (
                          <span
                            key={perm}
                            className="px-2 py-0.5 rounded text-[10px] font-mono bg-card-muted/80 text-foreground/80 border border-border flex items-center gap-1"
                          >
                            <Shield className="w-2.5 h-2.5 text-primary" />
                            <span>{perm}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-border mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-mono">{plugin.tools_count} Kayıtlı Araç</span>
                  <span
                    className={`font-semibold ${
                      plugin.enabled ? "text-success" : "text-muted-foreground"
                    }`}
                  >
                    {plugin.enabled ? "Etkin" : "Devre Dışı"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: MCP SERVERS WITH HEALTH DOTS */}
      {activeTab === "mcp" && (
        <div className="space-y-4 animate-fade-in max-w-4xl">
          {mcpServers.length === 0 ? (
            <EmptyState
              icon={Server}
              title="MCP Sunucusu Kaydedilmedi"
              description="Model Context Protocol (MCP) stdio veya SSE sunucuları ekleyerek dosya sistemleri, veritabanları ve API araçlarını bağlayın."
              action={{
                label: "Yeni MCP Sunucusu Ekle",
                onClick: () => setShowAddMcp(true),
                icon: Plus,
              }}
            />
          ) : (
            mcpServers.map((server) => (
              <div
                key={server.id}
                className="p-4 rounded-xl bg-card border border-border shadow-card flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Health Dot */}
                  <span
                    className={`w-3 h-3 rounded-full shrink-0 ${
                      server.connected
                        ? "bg-success animate-pulse"
                        : server.status === "connecting"
                        ? "bg-warning animate-bounce"
                        : "bg-destructive/60"
                    }`}
                    title={server.connected ? "Bağlı ve Sağlıklı" : "Bağlantı Yok"}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-foreground truncate">{server.name}</h4>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-muted text-muted-foreground uppercase">
                        {server.transport}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">
                      {server.command_or_url}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!server.connected && (
                    <button
                      onClick={() => handleConnectMcp(server.id)}
                      className="py-1 px-3 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-colors shadow-subtle"
                    >
                      Bağlan
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteMcp(server.id)}
                    className="p-1.5 rounded-lg border border-border hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="Sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Permission Prompt Modal */}
      <Dialog
        open={Boolean(permissionPromptPlugin)}
        onOpenChange={(open) => {
          if (!open) setPermissionPromptPlugin(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary mb-1">
              <Lock className="w-5 h-5" />
              <DialogTitle>Eklenti İzinlerini Onaylayın</DialogTitle>
            </div>
            <DialogDescription>
              "{permissionPromptPlugin?.name}" eklentisini etkinleştirmek üzeresiniz. Eklenti aşağıdaki izinleri talep ediyor:
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 rounded-xl bg-card-muted/60 border border-border space-y-2 text-xs">
            <span className="font-semibold text-foreground block">Talep Edilen Erişimler:</span>
            <div className="space-y-1">
              {permissionPromptPlugin?.permissions?.map((p) => (
                <div key={p} className="flex items-center gap-2 text-foreground font-mono">
                  <Check className="w-3.5 h-3.5 text-primary" />
                  <span>{p}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setPermissionPromptPlugin(null)}
              className="py-1.5 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground"
            >
              Vazgeç
            </button>
            <button
              onClick={handleConfirmPermissions}
              className="py-1.5 px-4 rounded-lg bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 shadow-subtle"
            >
              İzinleri Onayla & Etkinleştir
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add MCP Server Modal */}
      <Dialog open={showAddMcp} onOpenChange={setShowAddMcp}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni MCP Sunucusu Ekle</DialogTitle>
            <DialogDescription>
              Yerel veya uzak bir Model Context Protocol sunucusu yapılandırın.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddMcp} className="space-y-3 mt-2 text-xs">
            <div className="space-y-1">
              <label className="text-muted-foreground">Sunucu Adı</label>
              <input
                type="text"
                placeholder="Örn: Filesystem MCP veya SQLite DB"
                value={mcpName}
                onChange={(e) => setMcpName(e.target.value)}
                required
                className="w-full p-2 rounded-lg bg-card border border-border text-foreground outline-none focus:border-primary font-sans"
              />
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground">İletim Protokolü (Transport)</label>
              <select
                value={mcpTransport}
                onChange={(e) => setMcpTransport(e.target.value)}
                className="w-full p-2 rounded-lg bg-card border border-border text-foreground outline-none font-mono"
              >
                <option value="stdio">stdio (Yerel Alt Süreç)</option>
                <option value="sse">sse (Server-Sent Events / HTTP)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground">Komut veya URL</label>
              <input
                type="text"
                placeholder="Örn: npx -y @modelcontextprotocol/server-filesystem /tmp"
                value={mcpCommand}
                onChange={(e) => setMcpCommand(e.target.value)}
                required
                className="w-full p-2 rounded-lg bg-card border border-border text-foreground outline-none focus:border-primary font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddMcp(false)}
                className="py-1.5 px-3 rounded-lg border border-border text-muted-foreground hover:text-foreground"
              >
                İptal
              </button>
              <button
                type="submit"
                className="py-1.5 px-4 rounded-lg bg-primary text-primary-foreground font-bold hover:bg-primary/90 shadow-subtle"
              >
                Kaydet ve Bağlan
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
