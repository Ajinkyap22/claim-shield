/**
 * Aetna Clinical Policy Bulletin 0236 - MRI and CT of the Spine
 * Source: https://www.aetna.com/cpb/medical/data/200_299/0236.html
 *
 * This is the policy text used for testing the RAG ingestion pipeline.
 */

export const AETNA_POLICY_TEXT = `
AETNA CLINICAL POLICY BULLETIN 0236
Magnetic Resonance Imaging (MRI) and Computed Tomography (CT) of the Spine

POLICY

Scope of Policy
This Clinical Policy Bulletin addresses magnetic resonance imaging (MRI) and computed tomography (CT) of the spine.

MEDICAL NECESSITY
Aetna considers magnetic resonance imaging (MRI) and computed tomography (CT) of the spine medically necessary when any of the following criteria is met:

- Clinical evidence of spinal stenosis; or
- Clinical suspicion of a spinal cord or cauda equina compression syndrome; or
- Congenital anomalies or deformities of the spine; or
- Diagnosis and evaluation of lumbar epidural lipomatosis; or
- Evaluation of recurrent symptoms after spinal surgery; or
- Evaluation prior to epidural injection to rule out tumor or infection and to delineate the optimal anatomical location for performing the injection; or
- Follow-up of evaluation for spinal malignancy or spinal infection; or
- Known or suspected myelopathy (e.g., multiple sclerosis) for initial diagnosis when MRI of the brain is negative or symptoms mimic those of other spinal or brainstem lesions; or
- Known or suspected primary spinal cord tumors (malignant or non-malignant); or
- Persistent back or neck pain with radiculopathy as evidenced by pain plus objective findings of motor or reflex changes in the specific nerve root distribution, and no improvement after 6 weeks of conservative therapy*; or
- Primary spinal bone tumors or suspected vertebral, paraspinal, or intraspinal metastases; or
- Progressively severe symptoms despite conservative management; or
- Rapidly progressing neurological deficit, or major motor weakness; or
- Severe back pain (e.g., requiring hospitalization); or
- Spondylolisthesis and degenerative disease of the spine that has not responded to 4 weeks of conservative therapy*; or
- Suspected infectious process (e.g., osteomyelitis epidural abscess of the spine or soft tissue); or
- Suspected spinal cord injury secondary to trauma; or
- Suspected spinal fracture and/or dislocation secondary to trauma (if plain films are not conclusive); or
- Suspected transverse myelitis.

* Conservative therapy = moderate activity, analgesics, non-steroidal anti-inflammatory drugs, muscle relaxants.

EXPERIMENTAL, INVESTIGATIONAL, OR UNPROVEN
Aetna considers MRI and CT of the spine experimental, investigational, or unproven for all other indications because their clinical value for indications other than the ones listed above has not been established.

Clinical guidelines, including those from the Agency for Healthcare Policy and Research, have consistently recommended against routine imaging studies for acute low back pain.

APPLICABLE CPT CODES
CPT codes covered if selection criteria are met:
72125 - Computed tomography, cervical spine; without contrast material
72126 - with contrast material
72127 - without contrast material, followed by contrast material(s) and further sections
72128 - Computed tomography, thoracic spine; without contrast material
72129 - with contrast material
72130 - without contrast material, followed by contrast material(s) and further sections
72131 - Computed tomography, lumbar spine; without contrast material
72132 - with contrast material
72133 - without contrast material, followed by contrast material(s) and further sections
72141 - Magnetic resonance imaging, spinal canal and contents, cervical; without contrast material
72142 - with contrast material(s)
72146 - Magnetic resonance imaging, spinal canal and contents, thoracic; without contrast material
72147 - with contrast material(s)
72148 - Magnetic resonance imaging, spinal canal and contents, lumbar; without contrast material
72149 - with contrast material(s)
72156 - Magnetic resonance imaging, spinal canal and contents, without contrast material, followed by contrast material(s) and further sequences; cervical
72157 - thoracic
72158 - lumbar

ICD-10 CODES COVERED IF SELECTION CRITERIA ARE MET
G83.4 - Cauda equina syndrome
M48.00 - M48.08 - Spinal stenosis
M50.10 - M50.13 - Cervical disc disorder with radiculopathy
M51.14 - M54.17 - Thoracic or lumbosacral neuritis or radiculopathy
M54.10 - M54.18 - Neuralgia, neuritis, and radiculitis
M54.30 - M54.32 - Sciatica
M54.41 - Lumbago with sciatica, right side
M54.42 - Lumbago with sciatica, left side
M54.5 - Low back pain
M54.9 - Dorsalgia, unspecified

BACKGROUND
MRI is the preferred method of imaging for each of the medically necessary indications listed in the Policy section. MRI or CT evaluation of chronic mechanical low back pain without radiculopathy or neurologic deficit, trauma, or clinical suspicion of systemic disorder is not necessary unless back pain is severe or where symptoms are progressing despite conservative management.

The American College of Physicians has recommended against obtaining imaging studies in patients with non-specific low back pain. Imaging of the lower spine before six weeks does not improve outcomes, but does increase costs. The North American Spine Society has issued similar recommendations.

Prior plain radiography (X-ray) is recommended before advanced imaging to rule out bony abnormalities such as fractures, listhesis, or congenital anomalies.

DOCUMENTATION REQUIREMENTS
Clinical documentation should include:
- Detailed history of present illness including onset, duration, and character of symptoms
- Physical examination findings including neurological examination
- Motor examination with specific muscle group testing (EHL, tibialis anterior)
- Sensory examination with dermatomal mapping
- Straight leg raise test results
- Reflex examination
- Prior imaging results if available
- Conservative treatment history with specific durations
- Functional assessment demonstrating impact on daily activities
`;

export const AETNA_INGEST_METADATA = {
  payer_id: "aetna",
  payer_name: "Aetna",
  policy_name: "CPB 0236 - MRI and CT of the Spine",
  source_url: "https://www.aetna.com/cpb/medical/data/200_299/0236.html",
};
