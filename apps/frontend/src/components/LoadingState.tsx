import { motion } from "motion/react";
import { ShieldCheck, Brain, FileSearch, CheckCircle2 } from "lucide-react";

const steps = [
  { icon: FileSearch, label: "Parsing claim documentation…", delay: 0 },
  { icon: Brain, label: "Running clinician agent…", delay: 0.6 },
  { icon: ShieldCheck, label: "Running payer policy agent…", delay: 1.2 },
  { icon: CheckCircle2, label: "Scoring denial risk…", delay: 1.8 },
];

export function LoadingState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-6"
    >
      {/* Animated shield */}
      <div className="relative mb-8">
        <div
          className="flex items-center justify-center rounded-2xl w-20 h-20"
          style={{ background: "linear-gradient(135deg, #0f2744 0%, #1a4070 100%)" }}
        >
          <ShieldCheck className="w-9 h-9 text-teal-400" />
        </div>
        <div
          className="absolute -inset-2 rounded-3xl border-2 border-teal-400/30 animate-ping"
          style={{ animationDuration: "1.5s" }}
        />
      </div>

      <h3 className="text-slate-800 mb-1" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
        Analyzing claim…
      </h3>
      <p className="text-slate-400 mb-10" style={{ fontSize: "0.82rem" }}>
        Comparing documentation against payer policy
      </p>

      {/* Steps */}
      <div className="w-full max-w-sm space-y-3">
        {steps.map(({ icon: Icon, label, delay }, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay, duration: 0.4 }}
            className="flex items-center gap-3 rounded-xl px-4 py-3 bg-white border border-slate-200 shadow-xs"
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: delay + 0.2, duration: 0.3 }}
              className="flex items-center justify-center w-7 h-7 rounded-lg bg-teal-50"
            >
              <Icon className="w-3.5 h-3.5 text-teal-600" />
            </motion.div>
            <span className="text-slate-600" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
              {label}
            </span>
            <motion.div
              className="ml-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: delay + 0.4 }}
            >
              <div className="flex gap-1">
                {[0, 0.15, 0.3].map((d) => (
                  <span
                    key={d}
                    className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce"
                    style={{ animationDelay: `${delay + d}s` }}
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-sm mt-8">
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, #0d9488, #1d4ed8)" }}
            initial={{ width: "0%" }}
            animate={{ width: "90%" }}
            transition={{ duration: 2.2, ease: "easeOut" }}
          />
        </div>
        <p className="text-center text-slate-400 mt-2" style={{ fontSize: "0.7rem" }}>
          Typically completes in 2–4 seconds
        </p>
      </div>
    </motion.div>
  );
}
