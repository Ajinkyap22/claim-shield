"""
Negation filter using NegEx algorithm.
Drops negated entities, low-confidence entities, and non-codeable entity types.
"""
import re
from dataclasses import dataclass

CODEABLE_ENTITY_TYPES = {
    "Sign_symptom",
    "Disease_disorder",
    "Therapeutic_procedure",
    "Diagnostic_procedure",
    "Biological_structure",
    "Medication",
}

CONFIDENCE_THRESHOLD = 0.75

PRE_NEGATION_TRIGGERS = [
    "no evidence of", "negative for", "ruled out", "free of",
    "no", "not", "without", "denies", "denied", "absent", "never",
]
POST_NEGATION_TRIGGERS = [
    "was ruled out", "is ruled out", "has been ruled out", "unlikely",
]
TERMINATION_TOKENS = ["but", "however", "although", "except", "which", "who", "yet"]


@dataclass
class FilteredEntity:
    word: str
    entity_group: str
    score: float
    start: int
    end: int
    negated: bool
    sentence: str


def _word_pattern(phrase: str) -> re.Pattern:
    """Compile a whole-word regex pattern for a trigger phrase."""
    return re.compile(r"\b" + re.escape(phrase) + r"\b")


def is_negated(text: str, entity_start: int, entity_end: int) -> bool:
    pre_window = text[max(0, entity_start - 150):entity_start].lower()
    post_window = text[entity_end:entity_end + 80].lower()

    for trigger in PRE_NEGATION_TRIGGERS:
        # Find the last (rightmost) whole-word match of the trigger in the pre-window
        last_match = None
        for m in re.finditer(_word_pattern(trigger), pre_window):
            last_match = m
        if last_match:
            between = pre_window[last_match.end():]
            if not any(re.search(_word_pattern(tok), between) for tok in TERMINATION_TOKENS):
                return True

    for trigger in POST_NEGATION_TRIGGERS:
        if re.search(_word_pattern(trigger), post_window):
            return True

    return False


def _get_sentence(text: str, start: int, end: int) -> str:
    sent_start = max(
        text.rfind("\n", 0, start) + 1,
        text.rfind(". ", 0, start) + 2,
        0,
    )
    nl = text.find("\n", end)
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


def filter_entities(
    raw_entities: list,
    text: str,
    confidence_threshold: float = CONFIDENCE_THRESHOLD,
) -> list[FilteredEntity]:
    result = []
    for e in raw_entities:
        score = float(e.get("score", 0))
        entity_group = e.get("entity_group", e.get("entity", ""))

        if score < confidence_threshold:
            continue
        if entity_group not in CODEABLE_ENTITY_TYPES:
            continue

        start = e.get("start", 0)
        end = e.get("end", 0)

        if is_negated(text, start, end):
            continue

        result.append(FilteredEntity(
            word=e.get("word", "").strip(),
            entity_group=entity_group,
            score=score,
            start=start,
            end=end,
            negated=False,
            sentence=_get_sentence(text, start, end),
        ))
    return result
