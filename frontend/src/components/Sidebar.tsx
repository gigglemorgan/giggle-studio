import React from "react";
import {
  MessageSquare,
  Code2,
  Bot,
  Layers,
  GraduationCap,
  Binary,
  Mail,
  Blocks,
  Activity,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  LucideIcon,
} from "lucide-react";
import { GiggleLogo } from "./GiggleLogo";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/Tooltip";
import { useLanguageStore } from "../i18n";

export type NavTab =
  | "chat"
  | "code"
  | "agent"
  | "models"
  | "training"
  | "re"
  | "gmail"
  | "plugins"
  | "resources"
  | "doctor"
  | "settings";

interface NavGroup {
  title: string;
  items: {
    id: NavTab;
    label: string;
    icon: LucideIcon;
    badge?: string;
  }[];
}

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  collapsed,
  onToggleCollapsed,
}) => {
  const { language, t } = useLanguageStore();

  const groups: NavGroup[] = [
    {
      title: t("nav.groups.production"),
      items: [
        { id: "chat", label: t("nav.chat"), icon: MessageSquare },
        { id: "code", label: t("nav.code"), icon: Code2 },
        { id: "agent", label: t("nav.agent"), icon: Bot },
      ],
    },
    {
      title: t("nav.groups.ai_system"),
      items: [
        { id: "models", label: t("nav.models"), icon: Layers },
        { id: "training", label: t("nav.training"), icon: GraduationCap },
        { id: "re", label: t("nav.re"), icon: Binary },
      ],
    },
    {
      title: t("nav.groups.integration"),
      items: [
        { id: "gmail", label: t("nav.gmail"), icon: Mail },
        { id: "plugins", label: t("nav.plugins"), icon: Blocks },
      ],
    },
    {
      title: t("nav.groups.management"),
      items: [
        { id: "resources", label: t("nav.resources"), icon: Activity },
        { id: "settings", label: t("nav.settings"), icon: SettingsIcon },
      ],
    },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        data-lang={language}
        className={`relative flex flex-col border-r border-border bg-card/60 backdrop-blur-md transition-all duration-normal ease-smooth select-none shrink-0 ${
          collapsed ? "w-16" : "w-60"
        }`}
        aria-label={t("shortcuts.toggle_sidebar")}
      >
        {/* Brand header */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border/80">
          <div className="flex items-center justify-center shrink-0">
            <GiggleLogo size={30} />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold tracking-tight text-foreground flex items-center gap-1.5 leading-none">
                Giggle <span className="text-primary text-[11px] font-mono font-medium px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20">Studio</span>
              </span>
              <span className="text-[10px] text-muted-foreground truncate mt-1">
                {t("app.subtitle")}
              </span>
            </div>
          )}
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {groups.map((group, groupIdx) => (
            <div key={groupIdx} className="space-y-1">
              {!collapsed && (
                <div className="px-2.5 pb-1 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/80">
                  {group.title}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id || (item.id === "settings" && currentTab === "doctor");

                const button = (
                  <button
                    onClick={() => onSelectTab(item.id)}
                    aria-label={item.label}
                    className={`w-full flex items-center gap-3 rounded-lg text-xs font-medium transition-all group ${
                      collapsed ? "justify-center p-2.5" : "px-3 py-2"
                    } ${
                      isActive
                        ? "bg-primary text-primary-foreground font-semibold shadow-subtle"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 stroke-[1.8] transition-transform group-hover:scale-105 ${
                        isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    />
                    {!collapsed && (
                      <span className="truncate flex-1 text-left leading-tight">
                        {item.label}
                      </span>
                    )}
                    {!collapsed && item.badge && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );

                if (collapsed) {
                  return (
                    <Tooltip key={item.id}>
                      <TooltipTrigger asChild>{button}</TooltipTrigger>
                      <TooltipContent side="right">
                        <span>{item.label}</span>
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return <div key={item.id}>{button}</div>;
              })}
            </div>
          ))}
        </div>

        {/* Footer info & collapse toggle */}
        <div className="p-2 border-t border-border/80 flex items-center justify-between">
          {!collapsed ? (
            <div className="px-2 py-1 flex items-center justify-between w-full">
              <span className="text-[11px] text-muted-foreground font-mono">
                v0.1.0 · RTX 5070
              </span>
              <button
                onClick={onToggleCollapsed}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Kenar Çubuğunu Daralt (Ctrl+B)"
                aria-label="Kenar Çubuğunu Daralt"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onToggleCollapsed}
              className="w-full flex justify-center p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Kenar Çubuğunu Genişlet (Ctrl+B)"
              aria-label="Kenar Çubuğunu Genişlet"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
};
