import React from "react";
import { Layers } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  description: string;
  phase: string;
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ title, description, phase }) => {
  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">{title}</h2>
        <p className="text-sm text-slate-400 mt-1">{description}</p>
      </div>

      <div className="p-8 rounded-xl bg-slate-900/40 border border-slate-800 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-blue-600/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
          <Layers className="w-6 h-6" />
        </div>
        <h3 className="font-semibold text-slate-200">Geliştirme Aşamasında ({phase})</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Bu modül Giggle Studio otonom geliştirme planı kapsamında bir sonraki aşamada aktif edilecektir.
        </p>
      </div>
    </div>
  );
};
