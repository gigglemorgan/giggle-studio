import React from "react";
import { useToastStore, ToastItem } from "../../store/toastStore";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from "lucide-react";

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      role="region"
      aria-label="Bildirimler"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};

const ToastCard: React.FC<{ toast: ToastItem; onClose: () => void }> = ({ toast, onClose }) => {
  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-success shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-warning shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-destructive shrink-0" />,
    info: <Info className="w-5 h-5 text-info shrink-0" />,
  };

  const borderClasses = {
    success: "border-success/30",
    warning: "border-warning/30",
    error: "border-destructive/30",
    info: "border-info/30",
  };

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 p-3.5 bg-card/95 backdrop-blur-md border ${borderClasses[toast.type]} rounded-lg shadow-card text-card-foreground animate-fade-in transition-all`}
      role="alert"
    >
      {icons[toast.type]}
      <div className="flex-1 min-w-0">
        <h4 className="text-xs font-semibold leading-tight">{toast.title}</h4>
        {toast.message && (
          <p className="text-xs text-muted-foreground mt-0.5 break-words">{toast.message}</p>
        )}
      </div>
      <button
        onClick={onClose}
        className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
        aria-label="Kapat"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
