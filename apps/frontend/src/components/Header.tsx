import { ShieldCheck } from "lucide-react";

export function Header() {
  return (
    <header className="bg-[#0f2744] text-white">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-teal-500/20 border border-teal-400/30">
            <ShieldCheck className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <span className="text-white tracking-tight" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
              Compliance<span className="text-teal-400">Shield</span>
            </span>
            <p className="text-slate-400 leading-none" style={{ fontSize: "0.7rem", marginTop: "2px" }}>
              Pre-submit Risk Intelligence
            </p>
          </div>
        </div>
        <p className="text-slate-400 italic hidden sm:block" style={{ fontSize: "0.8rem" }}>
          &quot;See the denial before the payer does.&quot;
        </p>
      </div>
    </header>
  );
}
