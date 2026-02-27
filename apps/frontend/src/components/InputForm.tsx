import { useState, useRef, useEffect } from "react";
import {
  Mic,
  Square,
  Upload,
  FileText,
  X,
  Loader2,
  ShieldCheck,
  Paperclip,
  AudioLines,
  ImagePlus,
  ChevronDown,
} from "lucide-react";
import type { ComplianceCheckPayload } from "@/types/compliance";

type AudioStatus =
  | "idle"
  | "recording"
  | "recorded"
  | "uploaded"
  | "transcribing"
  | "transcribed";

interface InputFormProps {
  /** Called with full payload; backend integration can send this directly (e.g. FormData). */
  onSubmit: (payload: ComplianceCheckPayload) => void;
  loading: boolean;
}

const SAMPLE_DATASETS = [
  {
    id: "knee",
    label: "Knee arthroplasty (orthopedic)",
    content: `Patient: Jane D., DOB 04/15/1972
Date of Service: 02/20/2026

Chief Complaint: Severe right knee pain with complete loss of function.

History: Patient presents with end-stage right knee osteoarthritis confirmed on standing AP radiographs showing bone-on-bone contact in medial and lateral compartments. ROM measured at 15°–95° with severe crepitus and varus deformity.

Treatment history: Conservative management attempted over 8 weeks including physical therapy (2x/week), NSAID therapy (naproxen 500mg BID), and two corticosteroid injections at 4-week intervals; all with inadequate pain relief.

Recommendation: Proceed with right total knee arthroplasty (CPT 27447). Diagnostic arthroscopy (CPT 29877) to assess cartilage integrity prior to implant placement.

Diagnoses:
- M17.11: Primary osteoarthritis, right knee
- M25.361: Stiffness of right knee

Attending: Dr. Sarah Chen, MD, Orthopedic Surgery
Facility: Metropolitan Orthopedic Surgical Center`,
  },
  {
    id: "cardiac",
    label: "Cardiac stress test",
    content: `Patient: Robert M., DOB 08/22/1965
Date of Service: 02/18/2026

Chief Complaint: Atypical chest discomfort with exertion; risk stratification for CAD.

History: Patient with hypertension and family history of premature CAD. No prior cardiac procedures. Referred for functional assessment after abnormal resting ECG (nonspecific ST changes).

Procedure: Symptom-limited treadmill stress test (Bruce protocol). Achieved 9.2 METs, 85% MPHR. No chest pain. No significant ST depression. BP response normal. Test negative for inducible ischemia.

Impression: Negative stress test. Low intermediate pretest probability. No evidence of inducible ischemia at 85% MPHR.

CPT: 93015 (Stress test, physician supervision only). Diagnosis: R10.9 (Unspecified abdominal pain), Z86.73 (Personal history of CAD). Place of Service: 11 (Office).`,
  },
  {
    id: "preventive",
    label: "Annual preventive visit",
    content: `Patient: Maria L., DOB 03/10/1980
Date of Service: 02/19/2026

Visit: Annual wellness visit, established patient. No acute complaints.

Preventive services: Comprehensive history and physical. Review of medications, allergies, immunizations. Depression screening (PHQ-2 negative). Fall risk screening. Advance care planning discussed; patient has existing advance directive on file.

Vitals: BP 118/72, BMI 24.2. No significant change from prior year.

Assessment: Healthy adult, age-appropriate preventive care completed. No additional workup needed.

Planned: Return in 1 year for next AWV. CPT 99396 (Preventive visit, 40–64). ICD-10 Z00.00 (Encounter for general adult medical examination without abnormal findings).`,
  },
];

const MOCK_TRANSCRIPT =
  "Patient is a 53-year-old female with longstanding right knee osteoarthritis. Conservative treatments over the past 8 weeks have failed. Recommending right total knee arthroplasty. Prior auth has been requested verbally.";

const DOC_IMAGE_ACCEPT = ".pdf,.doc,.docx,image/*";

