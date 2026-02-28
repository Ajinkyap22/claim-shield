# Sample Data for Testing

This folder contains sample clinician documentation for testing the Healthcare Claim Shield extraction and normalization pipeline.

## Files

### `lumbar-spine-note.txt`
**Canonical clinical note** for lumbar spine / back pain claim. This is the single source of truth for all three formats.

**Usage:**
- **Textarea input**: Copy-paste this content into the "Claim documentation" textarea, or use the "Load sample" dropdown → "Lumbar spine / back pain" in the UI.
- **PDF generation**: The PDF generator script (`scripts/generate-lumbar-sample-pdf.mjs`) reads this file to create the PDF version.

**Content highlights:**
- Patient: 50-year-old male with chronic low back pain
- Denial-prone elements: Unspecified laterality (M54.50), vague conservative care duration ("several weeks of PT"), no documented prior authorization for epidural injection
- ICD-10 codes: M54.50, M51.26, M54.16
- CPT codes: 99214 (office visit), 97110 (therapeutic exercises), 97140 (manual therapy), 62323 (epidural injection)

### `lumbar-spine-note.pdf`
**PDF version** of the clinical note for testing the "documentation PDF upload" path.

**Usage:**
- Upload this file via the "Upload doc/image" button in the UI (under "Claim documentation" section).
- The backend will parse this PDF and extract the text for normalization.

**Regeneration:**
If you need to regenerate this PDF after editing `lumbar-spine-note.txt`, run:
```bash
node scripts/generate-lumbar-sample-pdf.mjs
```

### `lumbar-spine-dictation-script.txt`
**Dictation-style script** for audio input testing. Same clinical content, formatted for natural speech.

**Usage:**
- **Audio recording**: Record yourself reading this script, then upload the audio file via "Record or upload audio" in the UI.
- **TTS (Text-to-Speech)**: Use a TTS tool to generate an audio file from this script, then upload it.
- The backend will use Whisper (or equivalent) to transcribe the audio, then normalize the transcript to FHIR.

**Note:** The script uses natural dictation phrasing (e.g., "4 out of 5" instead of "4/5") for better speech recognition accuracy.

## Testing Workflow

1. **Text input**: Use `lumbar-spine-note.txt` or the "Load sample" dropdown in the UI.
2. **PDF input**: Upload `lumbar-spine-note.pdf` via "Upload doc/image".
3. **Audio input**: Record or generate audio from `lumbar-spine-dictation-script.txt`, then upload.

All three paths should produce similar FHIR-normalized output when processed by the backend pipeline.

## Denial Risk Testing

This sample is intentionally **denial-prone** to exercise the dual-agent and denial-risk scoring:

- **Laterality gap**: Primary diagnosis M54.50 (unspecified laterality) despite left-sided symptoms documented in exam
- **Conservative care duration**: Vague "several weeks of PT" (many policies require 6–12 weeks documented)
- **Prior authorization**: Epidural injection (CPT 62323) mentioned in plan without documented prior auth approval
- **Modifier gaps**: Procedures listed without laterality modifiers (e.g., -LT/-RT) where applicable

The Payer Agent should flag these gaps and cite specific policy sections, producing a meaningful Denial Risk Score (likely in the 60–80 range).
