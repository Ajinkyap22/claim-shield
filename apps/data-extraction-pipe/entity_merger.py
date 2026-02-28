"""
Entity merger: sentence-level grouping + adjacent span merging.
Combines split tokens (e.g. "low back pain" + "left leg") into one entity with full context.
"""
import re
from collections import defaultdict
from dataclasses import dataclass, field

from negation_filter import FilteredEntity


@dataclass
class MergedEntity:
    text: str
    entity_group: str
    score: float
    start: int
    end: int
    sentence_context: str
    constituents: list[FilteredEntity] = field(default_factory=list)


def split_sentences(text: str) -> list[tuple[int, int, str]]:
    """Split text into (start, end, sentence_text) tuples."""
    pattern = re.compile(r"(?<=[.!?])\s+|\n+|(?<=[-•])\s+|(?<=\d\.)\s+")
    sentences = []
    start = 0
    for m in pattern.finditer(text):
        chunk = text[start:m.start()].strip()
        if chunk:
            sentences.append((start, m.start(), chunk))
        start = m.end()
    if start < len(text):
        chunk = text[start:].strip()
        if chunk:
            sentences.append((start, len(text), chunk))
    return sentences


def _sentence_for(e: FilteredEntity, sentences: list[tuple[int, int, str]]) -> tuple[int, int, str]:
    for s_start, s_end, s_text in sentences:
        if s_start <= e.start < s_end:
            return s_start, s_end, s_text
    return 0, len(e.sentence), e.sentence


def merge_entities(filtered_entities: list[FilteredEntity], text: str) -> list[MergedEntity]:
    if not filtered_entities:
        return []

    sentences = split_sentences(text)

    # Group by sentence then entity_group
    sentence_groups: dict[tuple, list[FilteredEntity]] = defaultdict(list)
    for e in filtered_entities:
        key = _sentence_for(e, sentences)
        sentence_groups[key].append(e)

    merged: list[MergedEntity] = []

    for (s_start, s_end, s_text), entities in sentence_groups.items():
        by_type: dict[str, list[FilteredEntity]] = defaultdict(list)
        for e in entities:
            by_type[e.entity_group].append(e)

        for entity_group, group in by_type.items():
            group.sort(key=lambda e: e.start)

            # Merge adjacent spans where gap <= 25 chars
            clusters: list[list[FilteredEntity]] = []
            for e in group:
                if clusters and e.start - clusters[-1][-1].end <= 25:
                    clusters[-1].append(e)
                else:
                    clusters.append([e])

            for cluster in clusters:
                combined_text = text[cluster[0].start:cluster[-1].end].strip()
                # Extend to closing parenthesis/bracket if the span has an unmatched opener
                if combined_text.count("(") > combined_text.count(")"):
                    close_idx = text.find(")", cluster[-1].end)
                    if 0 < close_idx - cluster[-1].end <= 15:
                        combined_text = text[cluster[0].start:close_idx + 1].strip()
                avg_score = sum(e.score for e in cluster) / len(cluster)
                merged.append(MergedEntity(
                    text=combined_text,
                    entity_group=entity_group,
                    score=avg_score,
                    start=cluster[0].start,
                    end=cluster[-1].end,
                    sentence_context=s_text,
                    constituents=cluster,
                ))

    # Cross-sentence: attach Biological_structure to closest preceding Sign_symptom (within 150 chars)
    bio_structs = [e for e in merged if e.entity_group == "Biological_structure"]
    signs = [e for e in merged if e.entity_group == "Sign_symptom"]

    to_remove = set()
    for bio in bio_structs:
        preceding = [s for s in signs if s.end < bio.start and bio.start - s.end <= 150]
        if preceding:
            closest = max(preceding, key=lambda s: s.end)
            closest.text = f"{closest.text} {bio.text}"
            closest.end = bio.end
            to_remove.add(id(bio))

    merged = [e for e in merged if id(e) not in to_remove]
    return merged
