# Healthcare Claim Shield — Frontend Spec

How the frontend looks and behaves for the Compliance Shield: provider-facing UI for pre-submit claim checks with Denial Risk Score and policy-cited recommendations.

---

## 1. Overall flow (single main flow)

```
[Input] → [Run check] → [Results]
```

- **Input:** Doctor note (text and/or audio) + optional policy PDF.
- **Action:** One primary button: “Run compliance check” (or “Check before submit”).
- **Results:** Denial Risk Score, structured summary, clinician/payer view, and policy-cited recommendations.

Keep the flow linear so it’s demo-friendly and easy to embed later (e.g. “Check before submit” in a client portal).

---

## 2. Layout and structure

- **Single main page** (or a simple “Input” step and “Results” step on the same page).
- **Header:** Product name (e.g. “Compliance Shield” or “Claim Shield”), optional org logo for white-label.
- **Main area:** Input section on top; after submit, results section below (or replace input with a “New check” button to reset).
- **Footer (optional):** Short disclaimer, “Powered by [Org],” or integration/help link.

No login required for the hackathon demo; later the org can add auth when offering to clients.

---

## 3. Input section

**Purpose:** Collect everything needed for one compliance check.

| Element | Description |
|--------|-------------|
| **Doctor note** | Large text area (e.g. 6–8 lines). Placeholder: “Paste or type the clinical note / dictation…” |
| **Audio (optional)** | “Record or upload audio” — record in browser or file upload. Show a short status: “Recording…” / “Uploaded” / “Transcribing…” then show transcript in or next to the text area. |
| **Policy PDF** | File input: “Upload insurance policy (PDF).” Show file name after upload; allow remove/replace. |
| **Primary action** | Single prominent button: **“Run compliance check”** (or “Check before submit”). Disable while request is in flight; optional loading spinner. |

Layout idea:

- Left or top: Note (text + optional audio).
- Right or below: Policy PDF upload.
- Full width: “Run compliance check” button.

Keep it one column on mobile; two columns on desktop if space allows.

---

## 4. Results section (after “Run compliance check”)

**Purpose:** Show one number (Denial Risk Score), who said what (clinician vs payer), and what to fix (policy-cited).

Show this section only after a successful run. If the backend returns an error, show a short error message and optionally “Try again.”

### 4.1 Denial Risk Score (hero)

- **Big number:** 0–100, e.g. “72”.
- **Short label:** “Denial Risk Score” or “Pre-submit risk”.
- **Color / semantics (suggested):** Green band (e.g. 0–30), Amber (e.g. 31–70), Red (e.g. 71–100). Or a simple gradient/bar so judges see “one number that matters.”
- **One-line explanation:** From backend, e.g. “Prior auth and laterality missing; Policy 4.2.1, 3.1.”

This is the main “takeaway” for the demo and for clients.

### 4.2 Claim summary (FHIR-like)

- **Collapsible or default-open card:** “Claim summary” or “Structured claim.”
- **Content:** Short, readable summary of what was extracted: e.g. diagnoses, procedures, codes (ICD-10/CPT if available). Can be bullet list or small table; no need for raw FHIR JSON unless you want a “Technical” expandable section.

### 4.3 Clinician vs Payer view (dual-agent)

- **Two short blocks or tabs:**
  - **Clinician view:** “What’s documented” — brief summary from the Clinician Agent (e.g. “Procedure documented; laterality not specified.”).
  - **Payer view:** “Policy says” — brief summary from the Payer Agent (e.g. “Prior auth required for this code; Section 4.2.1.”).
- **Optional:** Simple “Agreement / Disagreement” or “Match / Gaps” highlight so the “two agents” story is visible.

### 4.4 Policy-cited recommendations

