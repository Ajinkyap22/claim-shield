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
  Play,
  Pause,
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
    id: "lumbar",
    label: "Lumbar spine / back pain",
    content: `Patient: Michael R., DOB 11/08/1975
Date of Service: 02/25/2026

Chief Complaint: Chronic low back pain with radicular symptoms into the lower extremity.

History: Patient is a 50-year-old male presenting with a 6-month history of progressive low back pain. Pain began insidiously and has worsened over time, now radiating into the left leg with associated numbness and tingling. Patient reports difficulty with prolonged sitting and standing. Pain is exacerbated by forward flexion and lifting.

Treatment history: Patient has undergone several weeks of physical therapy with minimal improvement. Has tried over-the-counter NSAIDs (ibuprofen 600mg TID) with partial relief. No prior injections or surgical interventions.

Physical Examination:
- General: Alert, cooperative, in mild distress
- Lumbar spine: Decreased range of motion in flexion (limited to 60 degrees), extension limited to 15 degrees
- Straight leg raise: Positive on the left at 45 degrees, reproducing radicular symptoms
- Motor: 4/5 strength in left ankle dorsiflexion, otherwise 5/5 throughout
- Sensory: Decreased sensation to light touch in L5 distribution on the left
- Reflexes: Left Achilles reflex diminished (1+), right normal (2+)

Imaging: Recent lumbar MRI (02/15/2026) shows L4-L5 and L5-S1 disc herniation with moderate central canal stenosis and left foraminal narrowing at L5-S1.

Assessment:
- M54.50: Low back pain, unspecified (primary diagnosis)
- M51.26: Other intervertebral disc displacement, lumbar region
- M54.16: Radiculopathy, lumbar region

Plan:
1. Continue physical therapy with focus on core strengthening and lumbar stabilization exercises (CPT 97110 - Therapeutic exercises)
2. Manual therapy for soft tissue mobilization (CPT 97140 - Manual therapy)
3. Consider epidural steroid injection if conservative measures fail (CPT 62323 - Injection, epidural, lumbar/sacral)
4. Follow-up in 4 weeks to reassess symptoms and response to treatment
5. Prescribed meloxicam 15mg daily for pain management

Attending: Dr. James Martinez, MD, Physical Medicine & Rehabilitation
Facility: Central Spine & Pain Management Center
NPI: 9876543210`,
  },
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

const DOC_IMAGE_ACCEPT = ".pdf,.doc,.docx,.txt,image/*";

/** Seed heights for waveform bars; repeated to fill width. */
const WAVEFORM_SEED = [
  40, 65, 35, 90, 85, 70, 30, 90, 10, 20, 38, 75, 42, 85, 48,
];
const BAR_WIDTH_PX = 4;
const MIN_BARS = 24;
const MAX_BARS = 280;

function AudioWaveform({ isPlaying }: { isPlaying: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [barCount, setBarCount] = useState(MIN_BARS);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateCount = () => {
      const w = el.offsetWidth;
      const count = Math.min(
        MAX_BARS,
        Math.max(MIN_BARS, Math.floor(w / BAR_WIDTH_PX)),
      );
      setBarCount(count);
    };
    updateCount();
    const ro = new ResizeObserver(updateCount);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const heights = Array.from(
    { length: barCount },
    (_, i) => WAVEFORM_SEED[i % WAVEFORM_SEED.length],
  );

  return (
    <div
      ref={containerRef}
      className="flex items-end gap-0.5 h-8 w-full min-w-0 flex-1"
      aria-hidden
    >
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 min-w-[2px] rounded-full transition-all duration-150"
          style={{
            height: `${h}%`,
            maxHeight: "100%",
            backgroundColor: isPlaying ? "var(--teal-600)" : "var(--teal-500)",
            opacity: isPlaying ? 1 : 0.8,
          }}
        />
      ))}
    </div>
  );
}

