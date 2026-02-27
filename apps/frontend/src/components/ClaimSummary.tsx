import { Activity, User, Calendar, Building2, CreditCard } from "lucide-react";

const MOCK_CLAIM_DATA = {
  patient: "Jane D., DOB 04/15/1972",
  dos: "02/20/2026",
  provider: "Dr. Sarah Chen, MD",
  npi: "1234567890",
  facility: "Metropolitan Orthopedic Surgical Center",
  payer: "BlueCross BlueShield",
  diagnoses: [
    { code: "M17.11", desc: "Primary osteoarthritis, right knee", type: "Primary" },
    { code: "M25.361", desc: "Stiffness of right knee", type: "Secondary" },
    { code: "Z96.651", desc: "Presence of right artificial knee joint", type: "History" },
  ],
  procedures: [
    { code: "CPT 27447", desc: "Total knee arthroplasty", modifiers: ["-RT (missing)"] },
    { code: "CPT 29877", desc: "Knee arthroscopy w/ chondroplasty", modifiers: ["-RT (missing)"] },
  ],
};

interface ClaimSummaryProps {
  /** When provided from API, can be used to render; extend type as needed when backend is fixed. */
  claimSummary?: Record<string, unknown> | null;
}

export function ClaimSummary({ claimSummary }: ClaimSummaryProps) {
  const claimData = MOCK_CLAIM_DATA;
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <Activity className="w-4 h-4 text-slate-500" />
        <span className="text-slate-700" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
          Extracted Claim Summary
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* Meta */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {[
            { icon: User, label: "Patient", value: claimData.patient },
            { icon: Calendar, label: "Date of Service", value: claimData.dos },
            { icon: Building2, label: "Provider", value: `${claimData.provider} · NPI ${claimData.npi}` },
            { icon: CreditCard, label: "Payer", value: claimData.payer },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label}>
              <div className="flex items-center gap-1 mb-0.5">
                <Icon className="w-3 h-3 text-slate-400" />
                <span className="text-slate-400" style={{ fontSize: "0.7rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {label}
                </span>
              </div>
              <p className="text-slate-700" style={{ fontSize: "0.8rem" }}>{value}</p>
            </div>
          ))}
        </div>

        <div className="h-px bg-slate-100" />

        {/* Diagnoses */}
        <div>
          <p className="text-slate-500 mb-2" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Diagnoses (ICD-10)
          </p>
          <div className="space-y-1.5">
            {claimData.diagnoses.map((dx) => (
              <div key={dx.code} className="flex items-start gap-2">
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 font-mono"
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    backgroundColor: "#f1f5f9",
                    color: "#475569",
                    minWidth: "60px",
                    textAlign: "center",
                  }}
                >
                  {dx.code}
                </span>
                <span className="text-slate-600" style={{ fontSize: "0.8rem" }}>
                  {dx.desc}
                </span>
                <span
                  className="ml-auto shrink-0 rounded-full px-2 py-0.5"
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: 500,
                    backgroundColor: dx.type === "Primary" ? "#dbeafe" : dx.type === "History" ? "#fef9c3" : "#f1f5f9",
                    color: dx.type === "Primary" ? "#1d4ed8" : dx.type === "History" ? "#a16207" : "#64748b",
                  }}
                >
                  {dx.type}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="h-px bg-slate-100" />

        {/* Procedures */}
        <div>
          <p className="text-slate-500 mb-2" style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Procedures (CPT)
          </p>
          <div className="space-y-1.5">
            {claimData.procedures.map((px) => (
              <div key={px.code} className="flex items-start gap-2">
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 font-mono"
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    backgroundColor: "#fef3c7",
                    color: "#92400e",
                    minWidth: "70px",
                    textAlign: "center",
                  }}
                >
                  {px.code}
                </span>
                <div className="min-w-0">
                  <p className="text-slate-600" style={{ fontSize: "0.8rem" }}>{px.desc}</p>
                  {px.modifiers.map((mod) => (
                    <span
                      key={mod}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 mt-0.5"
                      style={{ fontSize: "0.65rem", fontWeight: 500, backgroundColor: "#fee2e2", color: "#dc2626" }}
                    >
                      <span className="w-1 h-1 rounded-full bg-red-400 inline-block"></span>
                      {mod}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
