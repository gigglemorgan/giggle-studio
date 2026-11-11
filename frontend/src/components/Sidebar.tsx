import React from "react";
import {
  Activity,
  Layers,
  MessageSquare,
  Code2,
  Bot,
  GraduationCap,
  Binary,
  Mail,
  Blocks,
  Stethoscope,
  Settings as SettingsIcon,
} from "lucide-react";
import { t } from "../i18n";

export type NavTab =
  | "resources"
  | "models"
  | "chat"
  | "code"
  | "agent"
  | "training"
  | "re"
  | "gmail"
  | "plugins"
  | "doctor"
  | "settings";

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const navItems: { id: NavTab; labelKey: string; icon: React.FC<{ className?: string }> }[] = [
    { id: "resources", labelKey: "nav.dashboard", icon: Activity },
    { id: "models", labelKey: "nav.models", icon: Layers },
    { id: "chat", labelKey: "nav.chat", icon: MessageSquare },
    { id: "code", labelKey: "nav.code", icon: Code2 },
    { id: "agent", labelKey: "nav.agent", icon: Bot },
    { id: "training", labelKey: "nav.training", icon: GraduationCap },
    { id: "re", labelKey: "nav.re", icon: Binary },
    { id: "gmail", labelKey: "nav.gmail", icon: Mail },
    { id: "plugins", labelKey: "nav.plugins", icon: Blocks },
    { id: "doctor", labelKey: "nav.doctor", icon: Stethoscope },
    { id: "settings", labelKey: "nav.settings", icon: SettingsIcon },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/40 p-3 flex flex-col justify-between">
      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-400"}`} />
              <span>{t(item.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400 space-y-1">
        <p className="font-semibold text-slate-300">Giggle Studio</p>
        <p>12 GB VRAM & 16 GB RAM İyileştirmeli</p>
        <p className="text-[11px] text-slate-400">© Sedat-gigglemorgan</p>
      </div>
    </aside>
  );
};
