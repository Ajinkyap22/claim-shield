import { useRef, useState } from "react";
import { motion } from "motion/react";
import {
  CheckCircle2,
  Copy,
  Download,
  RotateCcw,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { ScoreGauge } from "@/components/ScoreGauge";
import { ClaimSummary } from "@/components/ClaimSummary";
import { DualAgentView } from "@/components/DualAgentView";
import { RecommendationsList } from "@/components/RecommendationsList";
import { ValidationIssues } from "@/components/ValidationIssues";
import type { ComplianceCheckResponse } from "@/types/compliance";
import { MOCK_COMPLIANCE_RESPONSE } from "@/api/compliance";
import { formatCitation } from "@/lib/formatCitation";
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

interface ResultsPanelProps {
  /** When provided (from API), overrides mock data. When null, UI uses internal mocks. */
  result?: ComplianceCheckResponse | null;
  onReset: () => void;
}

function fadeUp(delay: number = 0) {
  return {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: 0.45,
      delay,
      ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
    },
  };
}

const TOP_RECOMMENDATIONS_COPY = 5;

export function ResultsPanel({ result = null, onReset }: ResultsPanelProps) {
  const topRef = useRef<HTMLDivElement>(null);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [copySummaryFeedback, setCopySummaryFeedback] = useState<"idle" | "copied" | "error">("idle");
  const score = result?.score ?? MOCK_COMPLIANCE_RESPONSE.score;
  const scoreExplanation =
    result?.scoreExplanation ?? MOCK_COMPLIANCE_RESPONSE.scoreExplanation;
  const recommendations = result?.recommendations ?? MOCK_COMPLIANCE_RESPONSE.recommendations ?? [];

  const buildSummaryText = (): string => {
    const lines: string[] = [
      `Denial Risk Score: ${score}`,
      "",
      `Key finding: ${formatCitation(scoreExplanation)}`,
      "",
      "Recommendations:",
    ];
    const topRecs = recommendations.slice(0, TOP_RECOMMENDATIONS_COPY);
    topRecs.forEach((r) => {
      lines.push(`• ${r.title} — ${formatCitation(r.citation)}`);
    });
    return lines.join("\n");
  };

  const copySummaryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopySummary = async () => {
    if (copySummaryTimeoutRef.current) {
      clearTimeout(copySummaryTimeoutRef.current);
      copySummaryTimeoutRef.current = null;
    }
    try {
      await navigator.clipboard.writeText(buildSummaryText());
      setCopySummaryFeedback("copied");
      copySummaryTimeoutRef.current = setTimeout(() => setCopySummaryFeedback("idle"), 2000);
    } catch {
      setCopySummaryFeedback("error");
      copySummaryTimeoutRef.current = setTimeout(() => setCopySummaryFeedback("idle"), 2000);
    }
  };

  const handleExportPdf = async () => {
    const el = topRef.current;
    if (!el) return;
    setPdfExporting(true);
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL("image/png");
      const doc = new jsPDF({
        orientation: canvas.width > canvas.height ? "landscape" : "portrait",
        unit: "mm",
        format: "a4",
      });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const pxToMm = 25.4 / 96;
      const w = canvas.width * pxToMm;
      const h = canvas.height * pxToMm;
      // Prefer full width while keeping aspect ratio; if too tall, fit to page
      const scaleForFullWidth = pageW / w;
      const hAtFullWidth = h * scaleForFullWidth;
      let wFinal: number;
      let hFinal: number;
      if (hAtFullWidth <= pageH) {
        wFinal = pageW;
        hFinal = hAtFullWidth;
      } else {
        const scale = Math.min(pageW / w, pageH / h);
        wFinal = w * scale;
        hFinal = h * scale;
      }
      const x = (pageW - wFinal) / 2;
      const y = (pageH - hFinal) / 2;
      doc.addImage(imgData, "PNG", x, y, wFinal, hFinal);
      doc.save("compliance-report.pdf");
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setPdfExporting(false);
    }
  };

  return (
    <div ref={topRef} className="space-y-6 compliance-results-print-area">
      {/* Results header bar */}
      <motion.div
        {...fadeUp(0)}
        className="flex items-center justify-between rounded-2xl px-5 py-3 bg-white border border-slate-200/80"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-teal-50">
            <CheckCircle2 className="w-4 h-4 text-teal-600" />
          </div>
          <div>
            <p className="font-display text-[var(--body-text)]" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
              Pre-submit check complete
            </p>
            <p className="text-[var(--body-text-muted)] flex items-center gap-1" style={{ fontSize: "0.72rem" }}>
              <Clock className="w-3 h-3" />
              Analyzed in 2.4 s · BlueCross BlueShield Policy v2026.1
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button
            type="button"
            onClick={handleCopySummary}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:ring-offset-2"
            style={{ fontSize: "0.78rem" }}
            title="Copy score and recommendations to clipboard"
          >
            <Copy className="w-3.5 h-3.5" />
            {copySummaryFeedback === "copied"
              ? "Copied"
              : copySummaryFeedback === "error"
                ? "Copy failed"
                : "Copy summary"}
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={pdfExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{ fontSize: "0.78rem" }}
          >
            <Download className="w-3.5 h-3.5" />
            {pdfExporting ? "Generating PDF…" : "Export PDF"}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:ring-offset-2"
            style={{ fontSize: "0.78rem" }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            New check
          </button>
        </div>
      </motion.div>

      {/* ── HERO: Score + Claim Summary ── */}
      <motion.div {...fadeUp(0.08)} className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Score Card */}
        <div
          className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 overflow-hidden transition-[box-shadow] duration-300 hover:shadow-[var(--shadow-card-hover)]"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/80 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-orange-500" />
            <span className="font-display text-[var(--body-text)]" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
              Denial Risk Score
            </span>
          </div>
          <div className="px-6 pt-6 pb-8 flex flex-col items-center">
            <ScoreGauge score={score} animated={true} />
            <div
              className="mt-5 w-full rounded-lg px-4 py-3 text-center"
              style={{
                backgroundColor: "#fff7ed",
                border: "1px solid #fed7aa",
              }}
            >
              <p
                className="text-orange-800 leading-relaxed"
                style={{ fontSize: "0.82rem", lineHeight: 1.55 }}
              >
                <span style={{ fontWeight: 600 }}>Key finding: </span>
                {formatCitation(scoreExplanation)}
              </p>
            </div>
            <div className="mt-4 w-full grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Critical", value: "2", color: "#dc2626", bg: "#fee2e2" },
                { label: "Required", value: "2", color: "#ea580c", bg: "#ffedd5" },
                { label: "Advisory", value: "1", color: "#16a34a", bg: "#dcfce7" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg py-2" style={{ backgroundColor: stat.bg }}>
                  <p style={{ fontSize: "1.2rem", fontWeight: 700, color: stat.color }}>{stat.value}</p>
                  <p style={{ fontSize: "0.65rem", fontWeight: 600, color: stat.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Claim Summary */}
        <div className="lg:col-span-3">
          <ClaimSummary claimSummary={result?.claimSummary} />
        </div>
      </motion.div>

      {/* ── DUAL AGENT VIEW ── */}
      <motion.div {...fadeUp(0.16)}>
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-px bg-slate-200/80" />
          <span className="text-[var(--body-text-muted)] flex items-center gap-1.5 font-display" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            Two-Agent Analysis
            <span className="w-2 h-2 rounded-full bg-amber-400" />
          </span>
          <div className="flex-1 h-px bg-slate-200/80" />
        </div>
        <DualAgentView clinicianView={result?.clinicianView} payerView={result?.payerView} />
      </motion.div>

      {/* ── RECOMMENDATIONS ── */}
      <motion.div {...fadeUp(0.24)}>
        <RecommendationsList recommendations={result?.recommendations} />
      </motion.div>

      {/* ── VALIDATION ISSUES ── */}
      <motion.div {...fadeUp(0.3)}>
        <ValidationIssues validationIssues={result?.validationIssues} />
      </motion.div>

      {/* Footer note */}
      <motion.div {...fadeUp(0.34)}>
        <div className="text-center py-4">
          <p className="text-[var(--body-text-muted)]" style={{ fontSize: "0.72rem" }}>
            ComplianceShield can be embedded in your billing workflow or accessed via{" "}
            <span className="font-mono" style={{ color: "var(--teal-600)" }}>POST /api/v1/claim-check</span>.{" "}
            Results are advisory; always confirm with your billing compliance officer.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
