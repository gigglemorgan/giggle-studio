import React from "react";
import { AlertCircle, RefreshCw, HelpCircle, LucideIcon, Sparkles } from "lucide-react";
import { t } from "../../i18n";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Sparkles,
  title,
  description,
  action,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-border bg-card/40 my-4 ${className}`}
    >
      <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-3.5 shadow-subtle">
        <Icon className="w-6 h-6 stroke-[1.75]" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-sm mb-4 leading-relaxed">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors shadow-subtle"
        >
          {action.icon && <action.icon className="w-3.5 h-3.5" />}
          {action.label}
        </button>
      )}
    </div>
  );
};

interface FriendlyErrorProps {
  title?: string;
  message: string;
  fixHint?: string;
  onRetry?: () => void;
  className?: string;
}

export const FriendlyError: React.FC<FriendlyErrorProps> = ({
  title,
  message,
  fixHint,
  onRetry,
  className = "",
}) => {
  const displayTitle = title || t("status_states.error_title");
  return (
    <div
      className={`flex items-start gap-3.5 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-card-foreground my-3 ${className}`}
      role="alert"
    >
      <div className="w-8 h-8 rounded-lg bg-destructive/15 border border-destructive/25 flex items-center justify-center text-destructive shrink-0 mt-0.5">
        <AlertCircle className="w-4 h-4 stroke-[2]" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-xs font-semibold text-destructive">{displayTitle}</h4>
        <p className="text-xs text-foreground/80 mt-0.5 leading-relaxed break-words">{message}</p>
        {fixHint && (
          <div className="mt-2.5 p-2 rounded-md bg-background/80 border border-border text-[11px] text-muted-foreground flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>
              <strong className="text-foreground">{t("status_states.fix_hint_label")}</strong> {fixHint}
            </span>
          </div>
        )}
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-border bg-card hover:bg-card-muted text-foreground transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            {t("common.retry")}
          </button>
        )}
      </div>
    </div>
  );
};

export const Skeleton: React.FC<{ className?: string }> = ({ className = "" }) => {
  return (
    <div
      className={`animate-pulse rounded bg-muted/70 ${className}`}
      aria-hidden="true"
    />
  );
};

export const CardSkeleton: React.FC<{ rows?: number }> = ({ rows = 3 }) => {
  return (
    <div className="p-4 rounded-xl border border-border bg-card/60 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="w-8 h-8 rounded-lg" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="w-1/3 h-3.5" />
          <Skeleton className="w-1/4 h-2.5" />
        </div>
      </div>
      <div className="space-y-2 pt-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="w-full h-3" />
        ))}
      </div>
    </div>
  );
};
