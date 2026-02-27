import { Lightbulb, ArrowRight, BookOpen } from "lucide-react";

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

const MOCK_RECOMMENDATIONS: RecommendationItem[] = [
  {
    id: 1,
    priority: "Critical",
    title: "Obtain prior authorization for CPT 27447",
    detail:
      "Contact BlueCross BlueShield prior auth line. Reference the claim documentation dated 02/20/2026. Attach PA approval number to claim form box 23 before submission.",
    citation: "Policy § 4.2.1",
    citationFull: "Coverage & Authorization Criteria, Section 4.2.1: Elective Surgical Procedures",
    action: "Obtain auth number",
    priorityColor: { bg: "#fee2e2", text: "#dc2626", border: "#fecaca" },
  },
  {
    id: 2,
    priority: "Critical",
    title: "Append modifier -RT to CPT 27447 and CPT 29877",
    detail:
      "Both procedure codes require the laterality modifier -RT (right side). Update claim form line items before submission. Verify with the billing system's modifier validation.",
    citation: "Policy § 3.1",
    citationFull: "Coding Requirements, Section 3.1: Laterality and Side Designators",
    action: "Update modifiers",
    priorityColor: { bg: "#fee2e2", text: "#dc2626", border: "#fecaca" },
  },
  {
    id: 3,
    priority: "Required",
    title: "Extend conservative treatment documentation to ≥12 weeks",
    detail:
      "Documentation shows 8 weeks of PT; policy requires 12 consecutive weeks. Supplement record with prior PT notes or schedule additional 4 weeks before proceeding.",
    citation: "Policy § 7.2",
    citationFull: "Medical Necessity Criteria, Section 7.2: Conservative Treatment Threshold",
    action: "Add to record",
    priorityColor: { bg: "#ffedd5", text: "#ea580c", border: "#fed7aa" },
  },
  {
    id: 4,
    priority: "Required",
    title: "Attach signed medical necessity letter",
    detail:
      "A letter from Dr. Sarah Chen, MD, must accompany the claim. Include diagnosis, failed conservative treatments, surgical plan, and expected functional outcome.",
    citation: "Policy § 5.1",
    citationFull: "Claims Submission Guidelines, Section 5.1: Supporting Documentation",
    action: "Draft letter",
    priorityColor: { bg: "#ffedd5", text: "#ea580c", border: "#fed7aa" },
  },
  {
    id: 5,
    priority: "Advisory",
    title: "Resolve ICD-10 conflict: M17.11 vs Z96.651",
    detail:
      "M17.11 (primary OA, right knee) co-billed with Z96.651 (presence of right artificial knee joint) may trigger an edit. Confirm surgical history and clarify in the notes if the patient has a prior partial replacement.",
    citation: "Policy § 8.3.2",
    citationFull: "Coding Integrity, Section 8.3.2: Diagnosis Code Conflict Review",
    action: "Confirm history",
    priorityColor: { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" },
  },
];

const priorityOrder: Record<string, number> = { Critical: 0, Required: 1, Advisory: 2 };

const defaultPriorityColor = (priority?: string) => {
  if (priority === "Critical") return { bg: "#fee2e2", text: "#dc2626", border: "#fecaca" };
  if (priority === "Required") return { bg: "#ffedd5", text: "#ea580c", border: "#fed7aa" };
  return { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" };
};

interface RecommendationsListProps {
  /** When provided from API, overrides mock list. */
  recommendations?: RecommendationItem[] | null;
}

export function RecommendationsList({ recommendations: propRecommendations }: RecommendationsListProps) {
  const list = (propRecommendations?.length ? propRecommendations : MOCK_RECOMMENDATIONS).map((r) => ({
    ...r,
    priorityColor: r.priorityColor ?? defaultPriorityColor(r.priority),
  }));
  
  const sorted = [...list].sort(
    (a, b) => (priorityOrder[a.priority ?? ""] ?? 3) - (priorityOrder[b.priority ?? ""] ?? 3)
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          <span className="text-slate-700" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
            Policy-Cited Recommendations
          </span>
          <span
            className="rounded-full px-2 py-0.5"
            style={{ fontSize: "0.68rem", fontWeight: 600, backgroundColor: "#fef3c7", color: "#92400e" }}
          >
            {list.length} actions
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400" style={{ fontSize: "0.7rem" }}>BlueCross BlueShield Policy v2026.1</span>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {sorted.map((rec, idx) => (
          <div key={rec.id ?? idx} className="p-5 hover:bg-slate-50/60 transition-colors group">
            <div className="flex items-start gap-4">
              {/* Number */}
                  <div
                    className="flex items-center justify-center rounded-full shrink-0 mt-0.5"
                    style={{
                      width: "26px",
                      height: "26px",
                      backgroundColor: rec.priorityColor?.bg ?? defaultPriorityColor(rec.priority).bg,
                      border: `1px solid ${rec.priorityColor?.border ?? defaultPriorityColor(rec.priority).border}`,
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      color: rec.priorityColor?.text ?? defaultPriorityColor(rec.priority).text,
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
                        backgroundColor: rec.priorityColor?.bg ?? defaultPriorityColor(rec.priority).bg,
                        color: rec.priorityColor?.text ?? defaultPriorityColor(rec.priority).text,
                        border: `1px solid ${rec.priorityColor?.border ?? defaultPriorityColor(rec.priority).border}`,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                      }}
                    >
                      {rec.priority ?? "Advisory"}
                    </span>
                    <p className="text-slate-800" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                      {rec.title}
                    </p>
                  </div>

                  {/* Citation: prominent, easy to spot */}
                  <div
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 shrink-0"
                    style={{
                      backgroundColor: "#fffbeb",
                      border: "1px solid #fde68a",
                    }}
                    title={rec.citationFull}
                  >
                    <BookOpen className="w-3 h-3 text-amber-500" />
                    <span
                      className="font-mono"
                      style={{ fontSize: "0.72rem", fontWeight: 700, color: "#b45309" }}
                    >
                      {rec.citation}
                    </span>
                  </div>
                </div>

                {rec.detail && (
                  <p className="text-slate-500 mt-1.5" style={{ fontSize: "0.8rem", lineHeight: 1.6 }}>
                    {rec.detail}
                  </p>
                )}

                {rec.citationFull && (
                  <p className="text-slate-400 mt-1" style={{ fontSize: "0.7rem", fontStyle: "italic" }}>
                    {rec.citationFull}
                  </p>
                )}

                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white transition-all hover:opacity-90"
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      background: "linear-gradient(135deg, #0f2744 0%, #1a4070 100%)",
                    }}
                  >
                    {rec.action ?? "View"}
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
