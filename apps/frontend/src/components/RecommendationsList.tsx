import { useState } from "react";
import { Lightbulb, BookOpen, Wrench, Copy } from "lucide-react";
import { formatCitation } from "@/lib/formatCitation";
import { MOCK_COMPLIANCE_RESPONSE } from "@/api/compliance";

type RecommendationItem = {
  id?: string | number;
  priority?: string;
  title: string;
  detail?: string;
  citation: string;
  citationFull?: string;
  action?: string;
  priorityColor?: { bg: string; text: string; border: string };
};

const priorityOrder: Record<string, number> = {
  Critical: 0,
  Required: 1,
  Advisory: 2,
};

const defaultPriorityColor = (priority?: string) => {
  if (priority === "Critical")
    return { bg: "#fee2e2", text: "#dc2626", border: "#fecaca" };
  if (priority === "Required")
    return { bg: "#ffedd5", text: "#ea580c", border: "#fed7aa" };
  return { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" };
};

interface RecommendationsListProps {
  /** When provided from API, overrides mock list. */
  recommendations?: RecommendationItem[] | null;
  /** Called when user clicks "Fix all issues"; receives the full list for a single backend request. */
  onFixAll?: (recommendations: RecommendationItem[]) => void;
  /** When true, disable the Fix all button and show loading state. */
  fixAllInProgress?: boolean;
}

export function RecommendationsList({
  recommendations: propRecommendations,
  onFixAll,
  fixAllInProgress = false,
}: RecommendationsListProps) {
  const [lastCopiedId, setLastCopiedId] = useState<string | number | null>(
    null,
  );

  const copyRecText = (rec: RecommendationItem): string => {
    const line1 = `${rec.title} — ${formatCitation(rec.citation)}`;
    return rec.detail ? `${line1}\n${rec.detail}` : line1;
  };

  const handleCopyRec = async (
    rec: RecommendationItem,
    rowId: string | number,
  ) => {
    try {
      await navigator.clipboard.writeText(copyRecText(rec));
      setLastCopiedId(rowId);
      setTimeout(() => setLastCopiedId(null), 2000);
    } catch {
      setLastCopiedId(null);
    }
  };

  const list = (
    propRecommendations?.length
      ? propRecommendations
      : ((MOCK_COMPLIANCE_RESPONSE.recommendations ??
          []) as RecommendationItem[])
  ).map((r) => ({
    ...r,
    priorityColor: r.priorityColor ?? defaultPriorityColor(r.priority),
  }));

  const sorted = [...list].sort(
    (a, b) =>
      (priorityOrder[a.priority ?? ""] ?? 3) -
      (priorityOrder[b.priority ?? ""] ?? 3),
  );

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden transition-[box-shadow] duration-300 hover:shadow-[var(--shadow-card-hover)]"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          <span
            className="font-display text-[var(--body-text)]"
            style={{ fontSize: "0.9rem", fontWeight: 600 }}
          >
            Policy-Cited Recommendations
          </span>
          <span
            className="rounded-full px-2 py-0.5"
            style={{
              fontSize: "0.68rem",
              fontWeight: 600,
              backgroundColor: "#fef3c7",
              color: "#92400e",
            }}
          >
            {list.length} actions
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-slate-400" />
          <span
            className="text-[var(--body-text-muted)]"
            style={{ fontSize: "0.7rem" }}
          >
            BlueCross BlueShield Policy v2026.1
          </span>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {sorted.map((rec, idx) => (
          <div
            key={rec.id ?? idx}
            className="p-5 hover:bg-slate-50/60 transition-colors duration-200 group"
          >
            <div className="flex items-start gap-4">
              {/* Number */}
              <div
                className="flex items-center justify-center rounded-full shrink-0 mt-0.5"
                style={{
                  width: "26px",
                  height: "26px",
                  backgroundColor:
                    rec.priorityColor?.bg ??
                    defaultPriorityColor(rec.priority).bg,
                  border: `1px solid ${rec.priorityColor?.border ?? defaultPriorityColor(rec.priority).border}`,
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color:
                    rec.priorityColor?.text ??
                    defaultPriorityColor(rec.priority).text,
                }}
              >
                {idx + 1}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="rounded-full px-2.5 py-0.5"
                      style={{
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        backgroundColor:
                          rec.priorityColor?.bg ??
                          defaultPriorityColor(rec.priority).bg,
                        color:
                          rec.priorityColor?.text ??
                          defaultPriorityColor(rec.priority).text,
                        border: `1px solid ${rec.priorityColor?.border ?? defaultPriorityColor(rec.priority).border}`,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                      }}
                    >
                      {rec.priority ?? "Advisory"}
                    </span>
                    <p
                      className="text-slate-800"
                      style={{ fontSize: "0.875rem", fontWeight: 600 }}
                    >
                      {rec.title}
                    </p>
                  </div>

                  {/* Citation: prominent, easy to spot */}
                  <div className="flex items-center gap-4">
                    <div
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 shrink-0"
                      style={{
                        backgroundColor: "#fffbeb",
                        border: "1px solid #fde68a",
                      }}
                      title={
                        rec.citationFull
                          ? formatCitation(rec.citationFull)
                          : undefined
                      }
                    >
                      <BookOpen className="w-3 h-3 text-amber-500" />
                      <span
                        className="font-mono"
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          color: "#b45309",
                        }}
                      >
                        {formatCitation(rec.citation)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyRec(rec, rec.id ?? idx)}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 hover:border-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:ring-offset-2 shrink-0"
                      title="Copy recommendation and citation"
                      aria-label={
                        lastCopiedId === (rec.id ?? idx)
                          ? "Copied"
                          : "Copy recommendation and citation"
                      }
                      style={{ fontSize: "0.72rem" }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {lastCopiedId === (rec.id ?? idx) ? (
                        <span className="text-teal-600 font-medium">
                          Copied
                        </span>
                      ) : null}
                    </button>
                  </div>
                </div>

                {rec.detail && (
                  <p
                    className="text-slate-500 mt-1.5"
                    style={{ fontSize: "0.8rem", lineHeight: 1.6 }}
                  >
                    {rec.detail}
                  </p>
                )}

                {rec.citationFull && (
                  <p
                    className="text-slate-400 mt-1"
                    style={{ fontSize: "0.7rem", fontStyle: "italic" }}
                  >
                    {formatCitation(rec.citationFull)}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Fix all issues: prominent CTA at bottom */}
      {list.length > 0 && (
        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => onFixAll?.(sorted)}
            disabled={fixAllInProgress}
            className="flex items-center ml-auto justify-center gap-2.5 px-5 py-3.5 rounded-xl text-white transition-all hover:opacity-95 hover:scale-[1.02] active:scale-[0.98] duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              fontSize: "0.9375rem",
              fontWeight: 700,
              background:
                "linear-gradient(135deg, var(--navy-900) 0%, var(--navy-700) 100%)",
              boxShadow: "0 2px 12px rgba(15, 39, 68, 0.2)",
            }}
          >
            <Wrench className="w-5 h-5 shrink-0" />
            {fixAllInProgress ? "Applying fixes…" : "Fix all issues"}
          </button>
        </div>
      )}
    </div>
  );
}
