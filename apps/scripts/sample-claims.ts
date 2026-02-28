/**
 * Pre-built structured claim data for testing the scoring pipeline.
 * These represent what the extraction → mapping → validation pipeline would produce.
 */

import type {
  ClaimBundle,
  ClinicalContext,
  ClinicalValidationResult,
} from "@compliance-shield/shared";

// ─── Scenario 1: Likely Approval ─────────────────────────────────────────────
// John Smith: 8 weeks symptoms, 6 weeks PT, positive SLR, motor deficits, prior X-ray

export const APPROVE_CLAIM_BUNDLE: ClaimBundle = {
  patient: {
    name: "John Smith",
    dob: "1965-03-15",
    gender: "male",
    member_id: "UHC-88234571",
    payer_id: "uhc",
  },
  conditions: [
    {
      code: "M54.41",
      display: "Lumbago with sciatica, left side",
      clinical_status: "active",
      onset_date: "2025-11-15",
      severity: "moderate",
    },
    {
      code: "M54.5",
      display: "Low back pain",
      clinical_status: "active",
      onset_date: "2025-11-15",
      severity: "moderate",
    },
    {
      code: "M51.36",
      display: "Other intervertebral disc degeneration, lumbar region",
      clinical_status: "active",
      onset_date: null,
      severity: "mild",
    },
  ],
  procedures: [
    {
      code: "72148",
      display: "MRI lumbar spine without contrast",
      status: "proposed",
      date: "2026-01-15",
      body_site: "lumbar spine",
    },
  ],
  medications: [
    {
      code: "naproxen",
      display: "Naproxen 500mg",
      dosage: "500mg",
      frequency: "BID",
      duration_weeks: 6,
    },
  ],
  claim: {
    claim_type: "professional",
    priority: "normal",
    diagnosis_codes: ["M54.41", "M54.5", "M51.36"],
    procedure_codes: ["72148"],
    medication_codes: [],
    provider_npi: "1234567890",
    facility_type: "outpatient",
    service_date: "2026-01-15",
  },
  supporting_info: {
    conservative_treatment:
      "Physical therapy 2x/week for 6 weeks (12 sessions) at ABC Physical Therapy — no significant improvement. Naproxen 500mg BID for 6 weeks — minimal relief. Activity modification and home exercise program — compliant but no improvement.",
    physical_exam_findings:
      "Lumbar ROM limited flexion 40 degrees. SLR positive left at 35 degrees. Motor: left EHL 4/5, left tibialis anterior 4+/5. Sensory: decreased light touch left L5 dermatome. Reflexes: left Achilles diminished 1+ vs right 2+. Gait antalgic.",
    symptom_duration_weeks: 8,
    prior_imaging:
      "Lumbar X-ray 12/01/2025: Mild degenerative changes L4-L5, L5-S1. No fracture or listhesis.",
    lab_results: null,
    lifestyle_modifications: "Activity modification, home exercise program",
    prior_medications: ["Naproxen 500mg BID"],
  },
};

