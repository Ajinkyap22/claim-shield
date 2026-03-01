"""
Unit tests for negation_filter.py.

Tests cover:
  - Regex NegEx fallback (no medSpaCy dependency — always runs)
  - filter_entities() via mocked medSpaCy-unavailable path
  - Score threshold gate
  - Entity type gate
  - medSpaCy integration tests (skipped if medSpaCy not installed)

Run:
  pytest test_negation_filter.py -v
"""
import importlib
import sys
from unittest.mock import patch

import pytest

import negation_filter
from negation_filter import (
    CONFIDENCE_THRESHOLD,
    FilteredEntity,
    _is_negated_regex,
    filter_entities,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_entity(word: str, entity_group: str, start: int, end: int, score: float = 0.95) -> dict:
    return {"word": word, "entity_group": entity_group, "start": start, "end": end, "score": score}


def _run_regex_only(raw_entities: list, text: str) -> list[FilteredEntity]:
    """Force the regex-fallback path by making _get_nlp() return None."""
    with patch.object(negation_filter, "_get_nlp", return_value=None):
        # Reset cached nlp so patch takes effect
        negation_filter._medspacy_nlp = None
        return filter_entities(raw_entities, text)


# ── Regex fallback: _is_negated_regex() ──────────────────────────────────────

class TestIsNegatedRegex:
    def test_no_before_entity(self):
        text = "Patient has no back pain."
        # "back pain" at index 15–24
        assert _is_negated_regex(text, 15, 24) is True

    def test_not_before_entity(self):
        text = "Patient is not experiencing fever."
        # "fever" at 28–33
        assert _is_negated_regex(text, 28, 33) is True

    def test_denies(self):
        text = "Patient denies chest pain."
        assert _is_negated_regex(text, 15, 25) is True

    def test_without(self):
        text = "Patient presents without nausea."
        assert _is_negated_regex(text, 25, 31) is True

    def test_no_evidence_of(self):
        text = "No evidence of pulmonary embolism."
        assert _is_negated_regex(text, 15, 33) is True

    def test_negative_for(self):
        text = "Chest X-ray negative for pneumonia."
        assert _is_negated_regex(text, 24, 33) is True

    def test_post_negation_ruled_out(self):
        text = "Pulmonary embolism was ruled out."
        assert _is_negated_regex(text, 0, 18) is True

    def test_post_negation_unlikely(self):
        text = "Fracture is unlikely."
        assert _is_negated_regex(text, 0, 8) is True

    def test_termination_stops_negation(self):
        # "no fever, but patient has back pain" → "back pain" should NOT be negated
        text = "no fever, but patient has back pain."
        # "back pain" starts at 26
        assert _is_negated_regex(text, 26, 35) is False

    def test_no_negation(self):
        text = "Patient presents with lower back pain."
        # "lower back pain" at 21–36
        assert _is_negated_regex(text, 21, 36) is False

    def test_noted_does_not_trigger_no(self):
        # Old substring bug: "noted" contains "no" — must NOT negate
        text = "Back pain noted in the lumbar region."
        assert _is_negated_regex(text, 0, 9) is False

    def test_known_does_not_trigger_no(self):
        # "known" contains "no" — must NOT negate
        text = "Patient has known hypertension."
        assert _is_negated_regex(text, 18, 30) is False

    def test_annotation_does_not_trigger_no(self):
        # "notation" contains "no" — must NOT negate
        text = "Notation of mild radiculopathy."
        assert _is_negated_regex(text, 11, 29) is False

    def test_not_longer_negates(self):
        text = "Patient is no longer experiencing pain."
        # "pain" at 33–37
        assert _is_negated_regex(text, 33, 37) is True

    def test_no_acute(self):
        text = "No acute distress noted."
        assert _is_negated_regex(text, 9, 17) is True


# ── filter_entities(): score and type gates (regex path) ─────────────────────

class TestFilterEntitiesGates:
    TEXT = "Patient has severe lower back pain and sciatica."

    def test_low_score_dropped(self):
        entities = [_make_entity("pain", "Sign_symptom", 36, 40, score=0.50)]
        result = _run_regex_only(entities, self.TEXT)
        assert result == []

    def test_score_at_threshold_kept(self):
        entities = [_make_entity("pain", "Sign_symptom", 36, 40, score=CONFIDENCE_THRESHOLD)]
        result = _run_regex_only(entities, self.TEXT)
        assert len(result) == 1

    def test_wrong_entity_type_dropped(self):
        entities = [_make_entity("pain", "Lab_or_test_value", 36, 40)]
        result = _run_regex_only(entities, self.TEXT)
        assert result == []

    def test_valid_type_kept(self):
        for etype in ["Sign_symptom", "Disease_disorder", "Therapeutic_procedure",
                      "Diagnostic_procedure", "Biological_structure", "Medication"]:
            entities = [_make_entity("pain", etype, 36, 40)]
            result = _run_regex_only(entities, self.TEXT)
            assert len(result) == 1, f"Entity type {etype} should be kept"

    def test_empty_input(self):
        assert filter_entities([], "some text") == []


# ── filter_entities(): negation via regex path ───────────────────────────────

class TestFilterEntitiesNegationRegex:
    def test_negated_entity_dropped(self):
        text = "Patient has no back pain."
        entities = [_make_entity("back pain", "Sign_symptom", 15, 24)]
        result = _run_regex_only(entities, text)
        assert result == []

    def test_non_negated_entity_kept(self):
        text = "Patient has severe lower back pain."
        entities = [_make_entity("lower back pain", "Sign_symptom", 19, 34)]
        result = _run_regex_only(entities, text)
        assert len(result) == 1
        assert result[0].word == "lower back pain"

    def test_mixed_negated_and_positive(self):
        # "no fever, but patient has back pain"
        text = "Patient has no fever, but presents with back pain."
        entities = [
            _make_entity("fever",     "Sign_symptom", 15, 20),  # negated
            _make_entity("back pain", "Sign_symptom", 40, 49),  # not negated
        ]
        result = _run_regex_only(entities, text)
        assert len(result) == 1
        assert result[0].word == "back pain"

    def test_denies_drops_entity(self):
        text = "Patient denies any chest pain or shortness of breath."
        entities = [_make_entity("chest pain", "Sign_symptom", 20, 30)]
        result = _run_regex_only(entities, text)
        assert result == []

    def test_noted_substring_not_negated(self):
        text = "Back pain noted in lumbar region."
        entities = [_make_entity("Back pain", "Sign_symptom", 0, 9)]
        result = _run_regex_only(entities, text)
        assert len(result) == 1

    def test_known_substring_not_negated(self):
        text = "Patient has known hypertension."
        entities = [_make_entity("hypertension", "Disease_disorder", 18, 30)]
        result = _run_regex_only(entities, text)
        assert len(result) == 1

    def test_result_fields(self):
        text = "Patient has chronic low back pain."
        entities = [_make_entity("low back pain", "Sign_symptom", 19, 32, score=0.92)]
        result = _run_regex_only(entities, text)
        assert len(result) == 1
        e = result[0]
        assert e.word == "low back pain"
        assert e.entity_group == "Sign_symptom"
        assert e.score == 0.92
        assert e.start == 19
        assert e.end == 32
        assert e.negated is False   # always False for kept entities


# ── medSpaCy integration tests (skipped if not installed) ────────────────────

medspacy_available = importlib.util.find_spec("medspacy") is not None

@pytest.mark.skipif(not medspacy_available, reason="medspacy not installed")
class TestMedSpaCyIntegration:
    """End-to-end tests using real medSpaCy ConText pipeline."""

    @classmethod
    def setup_class(cls):
        # Reset singleton once before the class so fresh pipeline is loaded
        negation_filter._medspacy_nlp = None

    def _run(self, entities, text):
        return filter_entities(entities, text)

    def test_negation_no(self):
        text = "Patient reports no fever."
        entities = [_make_entity("fever", "Sign_symptom", 18, 23)]
        result = self._run(entities, text)
        assert result == [], "medSpaCy should detect 'no fever' as negated"

    def test_negation_denies(self):
        text = "Patient denies pain."
        entities = [_make_entity("pain", "Sign_symptom", 15, 19)]
        result = self._run(entities, text)
        assert result == []

    def test_hypothetical_rule_out(self):
        # medSpaCy sets is_uncertain=True for "rule out" (not is_hypothetical)
        text = "Admit to rule out pulmonary embolism."
        entities = [_make_entity("pulmonary embolism", "Disease_disorder", 18, 36)]
        result = self._run(entities, text)
        assert result == [], "Uncertain 'rule out' should be filtered"

    def test_hypothetical_possible(self):
        # medSpaCy sets is_uncertain=True for "possible" (not is_hypothetical)
        text = "Possible disc herniation at L4-L5."
        entities = [_make_entity("disc herniation", "Disease_disorder", 9, 24)]
        result = self._run(entities, text)
        assert result == [], "Uncertain 'possible' should be filtered"

    def test_family_history_inline(self):
        text = "Mother has diabetes and father had hypertension."
        entities = [
            _make_entity("diabetes",     "Disease_disorder", 10, 18),
            _make_entity("hypertension", "Disease_disorder", 35, 47),
        ]
        result = self._run(entities, text)
        assert result == [], "Family history entities should be filtered"

    def test_positive_entity_kept(self):
        text = "Patient presents with lumbar radiculopathy."
        entities = [_make_entity("lumbar radiculopathy", "Disease_disorder", 21, 41)]
        result = self._run(entities, text)
        assert len(result) == 1

    def test_termination_stops_negation(self):
        text = "No fever, but patient has significant back pain."
        entities = [
            _make_entity("fever",     "Sign_symptom", 3,  8),
            _make_entity("back pain", "Sign_symptom", 38, 47),
        ]
        result = self._run(entities, text)
        words = [r.word for r in result]
        assert "back pain" in words, "back pain after 'but' should not be negated"
        assert not any(w == "fever" for w in words), "fever should be negated"

    def test_family_history_section(self):
        text = (
            "Assessment:\n"
            "Patient has lumbar radiculopathy.\n"
            "Family History:\n"
            "Hypertension.\n"
        )
        entities = [
            _make_entity("lumbar radiculopathy", "Disease_disorder", 24, 44),
            _make_entity("Hypertension",         "Disease_disorder", 61, 73),
        ]
        result = self._run(entities, text)
        words = [r.word for r in result]
        assert "lumbar radiculopathy" in words, "Assessment entity should be kept"
        assert "Hypertension" not in words, "Family History section entity should be excluded"
