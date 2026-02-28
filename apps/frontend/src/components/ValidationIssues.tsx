import { AlertTriangle, Info } from "lucide-react";
import { MOCK_COMPLIANCE_RESPONSE } from "@/api/compliance";

type ValidationIssueItem = {
  type: "error" | "warn" | "info";
  code?: string;
  title: string;
  detail?: string;
};

interface ValidationIssuesProps {
  /** When provided from API, overrides mock list. */
  validationIssues?: ValidationIssueItem[] | null;
}

export function ValidationIssues({ validationIssues }: ValidationIssuesProps) {
  const issues = (validationIssues?.length
    ? validationIssues
    : (MOCK_COMPLIANCE_RESPONSE.validationIssues ?? [])) as ValidationIssueItem[];
  const errors = issues.filter((i) => i.type === "error");
  const warnings = issues.filter((i) => i.type === "warn");
  const infos = issues.filter((i) => i.type === "info");

  return (
    <div
      className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden transition-[box-shadow] duration-300 hover:shadow-[var(--shadow-card-hover)]"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/80 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <span className="font-display text-[var(--body-text)]" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
          Validation &amp; Coding Issues
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          {errors.length > 0 && (
            <span className="rounded-full px-2 py-0.5" style={{ fontSize: "0.65rem", fontWeight: 700, backgroundColor: "#fee2e2", color: "#dc2626" }}>
              {errors.length} error{errors.length > 1 ? "s" : ""}
            </span>
          )}
          {warnings.length > 0 && (
            <span className="rounded-full px-2 py-0.5" style={{ fontSize: "0.65rem", fontWeight: 700, backgroundColor: "#fef3c7", color: "#a16207" }}>
              {warnings.length} warning{warnings.length > 1 ? "s" : ""}
            </span>
          )}
          {infos.length > 0 && (
            <span className="rounded-full px-2 py-0.5" style={{ fontSize: "0.65rem", fontWeight: 700, backgroundColor: "#dbeafe", color: "#1d4ed8" }}>
              {infos.length} info
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-2">
        {issues.map((issue, i) => {
          const colors =
            issue.type === "error"
              ? { bg: "#fff5f5", border: "#fecaca", code: "#fee2e2", codeText: "#dc2626", icon: "#ef4444" }
              : issue.type === "warn"
              ? { bg: "#fffdf0", border: "#fde68a", code: "#fef9c3", codeText: "#a16207", icon: "#f59e0b" }
              : { bg: "#eff6ff", border: "#bfdbfe", code: "#dbeafe", codeText: "#1d4ed8", icon: "#3b82f6" };

          return (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg p-3"
              style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}
            >
              <div className="shrink-0 mt-0.5">
                {issue.type === "info" ? (
                  <Info className="w-4 h-4" style={{ color: colors.icon }} />
                ) : (
                  <AlertTriangle className="w-4 h-4" style={{ color: colors.icon }} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="rounded px-1.5 py-0.5 font-mono shrink-0"
                    style={{ fontSize: "0.68rem", fontWeight: 700, backgroundColor: colors.code, color: colors.codeText }}
                  >
                    {issue.code}
                  </span>
                  <span className="text-slate-700" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    {issue.title}
                  </span>
                </div>
                <p className="text-slate-500 mt-0.5" style={{ fontSize: "0.75rem", lineHeight: 1.5 }}>
                  {issue.detail}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
