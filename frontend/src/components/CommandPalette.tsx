import React, { useEffect } from "react";
import { Command } from "cmdk";
import {
  MessageSquare,
  Code,
  Bot,
  Layers,
  GraduationCap,
  Cpu,
  Mail,
  Boxes,
  Activity,
  Settings,
  Stethoscope,
  Trash2,
  Sun,
  Moon,
  Search,
  Sparkles,
  Languages,
} from "lucide-react";
import { freeMemory } from "../lib/api";
import { toast } from "../store/toastStore";
import { useThemeStore } from "../store/themeStore";
import { useLanguageStore } from "../i18n";
import { NavTab } from "./Sidebar";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTab: (tab: NavTab) => void;
  onOpenShortcuts: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  onSelectTab,
  onOpenShortcuts,
}) => {
  const { toggleTheme, isDark } = useThemeStore();
  const { language, toggleLanguage, t } = useLanguageStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const handleFreeMemory = async () => {
    onOpenChange(false);
    try {
      const res = await freeMemory();
      toast.success(t("resources.free_memory_success"), res.message_tr || t("command_palette.free_memory_success"));
    } catch {
      toast.error(t("common.error"), t("command_palette.free_memory_error"));
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-start justify-center pt-24 px-4 animate-fade-in"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-border bg-card shadow-overlay overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label={t("command_palette.title")} className="w-full">
          <div className="flex items-center px-3.5 border-b border-border bg-card-muted/50">
            <Search className="w-4 h-4 text-muted-foreground mr-2 shrink-0" />
            <Command.Input
              placeholder={t("command_palette.placeholder")}
              className="w-full bg-transparent py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none font-sans"
              autoFocus
            />
            <kbd className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded border border-border font-mono">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2 space-y-1">
            <Command.Empty className="p-4 text-center text-xs text-muted-foreground">
              {t("command_palette.empty")}
            </Command.Empty>

            <Command.Group heading={t("command_palette.heading_pages")} className="text-[11px] font-semibold text-muted-foreground px-2 py-1 uppercase tracking-wider">
              <Command.Item
                onSelect={() => {
                  onSelectTab("chat");
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer text-foreground hover:bg-muted hover:text-primary transition-colors"
              >
                <MessageSquare className="w-4 h-4 text-primary shrink-0" />
                <span>{t("command_palette.page_chat")}</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  onSelectTab("code");
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer text-foreground hover:bg-muted hover:text-primary transition-colors"
              >
                <Code className="w-4 h-4 text-primary shrink-0" />
                <span>{t("command_palette.page_code")}</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  onSelectTab("agent");
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer text-foreground hover:bg-muted hover:text-primary transition-colors"
              >
                <Bot className="w-4 h-4 text-primary shrink-0" />
                <span>{t("command_palette.page_agent")}</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  onSelectTab("models");
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer text-foreground hover:bg-muted hover:text-primary transition-colors"
              >
                <Layers className="w-4 h-4 text-primary shrink-0" />
                <span>{t("command_palette.page_models")}</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  onSelectTab("training");
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer text-foreground hover:bg-muted hover:text-primary transition-colors"
              >
                <GraduationCap className="w-4 h-4 text-primary shrink-0" />
                <span>{t("command_palette.page_training")}</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  onSelectTab("re");
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer text-foreground hover:bg-muted hover:text-primary transition-colors"
              >
                <Cpu className="w-4 h-4 text-primary shrink-0" />
                <span>{t("command_palette.page_re")}</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  onSelectTab("gmail");
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer text-foreground hover:bg-muted hover:text-primary transition-colors"
              >
                <Mail className="w-4 h-4 text-primary shrink-0" />
                <span>{t("command_palette.page_gmail")}</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  onSelectTab("plugins");
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer text-foreground hover:bg-muted hover:text-primary transition-colors"
              >
                <Boxes className="w-4 h-4 text-primary shrink-0" />
                <span>{t("command_palette.page_plugins")}</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  onSelectTab("resources");
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer text-foreground hover:bg-muted hover:text-primary transition-colors"
              >
                <Activity className="w-4 h-4 text-primary shrink-0" />
                <span>{t("command_palette.page_resources")}</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  onSelectTab("doctor");
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer text-foreground hover:bg-muted hover:text-primary transition-colors"
              >
                <Stethoscope className="w-4 h-4 text-primary shrink-0" />
                <span>{t("command_palette.page_settings")} (Doctor)</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  onSelectTab("settings");
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer text-foreground hover:bg-muted hover:text-primary transition-colors"
              >
                <Settings className="w-4 h-4 text-primary shrink-0" />
                <span>{t("command_palette.page_settings")}</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading={t("command_palette.heading_actions")} className="text-[11px] font-semibold text-muted-foreground px-2 py-1 uppercase tracking-wider mt-2">
              <Command.Item
                onSelect={handleFreeMemory}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer text-foreground hover:bg-muted hover:text-warning transition-colors"
              >
                <Trash2 className="w-4 h-4 text-warning shrink-0" />
                <span>{t("command_palette.action_free_memory")}</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  toggleLanguage();
                  onOpenChange(false);
                  toast.info(
                    language === "tr" ? "Language Changed" : "Dil Değiştirildi",
                    language === "tr" ? "Switched to English interface." : "Türkçe arayüze geçildi."
                  );
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer text-foreground hover:bg-muted hover:text-primary transition-colors"
              >
                <Languages className="w-4 h-4 text-primary shrink-0" />
                <span>{t("command_palette.action_toggle_language")} ({language === "tr" ? "English" : "Türkçe"})</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  toggleTheme();
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer text-foreground hover:bg-muted hover:text-primary transition-colors"
              >
                {isDark ? (
                  <Sun className="w-4 h-4 text-primary shrink-0" />
                ) : (
                  <Moon className="w-4 h-4 text-primary shrink-0" />
                )}
                <span>{t("command_palette.action_toggle_theme")}</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  onOpenChange(false);
                  onOpenShortcuts();
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer text-foreground hover:bg-muted hover:text-primary transition-colors"
              >
                <Sparkles className="w-4 h-4 text-primary shrink-0" />
                <span>{t("command_palette.action_shortcuts")}</span>
              </Command.Item>
            </Command.Group>
          </Command.List>

          <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-card-muted/30 text-[11px] text-muted-foreground">
            <span>&uarr;&darr; Enter</span>
            <span>Giggle Studio v0.1.0</span>
          </div>
        </Command>
      </div>
    </div>
  );
};
