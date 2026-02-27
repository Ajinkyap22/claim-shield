"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, RotateCcw, ChevronDown } from "lucide-react";
import { Header } from "@/components/Header";
import { InputForm } from "@/components/InputForm";
import { LoadingState } from "@/components/LoadingState";
import { ResultsPanel } from "@/components/ResultsPanel";
import type { ComplianceCheckPayload, ComplianceCheckResponse } from "@/types/compliance";

type AppState = "idle" | "loading" | "success" | "error";

export default function ComplianceShieldApp() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [result, setResult] = useState<ComplianceCheckResponse | null>(null);
  const loading = appState === "loading";

  /**
   * Receives full payload. When backend exists:
   *   const fd = new FormData(); ... build from payload ...
   *   const res = await fetch("/api/v1/claim-check", { method: "POST", body: fd });
   *   const data: ComplianceCheckResponse = await res.json();
   *   setResult(data); setAppState("success");
   */
  const handleSubmit = (_payload: ComplianceCheckPayload) => {
    setAppState("loading");
    setResult(null);
    setTimeout(() => {
      // TODO: replace with API call; then setResult(apiResponse)
      setResult(null); // null = show mock data in ResultsPanel until API is wired
      setAppState("success");
    }, 2600);
  };

  const handleReset = () => {
    setAppState("idle");
    setResult(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f1f5f9" }}>
      <Header />

      {/* Hero intro */}
      <AnimatePresence>
        {appState === "idle" && (
          <motion.div
            key="hero"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            style={{ background: "linear-gradient(135deg, #0f2744 0%, #1a4070 55%, #0d5a8a 100%)" }}
            className="py-10 px-6"
          >
            <div className="max-w-2xl mx-auto text-center">
              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-4"
                style={{ backgroundColor: "rgba(13,148,136,0.18)", border: "1px solid rgba(45,212,191,0.3)" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                <span className="text-teal-300" style={{ fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.06em" }}>
                  PRE-SUBMIT CLAIM INTELLIGENCE
                </span>
              </div>
              <h1
                className="text-white mb-3"
                style={{ fontSize: "1.85rem", fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.02em" }}
              >
                Catch denials before the claim leaves your desk.
              </h1>
              <p className="text-slate-300 mx-auto max-w-xl" style={{ fontSize: "0.88rem", lineHeight: 1.75 }}>
                Paste claim documentation, attach the payer policy, and run a compliance check.
                Our dual-agent system compares what&apos;s documented against what the policy requires;
                fix it now, not after a denial.
              </p>
              <div className="flex items-center justify-center gap-6 mt-5 flex-wrap">
                {["Policy-cited recommendations", "0–100 denial risk score", "No login required"].map((f) => (
                  <div key={f} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                    <span className="text-slate-300" style={{ fontSize: "0.78rem" }}>{f}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-center">
                <ChevronDown className="w-5 h-5 text-slate-400 animate-bounce" />
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
              transition={{ duration: 0.4 }}
            >
              <div className="flex items-center gap-2 mb-4">
                <span
                  className="flex items-center justify-center w-6 h-6 rounded-full text-white"
                  style={{ background: "linear-gradient(135deg, #0f2744, #1a4070)", fontSize: "0.72rem", fontWeight: 700 }}
                >
                  1
                </span>
                <span className="text-slate-600" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Input claim documentation &amp; policy
                </span>
              </div>

              {appState === "error" && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 rounded-xl p-4 mb-4 border"
                  style={{ backgroundColor: "#fff5f5", borderColor: "#fecaca" }}
                >
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-red-700" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                      Analysis failed. Please try again.
                    </p>
                    <p className="text-red-500" style={{ fontSize: "0.8rem" }}>
                      Could not complete the compliance check. Check your input and retry.
                    </p>
                  </div>
                  <button
                    onClick={() => setAppState("idle")}
                    className="flex items-center gap-1 text-red-500 hover:text-red-700 transition-colors shrink-0"
                    style={{ fontSize: "0.75rem" }}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retry
                  </button>
                </motion.div>
              )}

              <InputForm onSubmit={handleSubmit} loading={loading} />
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
              className="bg-white rounded-2xl border border-slate-200 shadow-sm"
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
              transition={{ duration: 0.5 }}
            >
              <div className="flex items-center gap-2 mb-4 no-print">
                <span
                  className="flex items-center justify-center w-6 h-6 rounded-full text-white"
                  style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", fontSize: "0.72rem", fontWeight: 700 }}
                >
                  2
                </span>
                <span className="text-slate-600" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Review pre-submit results
                </span>
                <span className="text-slate-400" style={{ fontSize: "0.75rem" }}>
                  Fix the issues below before sending to payer
                </span>
              </div>
              <ResultsPanel result={result} onReset={handleReset} />
            </motion.section>
          )}
        </AnimatePresence>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-8 py-5 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-slate-400" style={{ fontSize: "0.72rem" }}>
            © 2026 ComplianceShield · Pre-submit claim intelligence for revenue cycle &amp; billing teams
          </p>
          <p className="text-slate-400" style={{ fontSize: "0.72rem" }}>
            Embeddable in EHR/billing workflows ·{" "}
            <span className="font-mono" style={{ color: "#0d9488" }}>POST /api/v1/claim-check</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
