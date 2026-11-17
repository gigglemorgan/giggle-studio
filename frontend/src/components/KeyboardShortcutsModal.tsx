import React, { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/Dialog";
import { Keyboard } from "lucide-react";
import { useLanguageStore } from "../i18n";

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  open,
  onOpenChange,
}) => {
  const { t } = useLanguageStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === "?" || (e.key === "/" && e.shiftKey)) &&
        !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange]);

  const shortcuts = [
    { key: "Ctrl / ⌘ + K", desc: t("shortcuts.command_palette") },
    { key: "?", desc: t("shortcuts.help") },
    { key: "Ctrl + B", desc: t("shortcuts.toggle_sidebar") },
    { key: "Ctrl + M", desc: t("shortcuts.toggle_theme") },
    { key: "1 - 9", desc: t("shortcuts.quick_tabs") },
    { key: "Ctrl + Enter", desc: t("shortcuts.submit") },
    { key: "Esc", desc: t("shortcuts.close_modals") },
    { key: "A / D", desc: `${t("shortcuts.approve_agent")} / ${t("shortcuts.deny_agent")}` },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-1">
            <Keyboard className="w-5 h-5" />
            <DialogTitle>{t("shortcuts.title")}</DialogTitle>
          </div>
          <DialogDescription>
            {t("shortcuts.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          {shortcuts.map((sc, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-2 rounded-lg bg-card-muted/50 border border-border/60 text-xs"
            >
              <span className="text-foreground/90 font-medium">{sc.desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-card border border-border text-primary font-mono text-[11px] shadow-subtle shrink-0">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