export function InputForm({ onSubmit, loading }: InputFormProps) {
  const [note, setNote] = useState("");
  const [audioStatus, setAudioStatus] = useState<AudioStatus>("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioFiles, setAudioFiles] = useState<File[]>([]);
  const [policyFiles, setPolicyFiles] = useState<File[]>([]);
  const [docImageFiles, setDocImageFiles] = useState<File[]>([]);
  const [sampleDropdownOpen, setSampleDropdownOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);
  const policyFileRef = useRef<HTMLInputElement>(null);
  const docImageFileRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  const playAudio = (index: number) => {
    if (playingIndex === index) {
      audioRef.current?.pause();
      setPlayingIndex(null);
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      return;
    }
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const file = audioFiles[index];
    if (!file) return;
    const url = URL.createObjectURL(file);
    audioUrlRef.current = url;
    const audio = audioRef.current || new Audio();
    audioRef.current = audio;
    audio.src = url;
    audio.onended = () => {
      setPlayingIndex(null);
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
    audio.play().catch(() => setPlayingIndex(null));
    setPlayingIndex(index);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordingChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size) recordingChunksRef.current.push(e.data);
      };
      recorder.start();
      setAudioStatus("recording");
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setAudioStatus("idle");
      setNote((prev) =>
        prev
          ? prev + "\n\n[Sample note for demo]\n" + MOCK_TRANSCRIPT
          : MOCK_TRANSCRIPT,
      );
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setAudioStatus("transcribing");
    const recorder = mediaRecorderRef.current;
    const stream = mediaStreamRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => {
        const chunks = recordingChunksRef.current.filter((b) => b.size > 0);
        const blob = new Blob(chunks, {
          type: recorder.mimeType || "audio/webm",
        });
        const file = new File([blob], "recording.webm", {
          type: recorder.mimeType || "audio/webm",
        });
        setAudioFiles((prev) => [...prev, file]);
        setAudioStatus("transcribed");
        stream?.getTracks().forEach((t) => t.stop());
      };
      recorder.stop();
    } else {
      setAudioStatus("transcribed");
      setNote((prev) =>
        prev
          ? prev + "\n\n[Sample note for demo]\n" + MOCK_TRANSCRIPT
          : MOCK_TRANSCRIPT,
      );
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;
    setAudioFiles((prev) => [...prev, ...files]);
    setAudioStatus("transcribed");
    if (audioFileRef.current) audioFileRef.current.value = "";
  };

  const resetAudio = () => {
    audioRef.current?.pause();
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setPlayingIndex(null);
    setAudioStatus("idle");
    setRecordingSeconds(0);
    setAudioFiles([]);
    if (audioFileRef.current) audioFileRef.current.value = "";
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
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

  const canSubmit =
    (note.trim().length > 20 || audioFiles.length > 0) && !loading;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || (!e.ctrlKey && !e.metaKey)) return;
      e.preventDefault();
      if (!((note.trim().length > 20 || audioFiles.length > 0) && !loading))
        return;
      onSubmit({
        clinicalNote: note,
        audioFiles: [...audioFiles],
        policyFiles: [...policyFiles],
        documentationFiles: [...docImageFiles],
      });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [note, audioFiles, policyFiles, docImageFiles, loading, onSubmit]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      {/* Clinical documentation */}
      <div
        className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden transition-[box-shadow] duration-300 hover:shadow-[var(--shadow-card-hover)]"
        style={{
          boxShadow: "var(--shadow-card)",
          borderLeft: "3px solid var(--teal-500)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-teal-50 border border-teal-100/80">
              <FileText className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <span
                className="font-display text-slate-700"
                style={{ fontSize: "0.9rem", fontWeight: 600 }}
              >
                Claim documentation
              </span>
              <span
                className="text-red-500 ml-0.5"
                style={{ fontSize: "0.75rem" }}
              >
                *
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <button
                type="button"
                onClick={() => setSampleDropdownOpen((o) => !o)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-teal-600 hover:bg-teal-50 hover:border-teal-200 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:ring-offset-2"
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
                    className="absolute right-0 top-full mt-1 z-20 py-1 rounded-xl border border-slate-200/80 bg-white min-w-[200px]"
                    style={{ boxShadow: "var(--shadow-card-hover)" }}
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:ring-offset-2 disabled:opacity-50"
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
              Documentation ({docImageFiles.length} file
              {docImageFiles.length !== 1 ? "s" : ""})
            </span>
            {docImageFiles.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center justify-between gap-2"
              >
                <span
                  className="text-slate-600 truncate"
                  style={{ fontSize: "0.78rem" }}
                >
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
          className="w-full px-5 py-4 text-slate-700 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:ring-offset-0 transition-all duration-200 rounded-b-2xl"
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
        <div
          className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden transition-[box-shadow] duration-300 hover:shadow-[var(--shadow-card-hover)]"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-teal-50/70">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-teal-100">
              <AudioLines className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <span
                className="font-display text-slate-700"
                style={{ fontSize: "0.9rem", fontWeight: 600 }}
              >
                Audio documentation
              </span>
              <span
                className="text-slate-400 ml-1"
                style={{ fontSize: "0.72rem" }}
              >
                (optional)
              </span>
            </div>
          </div>
          <div className="p-4">
            {audioStatus === "idle" && (
              <div className="flex gap-2">
                <button
                  onClick={startRecording}
                  disabled={loading}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-red-50 hover:border-red-200 text-slate-600 hover:text-red-600 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-400/20 focus:ring-offset-2 disabled:opacity-50"
                  style={{ fontSize: "0.8rem" }}
                >
                  <Mic className="w-3.5 h-3.5" />
                  Record
                </button>
                <button
                  onClick={() => audioFileRef.current?.click()}
                  disabled={loading}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:ring-offset-2 disabled:opacity-50"
                  style={{ fontSize: "0.8rem" }}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload
                </button>
                <input
                  ref={audioFileRef}
                  type="file"
                  accept="audio/*"
                  multiple
                  className="hidden"
                  onChange={handleAudioUpload}
                />
              </div>
            )}

            {audioStatus === "recording" && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                  <span
                    className="text-red-600"
                    style={{ fontSize: "0.8rem", fontWeight: 600 }}
                  >
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
                <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>
                  Transcribing audio…
                </span>
              </div>
            )}

            {(audioStatus === "transcribed" || audioStatus === "uploaded") &&
              audioFiles.length > 0 && (
                <div className="space-y-2">
                  {audioFiles.map((file, i) => (
                    <div
                      key={`${file.name}-${i}`}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-teal-50 border border-teal-100"
                    >
                      <button
                        type="button"
                        onClick={() => playAudio(i)}
                        className="flex items-center justify-center w-9 h-9 rounded-full bg-teal-500 text-white hover:bg-teal-600 transition-colors shrink-0"
                        aria-label={playingIndex === i ? "Pause" : "Play"}
                      >
                        {playingIndex === i ? (
                          <Pause className="w-4 h-4 fill-current" />
                        ) : (
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0 flex items-center w-full">
                        <AudioWaveform isPlaying={playingIndex === i} />
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={resetAudio}
                      className="text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1"
                      style={{ fontSize: "0.75rem" }}
                    >
                      <X className="w-3.5 h-3.5" />
                      Remove all audio
                    </button>
                  </div>
                </div>
              )}
          </div>
          <audio ref={audioRef} className="hidden" />
        </div>

        {/* Policy PDF */}
        <div
          className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden transition-[box-shadow] duration-300 hover:shadow-[var(--shadow-card-hover)]"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-teal-50/70">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-teal-100">
              <Paperclip className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <span
                className="font-display text-slate-700"
                style={{ fontSize: "0.9rem", fontWeight: 600 }}
              >
                Payer Policy
              </span>
              <span
                className="text-slate-400 ml-1"
                style={{ fontSize: "0.72rem" }}
              >
                (PDF)
              </span>
            </div>
          </div>
          <div className="p-4">
            <button
              onClick={() => policyFileRef.current?.click()}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-slate-200 hover:border-teal-300 text-slate-500 hover:text-teal-600 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 w-full justify-center focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:ring-offset-2 disabled:opacity-50"
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
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-2 pt-2">
        <button
          onClick={() =>
            onSubmit({
              clinicalNote: note,
              audioFiles: [...audioFiles],
              policyFiles: [...policyFiles],
              documentationFiles: [...docImageFiles],
            })
          }
          disabled={!canSubmit}
          className="flex items-center gap-3 px-8 py-3.5 rounded-xl text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-[var(--shadow-glow-teal)] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:ring-offset-2 disabled:hover:scale-100 disabled:active:scale-100 disabled:hover:shadow-none"
          style={{
            background: canSubmit
              ? "linear-gradient(135deg, var(--navy-900) 0%, var(--navy-700) 100%)"
              : "#94a3b8",
            boxShadow: canSubmit ? "0 4px 14px rgba(15, 39, 68, 0.25)" : "none",
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
        {note.trim().length <= 20 && !audioFiles.length && (
          <p className="text-slate-400" style={{ fontSize: "0.75rem" }}>
            Add claim documentation or attach audio to continue
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
