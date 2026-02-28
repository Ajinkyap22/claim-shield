import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ShieldCheck, Loader2 } from "lucide-react";

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
  const title = useApiStep
    ? stepLabel
    : DEFAULT_STEPS[stepIndex % DEFAULT_STEPS.length].label;
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

  const displayPercent = useApiProgress
    ? Math.min(100, Math.max(0, Math.round(progressPercent ?? 0)))
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: easeSmooth }}
      className="flex flex-col items-center justify-center py-16 px-6"
    >
      {/* Prominent spinner + shield */}
      <div className="relative mb-8 flex items-center justify-center">
        <div className="relative flex items-center justify-center">
          <motion.div
            initial={{ scale: 0.92, opacity: 0.8 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: easeSmooth }}
            className="flex items-center justify-center rounded-2xl w-24 h-24 z-10"
            style={{
              background:
                "linear-gradient(135deg, var(--navy-900) 0%, var(--navy-700) 100%)",
              boxShadow:
                "var(--shadow-glow-teal), 0 8px 24px rgba(15, 39, 68, 0.15)",
            }}
          >
            <ShieldCheck className="w-11 h-11 text-teal-400" />
          </motion.div>
          {/* Large visible spinning ring around the icon */}
          <Loader2
            className="absolute w-32 h-32 text-teal-500/70 animate-spin -z-[1]"
            strokeWidth={2}
            aria-hidden
          />
        </div>
      </div>

      {/* "Analyzing your claim" label so it's obvious we're loading */}
      <p
        className="text-[var(--body-text-muted)] text-center mb-1"
        style={{
          fontSize: "0.8rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        Analyzing your claim
      </p>

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

      {/* Progress bar: driven by pipeline progress when available, else time-based */}
      <div className="w-full max-w-sm mt-8">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span
            className="text-[var(--body-text-muted)]"
            style={{ fontSize: "0.75rem", fontWeight: 500 }}
          >
            {useApiProgress ? "Pipeline progress" : "Loading"}
          </span>
          {displayPercent != null && (
            <span
              className="text-teal-600 font-mono font-semibold"
              style={{ fontSize: "0.8rem" }}
            >
              {displayPercent}%
            </span>
          )}
        </div>
        <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: "linear-gradient(90deg, var(--teal-600), #1d4ed8)",
            }}
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
        <p
          className="text-center text-[var(--body-text-muted)] mt-2"
          style={{ fontSize: "0.7rem" }}
        >
          {useApiProgress
            ? "This may take a minute. Please wait."
            : "Typically completes in a few seconds"}
        </p>
      </div>
    </motion.div>
  );
}