export function InputForm({ onSubmit, loading }: InputFormProps) {
  const [note, setNote] = useState("");
  const [audioStatus, setAudioStatus] = useState<AudioStatus>("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioFileName, setAudioFileName] = useState("");
  const [policyFiles, setPolicyFiles] = useState<File[]>([]);
  const [docImageFiles, setDocImageFiles] = useState<File[]>([]);
  const [sampleDropdownOpen, setSampleDropdownOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);
  const policyFileRef = useRef<HTMLInputElement>(null);
  const docImageFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = () => {
    setAudioStatus("recording");
    setRecordingSeconds(0);
    timerRef.current = setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setAudioStatus("transcribing");
    setTimeout(() => {
      setAudioStatus("transcribed");
      setNote((prev) =>
        prev
          ? prev + "\n\n[Voice transcription]\n" + MOCK_TRANSCRIPT
          : MOCK_TRANSCRIPT
      );
    }, 2200);
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioFileName(file.name);
    setAudioStatus("transcribing");
    setTimeout(() => {
      setAudioStatus("transcribed");
      setNote((prev) =>
        prev
          ? prev + "\n\n[Audio transcription]\n" + MOCK_TRANSCRIPT
          : MOCK_TRANSCRIPT
      );
    }, 2500);
  };

  const resetAudio = () => {
    setAudioStatus("idle");
    setAudioFileName("");
    setRecordingSeconds(0);
    if (audioFileRef.current) audioFileRef.current.value = "";
  };

  const handlePolicyUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) {
      setPolicyFiles((prev) => [...prev, ...files]);
      if (policyFileRef.current) policyFileRef.current.value = "";
    }
  };

  const removePolicyFile = (index: number) => {
    setPolicyFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const loadSample = (content: string) => {
    setNote(content);
    setSampleDropdownOpen(false);
  };

  const handleDocImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) {
      setDocImageFiles((prev) => [...prev, ...files]);
      if (docImageFileRef.current) docImageFileRef.current.value = "";
    }
  };

  const removeDocImageFile = (index: number) => {
    setDocImageFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const canSubmit = note.trim().length > 20 && !loading;

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      {/* Clinical documentation */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500" />
            <span className="text-slate-700" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
              Claim documentation
            </span>
            <span className="text-red-500" style={{ fontSize: "0.75rem" }}>*</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <button
                type="button"
                onClick={() => setSampleDropdownOpen((o) => !o)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-teal-600 hover:bg-teal-50 hover:border-teal-200 transition-colors"
                style={{ fontSize: "0.75rem", fontWeight: 500 }}
              >
                Load sample
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {sampleDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    aria-hidden
                    onClick={() => setSampleDropdownOpen(false)}
                  />
                  <div
                    className="absolute right-0 top-full mt-1 z-20 py-1 rounded-lg border border-slate-200 bg-white shadow-lg min-w-[200px]"
                    role="listbox"
                  >
                    {SAMPLE_DATASETS.map((ds) => (
                      <button
                        key={ds.id}
                        type="button"
                        role="option"
                        onClick={() => loadSample(ds.content)}
                        className="w-full text-left px-3 py-2 text-slate-700 hover:bg-teal-50 text-sm"
                      >
                        {ds.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => docImageFileRef.current?.click()}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              style={{ fontSize: "0.75rem", fontWeight: 500 }}
            >
              <ImagePlus className="w-3.5 h-3.5" />
              Upload doc/image
            </button>
            <input
              ref={docImageFileRef}
              type="file"
              accept={DOC_IMAGE_ACCEPT}
              multiple
              className="hidden"
              onChange={handleDocImageUpload}
            />
          </div>
        </div>
        {docImageFiles.length > 0 && (
          <div className="px-5 py-2 border-b border-slate-100 bg-slate-50 space-y-1">
            <span className="text-slate-500" style={{ fontSize: "0.72rem" }}>
              Documentation ({docImageFiles.length} file{docImageFiles.length !== 1 ? "s" : ""})
            </span>
            {docImageFiles.map((file, i) => (
              <div key={`${file.name}-${i}`} className="flex items-center justify-between gap-2">
                <span className="text-slate-600 truncate" style={{ fontSize: "0.78rem" }}>
                  {file.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeDocImageFile(i)}
                  className="text-slate-400 hover:text-red-500 transition-colors shrink-0"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          className="w-full px-5 py-4 text-slate-700 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-shadow"
          style={{ fontSize: "0.875rem", lineHeight: 1.7, minHeight: "220px" }}
          placeholder="Paste or type claim documentation (clinical narrative, progress notes, dictation). Include diagnoses, procedures, and prior treatment history."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={loading}
        />
        {note && (
          <div className="px-5 py-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-slate-400" style={{ fontSize: "0.72rem" }}>
              {note.length} characters · {note.trim().split(/\s+/).length} words
            </span>
            <button
              onClick={() => setNote("")}
              className="text-slate-400 hover:text-slate-600 transition-colors"
              style={{ fontSize: "0.72rem" }}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Audio + Policy row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Audio */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <AudioLines className="w-4 h-4 text-slate-500" />
            <span className="text-slate-700" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
              Audio documentation
            </span>
            <span className="text-slate-400" style={{ fontSize: "0.72rem" }}>(optional)</span>
          </div>

          {audioStatus === "idle" && (
            <div className="flex gap-2">
              <button
                onClick={startRecording}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-red-50 hover:border-red-200 text-slate-600 hover:text-red-600 transition-all disabled:opacity-50"
                style={{ fontSize: "0.8rem" }}
              >
                <Mic className="w-3.5 h-3.5" />
                Record
              </button>
              <button
                onClick={() => audioFileRef.current?.click()}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 transition-all disabled:opacity-50"
                style={{ fontSize: "0.8rem" }}
              >
                <Upload className="w-3.5 h-3.5" />
                Upload
              </button>
              <input
                ref={audioFileRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleAudioUpload}
              />
            </div>
          )}

          {audioStatus === "recording" && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                <span className="text-red-600" style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                  Recording {formatTime(recordingSeconds)}
                </span>
              </div>
              <button
                onClick={stopRecording}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                style={{ fontSize: "0.75rem" }}
              >
                <Square className="w-3 h-3 fill-current" />
                Stop
              </button>
            </div>
          )}

          {audioStatus === "transcribing" && (
            <div className="flex items-center gap-2 text-teal-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>Transcribing audio…</span>
            </div>
          )}

          {(audioStatus === "transcribed" || audioStatus === "uploaded") && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                <span className="text-teal-700" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
                  {audioFileName ? audioFileName : "Recording"} merged into documentation
                </span>
              </div>
              <button onClick={resetAudio} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Policy PDF */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Paperclip className="w-4 h-4 text-slate-500" />
            <span className="text-slate-700" style={{ fontSize: "0.875rem", fontWeight: 600 }}>
              Payer Policy
            </span>
            <span className="text-slate-400" style={{ fontSize: "0.72rem" }}>(PDF)</span>
          </div>

          <button
            onClick={() => policyFileRef.current?.click()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-slate-200 hover:border-teal-300 text-slate-500 hover:text-teal-600 transition-all w-full justify-center disabled:opacity-50"
            style={{ fontSize: "0.8rem" }}
          >
            <Upload className="w-3.5 h-3.5" />
            Upload policy PDF{policyFiles.length > 0 ? " (add more)" : ""}
          </button>

          {policyFiles.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {policyFiles.map((file, i) => (
                <li
                  key={`${file.name}-${i}`}
                  className="flex items-center justify-between p-2 rounded-lg bg-teal-50 border border-teal-100"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                    <span
                      className="text-teal-700 truncate"
                      style={{ fontSize: "0.78rem", fontWeight: 500 }}
                      title={file.name}
                    >
                      {file.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePolicyFile(i)}
                    className="text-teal-500 hover:text-red-500 transition-colors ml-2 shrink-0"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {policyFiles.length === 0 && (
            <p className="text-slate-400 mt-2" style={{ fontSize: "0.7rem" }}>
              Uses default BlueCross policy if omitted
            </p>
          )}

          <input
            ref={policyFileRef}
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            onChange={handlePolicyUpload}
          />
        </div>
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-2 pt-2">
        <button
          onClick={() =>
            onSubmit({
              clinicalNote: note,
              policyFiles: [...policyFiles],
              documentationFiles: [...docImageFiles],
            })
          }
          disabled={!canSubmit}
          className="flex items-center gap-3 px-8 py-3.5 rounded-xl text-white transition-all shadow-md"
          style={{
            background: canSubmit
              ? "linear-gradient(135deg, #0f2744 0%, #1a4070 100%)"
              : "#94a3b8",
            cursor: canSubmit ? "pointer" : "not-allowed",
            fontSize: "1rem",
            fontWeight: 600,
            letterSpacing: "0.01em",
          }}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing claim…
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              Run Compliance Check
            </>
          )}
        </button>
        {!note.trim() && (
          <p className="text-slate-400" style={{ fontSize: "0.75rem" }}>
            Add claim documentation to continue
          </p>
        )}
        {note.trim() && !loading && (
          <p className="text-slate-400" style={{ fontSize: "0.75rem" }}>
            Checks against payer policy · No data stored
          </p>
        )}
      </div>
    </div>
  );
}
