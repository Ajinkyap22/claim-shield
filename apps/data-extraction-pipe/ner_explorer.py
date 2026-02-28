# from transformers import AutoTokenizer, AutoModelForTokenClassification
# from transformers import pipeline
# from time import time
# from datetime import datetime
# # from megrer_result import merge_entities


# print("Loading model...")
# model_name = "d4data/biomedical-ner-all"
# print(f"Loading tokenizer from {model_name}...")
# tokenizer = AutoTokenizer.from_pretrained(model_name)
# print(f"Loading model from {model_name}...")
# model = AutoModelForTokenClassification.from_pretrained(model_name)

# print("start time: ", datetime.now())

# CONFIDENCE_THRESHOLD = 0.80

# ner = pipeline("ner", model=model, tokenizer=tokenizer, aggregation_strategy="max")

# print("Loading pipeline...")

# text = medical_note = """Patient: Michael R., DOB 11/08/1975
# Date of Service: 02/25/2026

# Chief Complaint: Chronic low back pain with radicular symptoms into the lower extremity.

# History: Patient is a 50-year-old male presenting with a 6-month history of progressive low back pain. Pain began insidiously and has worsened over time, now radiating into the left leg with associated numbness and tingling. Patient reports difficulty with prolonged sitting and standing. Pain is exacerbated by forward flexion and lifting.

# Treatment history: Patient has undergone several weeks of physical therapy with minimal improvement. Has tried over-the-counter NSAIDs (ibuprofen 600mg TID) with partial relief. No prior injections or surgical interventions.

# Physical Examination:
# - General: Alert, cooperative, in mild distress
# - Lumbar spine: Decreased range of motion in flexion (limited to 60 degrees), extension limited to 15 degrees
# - Straight leg raise: Positive on the left at 45 degrees, reproducing radicular symptoms
# - Motor: 4/5 strength in left ankle dorsiflexion, otherwise 5/5 throughout
# - Sensory: Decreased sensation to light touch in L5 distribution on the left
# - Reflexes: Left Achilles reflex diminished (1+), right normal (2+)

# Imaging: Recent lumbar MRI (02/15/2026) shows L4-L5 and L5-S1 disc herniation with moderate central canal stenosis and left foraminal narrowing at L5-S1.

# Assessment:
# - M54.50: Low back pain, unspecified (primary diagnosis)
# - M51.26: Other intervertebral disc displacement, lumbar region
# - M54.16: Radiculopathy, lumbar region

# Plan:
# 1. Continue physical therapy with focus on core strengthening and lumbar stabilization exercises (CPT 97110 - Therapeutic exercises)
# 2. Manual therapy for soft tissue mobilization (CPT 97140 - Manual therapy)
# 3. Consider epidural steroid injection if conservative measures fail (CPT 62323 - Injection, epidural, lumbar/sacral)
# 4. Follow-up in 4 weeks to reassess symptoms and response to treatment
# 5. Prescribed meloxicam 15mg daily for pain management

# Attending: Dr. James Martinez, MD, Physical Medicine & Rehabilitation
# Facility: Central Spine & Pain Management Center
# NPI: 9876543210"""

# print('ner(text): ', ner(text))


# # # filter the results by confidence threshold
# # filtered = [e for e in ner(text) if float(e["score"]) >= CONFIDENCE_THRESHOLD]

# # print('filtered: ', filtered)

# # # create a clinical object to store the results
# # clinical_object = {
# #     "symptoms": [],
# #     "procedures": [],
# #     "medications": [],
# #     "durations": [],
# #     "demographics": {
# #         "age": None,
# #         "sex": None
# #     }
# # }

# # # iterate over the filtered results and store the results in the clinical object
# # for e in filtered:
# #     label = e["entity_group"]
# #     word = e["word"].strip()

# #     if label == "Sign_symptom":
# #         clinical_object["symptoms"].append(
# #             {
# #                 "text": word,
# #                 "start": e["start"],
# #                 "end": e["end"],
# #             }
# #         )

# #     elif label in ["Therapeutic_procedure", "Diagnostic_procedure"]:
# #         clinical_object["procedures"].append(word)

# #     elif label == "Medication":
# #         clinical_object["medications"].append(word)

# #     elif label == "Duration":
# #         clinical_object["durations"].append(word)

# #     elif label == "Age":
# #         clinical_object["demographics"]["age"] = word

# #     elif label == "Sex":
# #         clinical_object["demographics"]["sex"] = word

# # # print the clinical object
# # print('clinical_object: ', clinical_object)


# # def is_negated(text, entity_start):
# #     window = text[max(0, entity_start-40):entity_start].lower()
# #     return any(word in window for word in ["no", "denies", "without", "negates", "disagrees", "contradicts", "contradiction"])

# # # iterate over the clinical object and check if the symptoms are negated
# # clinical_object["symptoms"] = [
# #     symptom
# #     for symptom in clinical_object["symptoms"]
# #     if not is_negated(text, symptom["start"])
# # ]

# # # print the clinical object
# # print('clinical_object after negation check: ', clinical_object)


# print("end time: ", datetime.now())