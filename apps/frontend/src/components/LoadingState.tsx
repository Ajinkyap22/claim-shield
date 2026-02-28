import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ShieldCheck } from "lucide-react";

/** One step at a time: title + description for the synchronous loading flow. */
const DEFAULT_STEPS = [
  {
    label: "Extracting input…",
    description: "Reading your clinical note and any uploaded documents.",
  },
  {
    label: "Normalizing to structured data…",
    description: "Mapping documentation to diagnoses and procedures.",
  },
  {
    label: "Checking against policy…",
    description: "Comparing claim to payer policy and coverage rules.",
  },
  {
    label: "Running clinician agent…",
    description: "Summarizing what’s documented and what may be missing.",
  },
  {
    label: "Running payer agent…",
    description: "Evaluating coverage and identifying policy-cited gaps.",
  },
  {
    label: "Calculating denial risk…",
    description: "Computing your pre-submit risk score.",
  },
];

const STEP_INTERVAL_MS = 1500;
/** Fallback when no API progress: bar fills over this duration. */
const PROGRESS_BAR_DURATION_SEC = 8.5;
const easeSmooth = [0.25, 0.46, 0.45, 0.94] as [number, number, number, number];

export interface LoadingStateProps {
  /** Main title when driven by API (e.g. from polling). */
  stepLabel?: string;
  /** Subtitle/description when driven by API. */
  stepDescription?: string;
  /** 0–100 from pipeline status; when set, progress bar is driven by actual pipeline progress. */
  progressPercent?: number;
}

export function LoadingState({
  stepLabel,
  stepDescription,
  progressPercent,
}: LoadingStateProps = {}) {
  const [stepIndex, setStepIndex] = useState(0);

  const useApiStep = stepLabel != null;
  const useApiProgress = progressPercent != null;
  const title = useApiStep ? stepLabel : DEFAULT_STEPS[stepIndex % DEFAULT_STEPS.length].label;
  const description = useApiStep
    ? (stepDescription ?? "")
    : DEFAULT_STEPS[stepIndex % DEFAULT_STEPS.length].description;

  useEffect(() => {
    if (useApiStep) return;
    const id = setInterval(() => {
      setStepIndex((i) => (i + 1) % DEFAULT_STEPS.length);
    }, STEP_INTERVAL_MS);
    return () => clearInterval(id);
  }, [useApiStep]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: easeSmooth }}
      className="flex flex-col items-center justify-center py-16 px-6"
    >
      {/* Big loading indicator */}
      <div className="relative mb-10">
        <motion.div
          initial={{ scale: 0.92, opacity: 0.8 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: easeSmooth }}
          className="flex items-center justify-center rounded-2xl w-24 h-24"
          style={{
            background: "linear-gradient(135deg, var(--navy-900) 0%, var(--navy-700) 100%)",
            boxShadow: "var(--shadow-glow-teal), 0 8px 24px rgba(15, 39, 68, 0.15)",
          }}
        >
          <ShieldCheck className="w-11 h-11 text-teal-400" />
        </motion.div>
        <motion.div
          className="absolute -inset-3 rounded-3xl border-2 border-teal-400/25"
          animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={useApiStep ? "api" : stepIndex}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25, ease: easeSmooth }}
          className="text-center max-w-md"
        >
          <h3
            className="font-display text-[var(--body-text)] mb-2"
            style={{ fontSize: "1.2rem", fontWeight: 600 }}
          >
            {title}
          </h3>
          <p
            className="text-[var(--body-text-muted)]"
            style={{ fontSize: "0.875rem", lineHeight: 1.5 }}
          >
            {description}
          </p>
        </motion.div>
      </AnimatePresence>

      {/* Bouncing dots under the text */}
      <div className="flex gap-1.5 mt-8">
        {[0, 0.15, 0.3].map((d) => (
          <span
            key={d}
            className="w-2 h-2 rounded-full bg-teal-500 animate-bounce"
            style={{ animationDelay: `${d}s` }}
          />
        ))}
      </div>

      {/* Progress bar: driven by pipeline progress when available, else time-based */}
      <div className="w-full max-w-sm mt-10">
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, var(--teal-600), #1d4ed8)" }}
            initial={false}
            animate={{
              width: useApiProgress
                ? `${Math.min(100, Math.max(0, progressPercent ?? 0))}%`
                : "90%",
            }}
            transition={
              useApiProgress
                ? { duration: 0.4, ease: easeSmooth }
                : { duration: PROGRESS_BAR_DURATION_SEC, ease: easeSmooth }
            }
          />
        </div>
        <p className="text-center text-[var(--body-text-muted)] mt-2" style={{ fontSize: "0.7rem" }}>
          {useApiProgress ? "Pipeline in progress…" : "Typically completes in a few seconds"}
        </p>
      </div>
    </motion.div>
  );
}