export const APPROVE_CLINICAL_CONTEXT: ClinicalContext = {
  procedure_category: "mri_spine",
  body_region: "lumbar",
  conservative_treatment: {
    physical_therapy_completed: true,
    physical_therapy_weeks: 6,
    physical_therapy_sessions: 12,
    nsaid_trial: true,
    nsaid_duration_weeks: 6,
    muscle_relaxant_trial: false,
    analgesic_trial: true,
    activity_modification: true,
    total_conservative_weeks: 8,
    treatments_tried: ["physical_therapy", "nsaids", "analgesics", "activity_modification"],
  },
  neurological_exam: {
    straight_leg_raise: { positive: true, side: "left", angle_degrees: 35 },
    motor_exam: {
      deficit_present: true,
      muscle_groups_tested: ["EHL", "tibialis_anterior"],
      weakest_grade: "4/5",
      laterality: "left",
    },
    sensory_exam: {
      deficit_present: true,
      dermatomal_mapping: true,
      affected_dermatomes: ["L5"],
    },
    reflex_exam: {
      abnormal: true,
      reflexes_tested: ["achilles", "patellar"],
      findings: ["diminished left achilles 1+ vs right 2+"],
    },
    nerve_root_level: "L5",
    exam_completeness: "full",
  },
  imaging_history: {
    prior_xray: true,
    prior_xray_findings: "Mild degenerative changes L4-L5, L5-S1. No fracture or listhesis.",
    prior_mri: false,
    prior_ct: false,
    prior_imaging_modalities: ["xray"],
  },
  clinical_indicators: {
    spinal_stenosis: false,
    cauda_equina_syndrome: false,
    progressive_neurological_deficit: false,
    severe_pain_requiring_hospitalization: false,
    suspected_infection: false,
    suspected_malignancy: false,
    suspected_fracture: false,
    post_surgical_evaluation: false,
    myelopathy: false,
    spondylolisthesis: false,
    radiculopathy: true,
    symptom_duration_weeks: 8,
    pain_severity: "moderate",
    functional_limitation: true,
    red_flags_present: [],
  },
  documentation_quality: {
    has_physical_exam: true,
    has_history_of_present_illness: true,
    has_treatment_history: true,
    has_functional_assessment: true,
    has_prior_imaging_results: true,
    missing_elements: [],
  },
};

export const APPROVE_VALIDATION_RESULT: ClinicalValidationResult = {
  overall_status: "pass",
  medical_necessity: {
    status: "pass",
    confidence: 0.92,
    findings:
      "Radiculopathy with objective motor and sensory deficits in L5 distribution. Failed 6 weeks of conservative therapy.",
    evidence: [
      "Left L5 radiculopathy with motor deficit (EHL 4/5)",
      "Positive SLR at 35 degrees",
      "6 weeks PT without improvement",
    ],
    recommendations: [],
  },
  step_therapy: {
    status: "pass",
    confidence: 0.95,
    findings:
      "Physical therapy (6 weeks, 12 sessions), NSAIDs (Naproxen 6 weeks), activity modification all completed.",
    evidence: [
      "12 PT sessions over 6 weeks",
      "Naproxen 500mg BID for 6 weeks",
      "Home exercise program",
    ],
    recommendations: [],
  },
  documentation: {
    status: "pass",
    confidence: 0.9,
    findings:
      "Comprehensive documentation with detailed neurological exam, treatment history, prior imaging, and functional assessment.",
    evidence: [
      "Motor exam with specific muscle groups",
      "Dermatomal sensory mapping",
      "Prior X-ray results documented",
    ],
    recommendations: [],
  },
};

// ─── Scenario 2: Likely Denial ───────────────────────────────────────────────
// Maria Garcia: 2 weeks symptoms, no PT, negative neuro exam, no prior imaging

export const DENY_CLAIM_BUNDLE: ClaimBundle = {
  patient: {
    name: "Maria Garcia",
    dob: "1978-07-22",
    gender: "female",
    member_id: "AETNA-44567123",
    payer_id: "aetna",
  },
  conditions: [
    {
      code: "M54.5",
      display: "Low back pain",
      clinical_status: "active",
      onset_date: "2026-01-06",
      severity: "mild",
    },
  ],
  procedures: [
    {
      code: "72148",
      display: "MRI lumbar spine without contrast",
      status: "proposed",
      date: "2026-01-20",
      body_site: "lumbar spine",
    },
  ],
  medications: [],
  claim: {
    claim_type: "professional",
    priority: "normal",
    diagnosis_codes: ["M54.5"],
    procedure_codes: ["72148"],
    medication_codes: [],
    provider_npi: "9876543210",
    facility_type: "outpatient",
    service_date: "2026-01-20",
  },
  supporting_info: {
    conservative_treatment: "OTC ibuprofen for 2 weeks — some relief",
    physical_exam_findings:
      "Full ROM with mild discomfort at end-range flexion. SLR negative bilaterally. Motor 5/5 throughout. Sensory intact. Reflexes 2+ symmetric. Gait normal.",
    symptom_duration_weeks: 2,
    prior_imaging: null,
    lab_results: null,
    lifestyle_modifications: null,
    prior_medications: ["OTC ibuprofen"],
  },
};

