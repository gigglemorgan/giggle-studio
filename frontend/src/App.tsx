import React, { useEffect, useState } from "react";
import { Navbar } from "./components/Navbar";
import { Sidebar, NavTab } from "./components/Sidebar";
import { ResourcesPage } from "./pages/ResourcesPage";
import { DoctorPage } from "./pages/DoctorPage";
import { ModelsPage } from "./pages/ModelsPage";
import { ChatPage } from "./pages/ChatPage";
import { CodePage } from "./pages/CodePage";
import { AgentPage } from "./pages/AgentPage";
import { PluginsPage } from "./pages/PluginsPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { SystemStatusResponse, fetchSystemStatus } from "./lib/api";

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>("resources");
  const [statusData, setStatusData] = useState<SystemStatusResponse | undefined>();

  const loadStatus = async () => {
    try {
      const data = await fetchSystemStatus();
      setStatusData(data);
    } catch (err) {
      console.error("Failed to fetch system status", err);
    }
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 4000); // 4-second telemetry poll
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <Navbar statusData={statusData} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar currentTab={currentTab} onSelectTab={setCurrentTab} />
        <main className="flex-1 overflow-y-auto bg-slate-950/80">
          {currentTab === "resources" && (
            <ResourcesPage statusData={statusData} onRefresh={loadStatus} />
          )}
          {currentTab === "doctor" && <DoctorPage />}
          {currentTab === "models" && <ModelsPage />}
          {currentTab === "chat" && <ChatPage />}
          {currentTab === "code" && <CodePage />}
          {currentTab === "agent" && <AgentPage />}
          {currentTab === "training" && (
            <PlaceholderPage
              title="Eğitim Stüdyosu (LoRA / QLoRA SFT)"
              description="12 GB VRAM için optimize edilmiş 4-bit NF4 ince ayar, preflight dry-run ve GGUF dışa aktarımı."
              phase="Faz 5"
            />
          )}
          {currentTab === "re" && (
            <PlaceholderPage
              title="Tersine Mühendislik (Reverse Engineering)"
              description="Statik ikili analizi, çağrı çizgesi özetleyicisi ve kanıt alıntılı yapay zeka analiz raporları."
              phase="Faz 4c & 4d"
            />
          )}
          {currentTab === "gmail" && (
            <PlaceholderPage
              title="Gmail Entegrasyonu"
              description="Yerel OAuth 2.0 PKCE, şifreli anahtarlık saklama ve onaylı e-posta araçları."
              phase="Faz 4b"
            />
          )}
          {currentTab === "plugins" && <PluginsPage />}
          {currentTab === "settings" && (
            <PlaceholderPage
              title="Ayarlar"
              description="Sunucu parametreleri, veri yolları, OpenAI uyumluluk anahtarları ve izinler."
              phase="Faz 1 / Devam"
            />
          )}
        </main>
      </div>
    </div>
  );
};