- **List of fixes:** Each item = one recommendation.
- **Per item:** Short title (e.g. “Add prior authorization reference”) + **policy citation** (e.g. “Policy Section 4.2.1”) + optional short quote or clause. Use a small, readable font for citations so “policy-cited” is obvious to judges and clients.
- **Optional:** “Copy” or “Export” for use in documentation or appeals.

### 4.5 Validation / medical check issues (if any)

- If the backend returns validation issues (e.g. invalid ICD-10, missing codes), show a small **“Validation issues”** block: bullet list of issues. Not the main hero, but visible so the “medical dataset check” is clear.

### 4.6 How your claim stands vs top US payers (optional / extension)

- **Purpose:** Extra context on the results page: show how the same claim would fare against **major US healthcare payers** (e.g. UnitedHealthcare, Aetna, Cigna, Humana, Anthem/Elevance) in addition to the user’s uploaded policy.
- **Content:** A compact block (card or small table): payer name, implied or estimated “risk” or “readiness” (e.g. score band or “Likely OK” / “Review needed”) per payer. Data can come from backend (e.g. comparing claim against known payer policy patterns or reference rules).
- **Placement:** Below the main score and recommendations, or in a collapsible “Compare with other payers.” Clearly labeled as **informational** (e.g. “How this claim might fare with other major payers”) so it doesn’t overshadow the primary result against the user’s own policy.
- **UX:** One row or card per payer; optional tooltip or short copy on why this is useful (e.g. “Useful for multi-payer practices and contracting.”). Keep it scannable so judges see “one number for my payer + context vs others.”

---

## 5. Visual hierarchy (for Design & UX scoring)

- **Primary:** Denial Risk Score (size, color, one-line explanation).
- **Secondary:** Policy-cited recommendations (actionable; citations visible).
- **Tertiary:** Clinician view, Payer view, claim summary, validation issues.
- **Optional / extension:** “Claim vs top US payers” block (informational, below main results).

Use clear headings, spacing, and one accent color (e.g. for the score and primary button) so the UI doesn’t look cluttered.

---

## 6. States and microcopy

| State | What to show |
|-------|------------------|
| Idle | Input form + “Run compliance check” enabled. |
| Loading | Button disabled; “Checking…” or spinner; optional “This may take a few seconds.” |
| Success | Full results section (score, summary, clinician/payer, recommendations). |
| Error | Message like “Check failed. Please try again.” Optional: brief reason if backend sends it. |
| Empty policy | Either allow run without policy (backend returns “No policy” message) or soft warning: “Upload a policy for coverage checks.” |

Keep copy short and action-oriented (“Run compliance check,” “Add prior auth,” “Policy Section 4.2.1”).

---

## 7. Responsiveness and embeddability

- **Desktop first:** Input and results readable in one view; score and recommendations above the fold if possible.
- **Mobile:** Single column; score stays prominent; recommendations and clinician/payer blocks stack vertically.
- **Embeddability (for org’s clients):** Avoid fixed widths; use a contained root (e.g. max-width container or full-width with padding) so the same UI can be dropped into an iframe or client portal later.

---

## 8. Optional “integration” touch for the demo

- A small **“Integration”** or **“API”** hint in the UI (e.g. in footer or a collapsible section): “This screen can be embedded in your billing workflow or called via API.” No need to build the API call from the UI for the hackathon; the hint supports the “easily integrable for the org to present to healthcare clients” story.

---

## 9. Summary: what’s on screen

| Area | Content |
|------|---------|
| Header | Product name; optional logo. |
| Input | Note (text + optional audio), policy PDF upload, “Run compliance check.” |
| Results | Denial Risk Score (0–100) + explanation; claim summary; clinician view; payer view; policy-cited recommendations; validation issues (if any); optional “how your claim stands vs top US payers” (e.g. UHC, Aetna, Cigna). |
| Footer (optional) | Disclaimer; “Embeddable / API” line for integrability story. |

This gives you a clear picture of how the frontend looks and behaves, and doubles as a spec for building it in Next.js (or any stack the org prefers).
