import React, { useEffect, useState } from "react";
import { Stethoscope, CheckCircle2, AlertTriangle, Info, RefreshCw, ShieldCheck } from "lucide-react";
import { DoctorResponse, fetchDoctorDiagnostics } from "../lib/api";
import { t } from "../i18n";

export const DoctorPage: React.FC = () => {
  const [report, setReport] = useState<DoctorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDoctor = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchDoctorDiagnostics();
      setReport(data);
    } catch (err: any) {
      setError(err.message || "Teşhis çalıştırılamadı");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDoctor();
  }, []);

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-3">
            <Stethoscope className="w-6 h-6 text-blue-500" />
            <span>{t("doctor.title")}</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Donanım, CUDA ortamı, Linux kumhavuzu (bwrap/seccomp) ve tersine mühendislik araçlarının durum kontrolü.
          </p>
        </div>
        <button
          onClick={loadDoctor}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          <span>{loading ? t("common.loading") : t("doctor.run_diagnostics")}</span>
        </button>
      </div>

      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
        <span>
          <strong>Gizlilik Koruması:</strong> Sistem Doktoru çıktıları otomatik olarak sansürlenir (redacted); kullanıcı adları, ev dizini yolları ve belirteçler asla açığa çıkmaz. Hata bildirimlerinde güvenle paylaşabilirsiniz.
        </span>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/60 border border-red-800/60 text-red-200 text-sm">
          {error}
        </div>
      )}

      {report && (
        <div className="space-y-4">
          <div className={`p-4 rounded-xl border flex items-center gap-3 ${
            report.status === "healthy"
              ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
              : "bg-amber-950/40 border-amber-800/60 text-amber-300"
          }`}>
            {report.status === "healthy" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            )}
            <span className="font-semibold text-sm">
              {report.status === "healthy" ? t("doctor.status_healthy") : t("doctor.status_warning")}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/40 divide-y divide-slate-800">
            {report.checks.map((check, idx) => (
              <div key={idx} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {check.status === "pass" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    {check.status === "warn" && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                    {check.status === "fail" && <AlertTriangle className="w-4 h-4 text-red-400" />}
                    {check.status === "info" && <Info className="w-4 h-4 text-blue-400" />}
                    <span className="font-medium text-slate-200 text-sm">{check.name}</span>
                  </div>
                  <div className="text-xs text-slate-400 flex flex-wrap gap-x-4">
                    <span>{t("doctor.target")}: <code className="text-slate-300 font-mono">{check.target}</code></span>
                    <span>{t("doctor.measured")}: <code className="text-blue-300 font-mono">{check.measured}</code></span>
                  </div>
                </div>

                {check.fix && (
                  <div className="text-xs px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-amber-300 font-mono">
                    {check.fix}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