export const DENY_CLINICAL_CONTEXT: ClinicalContext = {
  procedure_category: "mri_spine",
  body_region: "lumbar",
  conservative_treatment: {
    physical_therapy_completed: false,
    physical_therapy_weeks: null,
    physical_therapy_sessions: null,
    nsaid_trial: true,
    nsaid_duration_weeks: 2,
    muscle_relaxant_trial: false,
    analgesic_trial: false,
    activity_modification: false,
    total_conservative_weeks: 2,
    treatments_tried: ["nsaids"],
  },
  neurological_exam: {
    straight_leg_raise: { positive: false, side: null, angle_degrees: null },
    motor_exam: {
      deficit_present: false,
      muscle_groups_tested: [],
      weakest_grade: null,
      laterality: null,
    },
    sensory_exam: {
      deficit_present: false,
      dermatomal_mapping: false,
      affected_dermatomes: [],
    },
    reflex_exam: {
      abnormal: false,
      reflexes_tested: ["achilles", "patellar"],
      findings: ["2+ and symmetric bilaterally"],
    },
    nerve_root_level: null,
    exam_completeness: "partial",
  },
  imaging_history: {
    prior_xray: false,
    prior_xray_findings: null,
    prior_mri: false,
    prior_ct: false,
    prior_imaging_modalities: [],
  },
  clinical_indicators: {
    spinal_stenosis: false,
    cauda_equina_syndrome: false,
    progressive_neurological_deficit: false,
    severe_pain_requiring_hospitalization: false,
    suspected_infection: false,
    suspected_malignancy: false,
    suspected_fracture: false,
    post_surgical_evaluation: false,
    myelopathy: false,
    spondylolisthesis: false,
    radiculopathy: false,
    symptom_duration_weeks: 2,
    pain_severity: "mild",
    functional_limitation: false,
    red_flags_present: [],
  },
  documentation_quality: {
    has_physical_exam: true,
    has_history_of_present_illness: true,
    has_treatment_history: false,
    has_functional_assessment: false,
    has_prior_imaging_results: false,
    missing_elements: [
      "neurological_exam",
      "treatment_history",
      "prior_imaging",
      "functional_assessment",
    ],
  },
};

export const DENY_VALIDATION_RESULT: ClinicalValidationResult = {
  overall_status: "fail",
  medical_necessity: {
    status: "fail",
    confidence: 0.85,
    findings:
      "Non-specific low back pain without radiculopathy or neurological deficits. No red flags present.",
    evidence: ["No radicular symptoms", "Normal neurological exam", "Symptom duration only 2 weeks"],
    recommendations: [
      "Complete at least 4-6 weeks of conservative therapy before imaging",
      "Consider physical therapy referral",
    ],
  },
  step_therapy: {
    status: "fail",
    confidence: 0.9,
    findings:
      "Only 2 weeks of OTC NSAIDs. No physical therapy, no prescription medications, no activity modification program.",
    evidence: ["2 weeks OTC ibuprofen only"],
    recommendations: [
      "Initiate physical therapy program (minimum 4-6 weeks)",
      "Consider prescription NSAIDs or muscle relaxants",
      "Document activity modification plan",
    ],
  },
  documentation: {
    status: "pass_with_findings",
    confidence: 0.7,
    findings:
      "Basic physical exam documented but missing detailed neurological exam, functional assessment, and treatment history.",
    evidence: ["Basic PE present", "No detailed motor/sensory exam", "No functional assessment"],
    recommendations: [
      "Add detailed neurological exam with specific muscle group testing",
      "Include functional assessment",
      "Document conservative treatment plan",
    ],
  },
};
