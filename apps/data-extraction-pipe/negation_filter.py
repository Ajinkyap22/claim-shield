"""
Negation filter using medSpaCy ConText algorithm.
Drops negated / hypothetical / family-history entities, low-confidence entities,
and non-codeable entity types.

medSpaCy ConText handles:
  - Negation          ("no fever", "denies pain", "negative for")
  - Hypothetical      ("rule out MI", "possible diabetes")
  - Family history    ("mother has hypertension")

Falls back to a compiled-regex NegEx implementation when medSpaCy span
alignment fails (e.g. subword tokenizer offsets don't align to spaCy tokens).
"""
import logging
import re
from dataclasses import dataclass

logger = logging.getLogger(__name__)

CODEABLE_ENTITY_TYPES = {
    "Sign_symptom",
    "Disease_disorder",
    "Therapeutic_procedure",
    "Diagnostic_procedure",
    "Biological_structure",
    "Medication",
}

CONFIDENCE_THRESHOLD = 0.75

# ── Regex fallback trigger lists (pre-compiled once at import) ────────────────
_PRE_NEGATION_TRIGGERS = [
    "no evidence of", "negative for", "free of", "no signs of",
    "no history of", "no complaint of", "not seen", "not identified",
    "not demonstrated", "no longer", "no acute",
    "no", "not", "without", "denies", "denied", "absent", "never",
]
_POST_NEGATION_TRIGGERS = [
    "was ruled out", "is ruled out", "has been ruled out",
    "unlikely", "resolved", "not seen", "not identified",
]
_TERMINATION_TOKENS = [
    "but", "however", "although", "except", "which", "who", "yet",
]

# Pre-compile — avoids recompiling the same pattern for every entity
_PRE_PATTERNS  = [re.compile(r"\b" + re.escape(t) + r"\b") for t in _PRE_NEGATION_TRIGGERS]
_POST_PATTERNS = [re.compile(r"\b" + re.escape(t) + r"\b") for t in _POST_NEGATION_TRIGGERS]
_TERM_PATTERNS = [re.compile(r"\b" + re.escape(t) + r"\b") for t in _TERMINATION_TOKENS]

# ── medSpaCy lazy singleton ───────────────────────────────────────────────────
_medspacy_nlp = None


def _get_nlp():
    """Load medSpaCy sectionizer + ConText pipeline once; reuse on every call."""
    global _medspacy_nlp
    if _medspacy_nlp is None:
        try:
            import spacy
            import medspacy  # noqa: F401 — registers medspacy pipe factories
            _medspacy_nlp = spacy.blank("en")
            # sentencizer required first — ConText needs sentence boundaries
            # (spacy.blank has no parser/sentencizer by default)
            _medspacy_nlp.add_pipe("sentencizer")
            # Sectionizer must come before context so ConText can use section info
            _medspacy_nlp.add_pipe("medspacy_sectionizer")
            _medspacy_nlp.add_pipe("medspacy_context")
            logger.info("[negation] medSpaCy sectionizer + ConText pipeline loaded.")
        except Exception as e:
            logger.warning("[negation] medSpaCy unavailable (%s) — using regex NegEx fallback.", e)
            _medspacy_nlp = None
    return _medspacy_nlp


# Sections whose content should never be coded as the patient's active condition
_EXCLUDED_SECTIONS = {"family_history", "patient_family_history", "patient_instructions"}


# ── Shared dataclass (imported by entity_merger) ──────────────────────────────
@dataclass
class FilteredEntity:
    word: str
    entity_group: str
    score: float
    start: int
    end: int
    negated: bool
    sentence: str


# ── Regex-based NegEx (fallback) ──────────────────────────────────────────────
def _is_negated_regex(text: str, entity_start: int, entity_end: int) -> bool:
    """Compiled-regex NegEx fallback for when medSpaCy span alignment fails."""
    pre_window  = text[max(0, entity_start - 150):entity_start].lower()
    post_window = text[entity_end:entity_end + 80].lower()

    for pat in _PRE_PATTERNS:
        last_match = None
        for m in pat.finditer(pre_window):
            last_match = m
        if last_match:
            between = pre_window[last_match.end():]
            if not any(tp.search(between) for tp in _TERM_PATTERNS):
                return True

    for pat in _POST_PATTERNS:
        if pat.search(post_window):
            return True

    return False


