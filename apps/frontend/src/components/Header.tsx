import { ShieldCheck } from "lucide-react";

export function Header() {
  return (
    <header
      className="text-white"
      style={{
        background: "linear-gradient(135deg, var(--navy-900) 0%, var(--navy-700) 100%)",
        boxShadow: "0 2px 12px rgba(15, 39, 68, 0.15), 0 1px 0 0 rgba(13, 148, 136, 0.15)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex items-center justify-center w-12 h-12 rounded-xl bg-teal-500/25 border border-teal-400/40"
            style={{
              boxShadow: "0 0 20px rgba(13, 148, 136, 0.25), 0 2px 8px rgba(13, 148, 136, 0.2)",
            }}
          >
            <ShieldCheck className="w-6 h-6 text-teal-300" strokeWidth={2.25} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span
              className="font-display text-white tracking-tight"
              style={{ fontSize: "1.3rem", fontWeight: 700, letterSpacing: "-0.02em" }}
            >
              Compliance<span className="text-teal-400">Shield</span>
            </span>
            <p
              className="text-slate-400 font-display leading-none"
              style={{ fontSize: "0.75rem", marginTop: "2px", letterSpacing: "0.02em" }}
            >
              Pre-submit Risk Intelligence
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4">
          <div
            className="w-px h-6 rounded-full"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.12)" }}
            aria-hidden
          />
          <p
            className="font-display text-slate-400 italic"
            style={{ fontSize: "0.8rem", fontStyle: "italic" }}
          >
            &quot;See the denial before the payer does.&quot;
          </p>
        </div>
      </div>
    </header>
  );
}
