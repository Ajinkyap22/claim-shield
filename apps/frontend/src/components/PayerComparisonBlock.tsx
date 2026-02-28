"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Building2, BarChart3, Loader2, Info } from "lucide-react";
import { getScoreConfig } from "@/components/ScoreGauge";
import type { PayerComparisonItem } from "@/types/compliance";
import { fetchPayerComparison } from "@/api/compliance";

const TOOLTIP_COPY =
  "Useful for multi-payer practices and contracting. This runs a separate check and does not affect your main compliance result.";

function getStatusDisplay(item: PayerComparisonItem): {
  label: string;
  bg: string;
  textColor: string;
  border: string;
} {
  if (item.score != null) {
    const config = getScoreConfig(item.score);
    return {
      label: config.label,
      bg: config.bg,
      textColor: config.textColor,
      border: config.bg,
    };
  }
  if (item.statusLabel) {
    const lower = item.statusLabel.toLowerCase();
    if (lower.includes("ok") || lower.includes("low") || lower.includes("pass"))
      return { label: item.statusLabel, bg: "#dcfce7", textColor: "#15803d", border: "#bbf7d0" };
    if (lower.includes("review") || lower.includes("moderate"))
      return { label: item.statusLabel, bg: "#fef9c3", textColor: "#a16207", border: "#fde68a" };
    return { label: item.statusLabel, bg: "#ffedd5", textColor: "#c2410c", border: "#fed7aa" };
  }
  return { label: "—", bg: "#f1f5f9", textColor: "#64748b", border: "#e2e8f0" };
}

export function PayerComparisonBlock() {
  const [data, setData] = useState<PayerComparisonItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCompare = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPayerComparison();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // CTA: user hasn't requested comparison yet
  if (data == null && !loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="rounded-2xl overflow-hidden border-2 border-teal-400 bg-teal-50"
        style={{
          boxShadow: "0 4px 20px rgba(13, 148, 136, 0.15)",
        }}
      >
        <div className="px-5 py-5 sm:px-6 sm:py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className="flex items-center justify-center w-12 h-12 rounded-xl shrink-0 bg-teal-600"
              style={{
                boxShadow: "0 4px 12px rgba(13, 148, 136, 0.35)",
              }}
            >
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3
                className="font-display mb-1 text-slate-800"
                style={{ fontSize: "1rem", fontWeight: 700 }}
              >
                How this claim might fare with other major payers
              </h3>
              <p
                className="mb-2 text-slate-600"
                style={{ fontSize: "0.8rem", lineHeight: 1.5 }}
              >
                Compare against UnitedHealthcare and Aetna. Runs separately so your main check stays fast and cost-efficient.
              </p>
              <span
                className="inline-flex items-center gap-1 text-slate-500"
                style={{ fontSize: "0.72rem" }}
                title={TOOLTIP_COPY}
              >
                <Info className="w-3.5 h-3.5" />
                {TOOLTIP_COPY}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCompare}
            className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-display font-semibold text-white bg-slate-800 hover:bg-slate-700 active:bg-slate-900 transition-colors hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-2"
            style={{
              fontSize: "0.9rem",
              boxShadow: "0 2px 8px rgba(15, 39, 68, 0.25)",
            }}
          >
            <Building2 className="w-4 h-4" />
            Compare with top providers
          </button>
        </div>
      </motion.div>
    );
  }

  // Loading
  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-2xl overflow-hidden border-2 border-teal-300 bg-teal-50 px-5 py-10 flex flex-col items-center justify-center gap-4"
      >
        <Loader2 className="w-10 h-10 text-teal-600 animate-spin" />
        <p className="font-display text-slate-800" style={{ fontSize: "0.95rem", fontWeight: 600 }}>
          Comparing with UnitedHealthcare &amp; Aetna…
        </p>
        <p className="text-slate-600" style={{ fontSize: "0.8rem" }}>
          This does not affect your main compliance result.
        </p>
      </motion.div>
    );
  }

  // Error
  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-2xl border-2 border-red-200 bg-red-50/50 px-5 py-5"
      >
        <p className="text-red-700" style={{ fontSize: "0.9rem", fontWeight: 600 }}>{error}</p>
        <button
          type="button"
          onClick={handleCompare}
          className="mt-3 text-teal-600 hover:text-teal-700 font-medium"
          style={{ fontSize: "0.8rem" }}
        >
          Try again
        </button>
      </motion.div>
    );
  }

  // Data: show UHC + Aetna in a highlighted block
  const list = data ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="rounded-2xl overflow-hidden border-2 border-teal-400 bg-teal-50"
      style={{
        boxShadow: "0 6px 24px rgba(13, 148, 136, 0.18)",
      }}
    >
      <div className="px-5 py-3.5 flex items-center gap-3 bg-teal-700">
        <Building2 className="w-5 h-5 text-white shrink-0" />
        <span className="font-display text-white" style={{ fontSize: "1rem", fontWeight: 700 }}>
          How this claim might fare with other major payers
        </span>
        <span
          className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 bg-white/20 text-white"
          style={{ fontSize: "0.7rem", fontWeight: 500 }}
          title={TOOLTIP_COPY}
        >
          <Info className="w-3.5 h-3.5" />
          Informational
        </span>
      </div>
      <p className="px-5 pt-3 text-slate-600" style={{ fontSize: "0.75rem", lineHeight: 1.5 }}>
        {TOOLTIP_COPY}
      </p>
      <div className="p-4 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {list.map((item) => {
          const display = getStatusDisplay(item);
          return (
            <div
              key={item.payerName}
              className="rounded-xl border border-slate-200 p-4 bg-white shadow-sm transition-shadow hover:shadow-md"
              style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
            >
              <p
                className="font-display text-slate-800 mb-3"
                style={{ fontSize: "1rem", fontWeight: 700 }}
              >
                {item.payerName}
              </p>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {item.score != null && (
                  <span
                    className="rounded-lg px-2.5 py-1 font-mono font-bold"
                    style={{
                      fontSize: "1rem",
                      backgroundColor: display.bg,
                      color: display.textColor,
                      border: `2px solid ${display.border}`,
                    }}
                  >
                    {item.score}
                  </span>
                )}
                <span
                  className="rounded-lg px-2.5 py-1 font-semibold"
                  style={{
                    fontSize: "0.8rem",
                    backgroundColor: display.bg,
                    color: display.textColor,
                    border: `2px solid ${display.border}`,
                  }}
                >
                  {display.label}
                </span>
              </div>
              {item.note && (
                <p className="text-slate-600" style={{ fontSize: "0.8rem", lineHeight: 1.5 }}>
                  {item.note}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