# ── Sentence extraction ───────────────────────────────────────────────────────
def _get_sentence(text: str, start: int, end: int) -> str:
    sent_start = max(
        text.rfind("\n", 0, start) + 1,
        text.rfind(". ", 0, start) + 2,
        0,
    )
    nl     = text.find("\n",  end)
    period = text.find(". ", end)

    if nl == -1 and period == -1:
        sent_end = len(text)
    elif nl == -1:
        sent_end = period + 1
    elif period == -1:
        sent_end = nl
    else:
        sent_end = min(nl, period + 1)

    return text[sent_start:sent_end].strip()


# ── Main filter ───────────────────────────────────────────────────────────────
def filter_entities(
    raw_entities: list,
    text: str,
    confidence_threshold: float = CONFIDENCE_THRESHOLD,
) -> list[FilteredEntity]:
    # ── Gate 1: score + entity type ──────────────────────────────────────────
    candidates = []
    for e in raw_entities:
        score = float(e.get("score", 0))
        entity_group = e.get("entity_group", e.get("entity", ""))
        if score >= confidence_threshold and entity_group in CODEABLE_ENTITY_TYPES:
            candidates.append(e)

    if not candidates:
        return []

    # ── Gate 2: medSpaCy ConText negation ────────────────────────────────────
    nlp = _get_nlp()
    negated_char_spans: set[tuple[int, int]] = set()
    section_excluded_char_spans: set[tuple[int, int]] = set()
    entity_span_map: list[tuple[dict, object]] = []  # (raw_entity, spaCy span | None)

    if nlp is not None:
        try:
            from spacy.util import filter_spans
            doc = nlp.make_doc(text)

            # Run sentencizer and sectionizer BEFORE setting ents:
            # make_doc() only tokenizes — it does not run the pipeline.
            # ConText requires sentence boundaries (E030) and section info,
            # so we must invoke those pipes explicitly first.
            nlp.get_pipe("sentencizer")(doc)
            nlp.get_pipe("medspacy_sectionizer")(doc)

            # Map HuggingFace char offsets → spaCy spans
            valid_spans = []
            for e in candidates:
                span = doc.char_span(
                    e.get("start", 0),
                    e.get("end",   0),
                    label=e.get("entity_group", e.get("entity", "ENTITY")),
                    alignment_mode="expand",   # graceful when offsets don't align perfectly
                )
                entity_span_map.append((e, span))
                if span is not None:
                    valid_spans.append(span)

            # spaCy requires non-overlapping ents
            doc.ents = filter_spans(valid_spans)
            nlp.get_pipe("medspacy_context")(doc)   # run ConText on all entities in one pass

            # Collect char-offset pairs for negated / uncertain / family spans.
            # medSpaCy maps: "rule out", "possible" → is_uncertain (not is_hypothetical).
            negated_char_spans = {
                (s.start_char, s.end_char)
                for s in doc.ents
                if s._.is_negated or s._.is_uncertain or s._.is_hypothetical or s._.is_family
            }

            # Also exclude entities whose section header marks them as non-patient context.
            # Section body is accessed via body_span (medSpaCy 1.x API).
            if hasattr(doc._, "sections") and doc._.sections:
                for section in doc._.sections:
                    if section.category in _EXCLUDED_SECTIONS:
                        # body_start/body_end are token indices (medSpaCy 1.x)
                        for s in doc.ents:
                            if section.body_start <= s.start < section.body_end:
                                section_excluded_char_spans.add((s.start_char, s.end_char))
        except Exception as exc:
            logger.warning("[negation] medSpaCy context run failed (%s); using regex fallback.", exc)
            entity_span_map = [(e, None) for e in candidates]
    else:
        entity_span_map = [(e, None) for e in candidates]

    # ── Build result ─────────────────────────────────────────────────────────
    result = []
    for e, span in entity_span_map:
        start = e.get("start", 0)
        end   = e.get("end",   0)

        if span is None:
            # Regex fallback for unaligned spans
            if _is_negated_regex(text, start, end):
                continue
        elif (span.start_char, span.end_char) in negated_char_spans:
            continue
        elif (span.start_char, span.end_char) in section_excluded_char_spans:
            continue

        result.append(FilteredEntity(
            word=e.get("word", "").strip(),
            entity_group=e.get("entity_group", e.get("entity", "")),
            score=float(e.get("score", 0)),
            start=start,
            end=end,
            negated=False,
            sentence=_get_sentence(text, start, end),
        ))

    return result
