import React, { useEffect, useState, Suspense, lazy } from "react";
import { Navbar } from "./components/Navbar";
import { Sidebar, NavTab } from "./components/Sidebar";
import { ToastContainer } from "./components/ui/Toast";
import { CommandPalette } from "./components/CommandPalette";
import { KeyboardShortcutsModal } from "./components/KeyboardShortcutsModal";
import { OnboardingModal } from "./components/OnboardingModal";
import { SystemStatusResponse, fetchSystemStatus } from "./lib/api";
import { useThemeStore } from "./store/themeStore";
import { useModelStore } from "./store/modelStore";
import { Skeleton } from "./components/ui/StatusStates";

// Code-split pages with dynamic imports for optimal bundle sizes
const ResourcesPage = lazy(() =>
  import("./pages/ResourcesPage").then((m) => ({ default: m.ResourcesPage }))
);
const DoctorPage = lazy(() =>
  import("./pages/DoctorPage").then((m) => ({ default: m.DoctorPage }))
);
const ModelsPage = lazy(() =>
  import("./pages/ModelsPage").then((m) => ({ default: m.ModelsPage }))
);
const ChatPage = lazy(() =>
  import("./pages/ChatPage").then((m) => ({ default: m.ChatPage }))
);
const CodePage = lazy(() =>
  import("./pages/CodePage").then((m) => ({ default: m.CodePage }))
);
const AgentPage = lazy(() =>
  import("./pages/AgentPage").then((m) => ({ default: m.AgentPage }))
);
const TrainingPage = lazy(() =>
  import("./pages/TrainingPage").then((m) => ({ default: m.TrainingPage }))
);
const REPage = lazy(() =>
  import("./pages/REPage").then((m) => ({ default: m.REPage }))
);
const GmailPage = lazy(() =>
  import("./pages/GmailPage").then((m) => ({ default: m.GmailPage }))
);
const PluginsPage = lazy(() =>
  import("./pages/PluginsPage").then((m) => ({ default: m.PluginsPage }))
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>("chat");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  const [statusData, setStatusData] = useState<SystemStatusResponse | undefined>();

  const initTheme = useThemeStore((s) => s.initTheme);
  const fetchActiveStatus = useModelStore((s) => s.fetchActiveStatus);

  const loadStatus = async () => {
    try {
      const data = await fetchSystemStatus();
      setStatusData(data);
    } catch (err) {
      console.error("Failed to fetch system status", err);
    }
  };

  useEffect(() => {
    initTheme();
    loadStatus();
    fetchActiveStatus();

    // Check first-run onboarding
    const onboarded = localStorage.getItem("giggle-onboarded");
    if (!onboarded) {
      setOnboardingOpen(true);
    }

    const interval = setInterval(() => {
      loadStatus();
      fetchActiveStatus();
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Global keybindings
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      // Toggle sidebar: Ctrl + B
      if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }
      // Toggle theme: Ctrl + M
      if ((e.ctrlKey || e.metaKey) && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        useThemeStore.getState().toggleTheme();
      }
      // Quick tabs 1-9 (only if not typing in an input)
      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)
      ) {
        const tabMap: Record<string, NavTab> = {
          "1": "chat",
          "2": "code",
          "3": "agent",
          "4": "models",
          "5": "training",
          "6": "re",
          "7": "gmail",
          "8": "plugins",
          "9": "resources",
        };
        if (tabMap[e.key]) {
          setCurrentTab(tabMap[e.key]);
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeys);
    return () => window.removeEventListener("keydown", handleGlobalKeys);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden font-sans select-none">
      <Navbar
        statusData={statusData}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onNavigateToModels={() => setCurrentTab("models")}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        <main className="flex-1 overflow-hidden bg-background relative flex flex-col">
          <Suspense
            fallback={
              <div className="flex-1 p-8 space-y-4">
                <Skeleton className="w-1/3 h-8" />
                <Skeleton className="w-full h-48" />
                <Skeleton className="w-full h-64" />
              </div>
            }
          >
            {currentTab === "chat" && <ChatPage />}
            {currentTab === "code" && <CodePage />}
            {currentTab === "agent" && <AgentPage />}
            {currentTab === "models" && <ModelsPage />}
            {currentTab === "training" && <TrainingPage />}
            {currentTab === "re" && <REPage />}
            {currentTab === "gmail" && <GmailPage />}
            {currentTab === "plugins" && <PluginsPage />}
            {currentTab === "resources" && (
              <ResourcesPage statusData={statusData} onRefresh={loadStatus} />
            )}
            {currentTab === "doctor" && <DoctorPage />}
            {currentTab === "settings" && <SettingsPage />}
          </Suspense>
        </main>
      </div>

      {/* Global Modals & Notifications */}
      <ToastContainer />

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onSelectTab={setCurrentTab}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />

      <OnboardingModal
        open={onboardingOpen}
        onOpenChange={setOnboardingOpen}
        statusData={statusData}
        onNavigateToChat={() => setCurrentTab("chat")}
      />
    </div>
  );
};
