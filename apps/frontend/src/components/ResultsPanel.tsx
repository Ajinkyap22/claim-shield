import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  CheckCircle2,
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
import { formatCitation } from "@/lib/formatCitation";
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

const MOCK_SCORE = 74;
const MOCK_SCORE_EXPLANATION =
  "Prior auth undocumented and laterality modifiers missing (Policy § 4.2.1, § 3.1)";

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

export function ResultsPanel({ result = null, onReset }: ResultsPanelProps) {
  const topRef = useRef<HTMLDivElement>(null);
  const [pdfExporting, setPdfExporting] = useState(false);
  const score = result?.score ?? MOCK_SCORE;
  const scoreExplanation = result?.scoreExplanation ?? MOCK_SCORE_EXPLANATION;

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

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
        className="flex items-center justify-between rounded-xl px-5 py-3 bg-white border border-slate-200 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-50">
            <CheckCircle2 className="w-4 h-4 text-teal-600" />
          </div>
          <div>
            <p className="text-slate-800" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
              Pre-submit check complete
            </p>
            <p className="text-slate-400 flex items-center gap-1" style={{ fontSize: "0.72rem" }}>
              <Clock className="w-3 h-3" />
              Analyzed in 2.4 s · BlueCross BlueShield Policy v2026.1
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={pdfExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ fontSize: "0.78rem" }}
          >
            <Download className="w-3.5 h-3.5" />
            {pdfExporting ? "Generating PDF…" : "Export PDF"}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
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
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-orange-500" />
            <span className="text-slate-700" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
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
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-slate-400 flex items-center gap-1.5" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            Two-Agent Analysis
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          </span>
          <div className="flex-1 h-px bg-slate-200" />
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
          <p className="text-slate-400" style={{ fontSize: "0.72rem" }}>
            ComplianceShield can be embedded in your billing workflow or accessed via{" "}
            <span className="font-mono" style={{ color: "#0d9488" }}>POST /api/v1/claim-check</span>.{" "}
            Results are advisory; always confirm with your billing compliance officer.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
