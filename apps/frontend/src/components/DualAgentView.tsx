import { Stethoscope, FileSearch, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

const clinicianFindings = [
  {
    category: "Chief Complaint",
    text: "Severe right knee pain with complete loss of functional mobility. ROM 15°–95°, bone-on-bone on imaging.",
    status: "documented",
  },
  {
    category: "Conservative Treatment",
    text: "8 weeks of PT (2x/week), NSAID therapy (naproxen 500mg BID), two corticosteroid injections at 4-week intervals.",
    status: "documented",
  },
  {
    category: "Imaging",
    text: "Standing AP radiographs confirm medial and lateral compartment bone-on-bone contact. MRI: complete cartilage loss.",
    status: "documented",
  },
  {
    category: "Prior Authorization",
    text: "PA requested verbally per dictation. No written authorization number or approval letter in record.",
    status: "gap",
  },
  {
    category: "Laterality",
    text: "Documentation specifies 'right knee' in narrative but procedure codes submitted without -RT modifier.",
    status: "gap",
  },
];

const payerPolicyPoints = [
  {
    citation: "§ 4.2.1",
    title: "Prior Authorization Required",
    text: "CPT 27447 (Total Knee Arthroplasty) requires prior authorization before service. Written auth number must appear on claim form. No auth number found.",
    severity: "fail",
  },
  {
    citation: "§ 3.1",
    title: "Laterality Modifier Mandatory",
    text: "All unilateral surgical procedures must include laterality modifier (RT or LT) appended to each CPT code. CPT 27447 and 29877 submitted without modifier.",
    severity: "fail",
  },
  {
    citation: "§ 7.2",
    title: "Conservative Treatment: Minimum Duration",
    text: "Policy requires ≥12 consecutive weeks of conservative treatment prior to elective arthroplasty. Documented period: 8 weeks. Claim does not meet threshold.",
    severity: "fail",
  },
  {
    citation: "§ 5.1",
    title: "Medical Necessity Letter",
    text: "For elective inpatient procedures with estimated cost exceeding $50,000, a signed medical necessity letter from the attending surgeon is required.",
    severity: "warn",
  },
];

const statusIcon = (s: "documented" | "gap") =>
  s === "documented" ? (
    <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
  ) : (
    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
  );

const severityIcon = (s: "fail" | "warn") =>
  s === "fail" ? (
    <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
  ) : (
    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
  );

interface DualAgentViewProps {
  /** When provided from API, shown as clinician summary; else mock structured view. */
  clinicianView?: string | null;
  /** When provided from API, shown as payer summary; else mock structured view. */
  payerView?: string | null;
}

export function DualAgentView({ clinicianView, payerView }: DualAgentViewProps) {
  const useApiSummaries = Boolean(clinicianView ?? payerView);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Clinician View */}
      <div className="rounded-xl border border-blue-200 overflow-hidden shadow-sm">
        <div
          className="px-5 py-3.5 flex items-center gap-3"
          style={{ background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)" }}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/15">
            <Stethoscope className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white" style={{ fontSize: "0.875rem", fontWeight: 700 }}>
              Clinician View
            </p>
            <p className="text-blue-200" style={{ fontSize: "0.7rem" }}>
              What&apos;s in the claim documentation
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-white/15">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-300"></span>
            <span className="text-blue-100" style={{ fontSize: "0.7rem", fontWeight: 500 }}>Agent A</span>
          </div>
        </div>
        <div className="bg-blue-50 p-4 space-y-3">
          {useApiSummaries && clinicianView ? (
            <div className="bg-white rounded-lg p-3.5 border border-blue-100 shadow-xs">
              <p className="text-slate-700" style={{ fontSize: "0.875rem", lineHeight: 1.55 }}>{clinicianView}</p>
            </div>
          ) : (
            clinicianFindings.map((f) => (
              <div key={f.category} className="bg-white rounded-lg p-3.5 border border-blue-100 shadow-xs">
                <div className="flex items-start gap-2">
                  {statusIcon(f.status as "documented" | "gap")}
                  <div className="min-w-0">
                    <p
                      className="text-slate-700 mb-0.5"
                      style={{ fontSize: "0.78rem", fontWeight: 600 }}
                    >
                      {f.category}
                    </p>
                    <p className="text-slate-500" style={{ fontSize: "0.78rem", lineHeight: 1.5 }}>
                      {f.text}
                    </p>
                    {f.status === "gap" && (
                      <span
                        className="inline-block mt-1.5 rounded-full px-2 py-0.5"
                        style={{ fontSize: "0.65rem", fontWeight: 600, backgroundColor: "#fef3c7", color: "#92400e" }}
                      >
                        Documentation gap
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Payer View */}
      <div className="rounded-xl border border-amber-200 overflow-hidden shadow-sm">
        <div
          className="px-5 py-3.5 flex items-center gap-3"
          style={{ background: "linear-gradient(135deg, #92400e 0%, #b45309 100%)" }}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/15">
            <FileSearch className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white" style={{ fontSize: "0.875rem", fontWeight: 700 }}>
              Payer View
            </p>
            <p className="text-amber-200" style={{ fontSize: "0.7rem" }}>
              What the policy says
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-white/15">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-300"></span>
            <span className="text-amber-100" style={{ fontSize: "0.7rem", fontWeight: 500 }}>Agent B</span>
          </div>
        </div>
        <div className="bg-amber-50 p-4 space-y-3">
          {useApiSummaries && payerView ? (
            <div className="bg-white rounded-lg p-3.5 border border-amber-100 shadow-xs">
              <p className="text-slate-700" style={{ fontSize: "0.875rem", lineHeight: 1.55 }}>{payerView}</p>
            </div>
          ) : (
            payerPolicyPoints.map((p) => (
              <div key={p.citation} className="bg-white rounded-lg p-3.5 border border-amber-100 shadow-xs">
                <div className="flex items-start gap-2">
                  {severityIcon(p.severity as "fail" | "warn")}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span
                        className="font-mono rounded px-1.5 py-0.5"
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          backgroundColor: "#fef3c7",
                          color: "#92400e",
                          letterSpacing: "0.03em",
                        }}
                      >
                        {p.citation}
                      </span>
                      <p className="text-slate-700" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                        {p.title}
                      </p>
                    </div>
                    <p className="text-slate-500" style={{ fontSize: "0.78rem", lineHeight: 1.5 }}>
                      {p.text}
                    </p>
                    <span
                      className="inline-block mt-1.5 rounded-full px-2 py-0.5"
                      style={{
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        backgroundColor: p.severity === "fail" ? "#fee2e2" : "#fef9c3",
                        color: p.severity === "fail" ? "#dc2626" : "#a16207",
                      }}
                    >
                      {p.severity === "fail" ? "Denial trigger" : "Warning"}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
