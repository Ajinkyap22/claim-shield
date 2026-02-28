"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertCircle,
  RotateCcw,
  ChevronDown,
  ClipboardList,
  ShieldCheck,
  FileCheck,
  Gauge,
  LogIn,
  Plug,
} from "lucide-react";
import { Header } from "@/components/Header";
import { InputForm } from "@/components/InputForm";
import { LoadingState } from "@/components/LoadingState";
import { ResultsPanel } from "@/components/ResultsPanel";
import { useComplianceCheckMutation } from "@/hooks/useComplianceCheckMutation";
import type {
  ComplianceCheckPayload,
  ComplianceCheckResponse,
} from "@/types/compliance";

type AppState = "idle" | "loading" | "success" | "error";

function getAppState(
  isPending: boolean,
  isSuccess: boolean,
  isError: boolean,
): AppState {
  if (isPending) return "loading";
  if (isSuccess) return "success";
  if (isError) return "error";
  return "idle";
}

export default function ComplianceShieldApp() {
  const mutation = useComplianceCheckMutation();
  const { mutate, isPending, isSuccess, isError, data, error, reset } =
    mutation;
  const appState = getAppState(isPending, isSuccess, isError);
  const loading = appState === "loading";
  const result: ComplianceCheckResponse | null = isSuccess
    ? (data ?? null)
    : null;

  const handleSubmit = (payload: ComplianceCheckPayload) => {
    mutate(payload);
  };

  const handleReset = () => {
    reset();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRetry = () => {
    reset();
  };

  // Disable browser scroll restoration so we control scroll when switching input → results
  useEffect(() => {
    if (typeof window === "undefined") return;
    const prev = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = prev;
    };
  }, []);

  // When showing loading or results, scroll to top after the new content is in the DOM
  useEffect(() => {
    if (appState !== "loading" && appState !== "success") return;
    const t = setTimeout(() => {
      window.scrollTo(0, 0);
    }, 0);
    return () => clearTimeout(t);
  }, [appState]);

  return (
    <div
      className="min-h-screen"
      style={{
        background: "var(--page-bg)",
        backgroundImage:
          "linear-gradient(180deg, rgba(15, 39, 68, 0.02) 0%, transparent 12rem)",
      }}
    >
      <Header />

      {/* Hero intro */}
      <AnimatePresence>
        {appState === "idle" && (
          <motion.div
            key="hero"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="relative py-14 sm:py-16 px-6 overflow-hidden"
            style={{
              background:
                "linear-gradient(135deg, var(--navy-900) 0%, var(--navy-700) 45%, #0d5a8a 100%)",
              boxShadow: "0 4px 24px rgba(15, 39, 68, 0.2)",
            }}
          >
            <div className="relative max-w-2xl mx-auto text-center">
              <div
                className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 mb-6"
                style={{
                  backgroundColor: "rgba(13, 148, 136, 0.22)",
                  border: "1px solid rgba(45, 212, 191, 0.4)",
                  boxShadow: "0 2px 8px rgba(13, 148, 136, 0.15)",
                }}
              >
                <ShieldCheck
                  className="w-3.5 h-3.5 text-teal-300"
                  strokeWidth={2.25}
                />
                <span
                  className="text-teal-200 font-display"
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                  }}
                >
                  PRE-SUBMIT CLAIM INTELLIGENCE
                </span>
              </div>
              <h1
                className="font-display text-white mb-4"
                style={{
                  fontSize: "clamp(1.75rem, 4vw, 2.4rem)",
                  fontWeight: 700,
                  lineHeight: 1.2,
                  letterSpacing: "-0.02em",
                  textShadow: "0 1px 2px rgba(0, 0, 0, 0.15)",
                }}
              >
                Catch denials before the claim leaves your system.
              </h1>
              <p
                className="text-slate-300 mx-auto max-w-xl mb-6"
                style={{ fontSize: "0.95rem", lineHeight: 1.7 }}
              >
                Paste claim documentation, attach the payer policy, and run a
                compliance check. Our dual-agent system compares what&apos;s
                documented against what the policy requires; fix it now, not
                after a denial.
              </p>
              <div className="flex items-center justify-center gap-3 sm:gap-4 flex-wrap">
                {[
                  { label: "Policy-cited recommendations", icon: FileCheck },
                  { label: "0–100 denial risk score", icon: Gauge },
                  { label: "No login required", icon: LogIn },
                ].map(({ label, icon: Icon }) => (
                  <div
                    key={label}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5"
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.06)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                    }}
                  >
                    <Icon className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                    <span
                      className="text-slate-200"
                      style={{ fontSize: "0.8rem", fontWeight: 500 }}
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex justify-center">
                <ChevronDown
                  className="w-6 h-6 text-teal-300/90 animate-bounce"
                  aria-hidden
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* ── INPUT ── */}
        <AnimatePresence>
          {(appState === "idle" || appState === "error") && (
            <motion.section
              key="input"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16, transition: { duration: 0.25 } }}
              transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div
                className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 bg-slate-50/80"
                style={{ boxShadow: "0 1px 0 0 rgba(0,0,0,0.04)" }}
              >
                <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-slate-200/80">
                  <ClipboardList className="w-4 h-4 text-(--navy-700)" />
                </div>
                <div>
                  <p
                    className="font-display text-(--body-text)"
                    style={{ fontSize: "0.9rem", fontWeight: 600 }}
                  >
                    Input claim documentation &amp; policy
                  </p>
                  <p
                    className="text-(--body-text-muted)"
                    style={{ fontSize: "0.72rem" }}
                  >
                    Paste your note, attach policy PDF, then run the check
                  </p>
                </div>
              </div>

              <div className="p-5 sm:p-6 space-y-4">
                {appState === "error" && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.35,
                      ease: [0.25, 0.46, 0.45, 0.94],
                    }}
                    className="flex items-start gap-3 rounded-xl p-4 border"
                    style={{
                      backgroundColor: "#fff5f5",
                      borderColor: "#fecaca",
                      boxShadow: "var(--shadow-card)",
                    }}
                  >
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p
                        className="text-red-700"
                        style={{ fontSize: "0.875rem", fontWeight: 600 }}
                      >
                        Analysis failed. Please try again.
                      </p>
                      <p
                        className="text-red-500"
                        style={{ fontSize: "0.8rem" }}
                      >
                        {error?.message ??
                          "Could not complete the compliance check. Check your input and retry."}
                      </p>
                    </div>
                    <button
                      onClick={handleRetry}
                      className="flex items-center gap-1 text-red-500 hover:text-red-700 transition-colors shrink-0"
                      style={{ fontSize: "0.75rem" }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Retry
                    </button>
                  </motion.div>
                )}

                <InputForm onSubmit={handleSubmit} loading={loading} />
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── LOADING ── */}
        <AnimatePresence>
          {appState === "loading" && (
            <motion.section
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-2xl border border-slate-200/80"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <LoadingState />
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── RESULTS ── */}
        <AnimatePresence>
          {appState === "success" && (
            <motion.section
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="flex items-center gap-2 mb-4 no-print">
                <span
                  className="flex items-center justify-center w-7 h-7 rounded-full text-white font-display"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--teal-600), #0f766e)",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    boxShadow: "var(--shadow-card)",
                  }}
                >
                  2
                </span>
                <span
                  className="font-display text-[var(--body-text)]"
                  style={{ fontSize: "0.9rem", fontWeight: 600 }}
                >
                  Review pre-submit results
                </span>
                <span
                  className="text-[var(--body-text-muted)]"
                  style={{ fontSize: "0.75rem" }}
                >
                  Fix the issues below before sending to payer
                </span>
              </div>
              <ResultsPanel result={result} onReset={handleReset} />
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer
        className="border-t border-slate-200/80 bg-slate-50/90 mt-10 py-8 px-6"
        style={{ boxShadow: "0 -1px 0 0 rgba(15, 39, 68, 0.06)" }}
      >
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
          <div>
            <p
              className="font-display text-[var(--body-text)]"
              style={{ fontSize: "0.8rem", fontWeight: 600 }}
            >
              Compliance<span className="text-teal-600">Shield</span>
            </p>
            <p
              className="text-[var(--body-text-muted)] mt-0.5"
              style={{ fontSize: "0.72rem" }}
            >
              © 2026 · Pre-submit claim intelligence for revenue cycle &amp;
              billing teams
            </p>
            <p
              className="text-[var(--body-text-muted)] mt-1"
              style={{ fontSize: "0.7rem" }}
            >
              This check is not stored. Close the tab when done.
            </p>
          </div>
          <div
            className="flex items-center gap-2 text-[var(--body-text-muted)]"
            style={{ fontSize: "0.72rem" }}
          >
            <Plug className="w-3.5 h-3.5 shrink-0 opacity-70" />
            <span>
              Embeddable in EHR/billing workflows ·{" "}
              <span
                className="font-mono font-medium"
                style={{ color: "var(--teal-600)" }}
              >
                POST /api/v1/claim-check
              </span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
