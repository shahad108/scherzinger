"""Phase 10 — citation extractor for the Monday AI briefing.

The briefing prose mentions specific articles, customers, clusters, and
recommendations. Phase 10 makes those mentions clickable: each paragraph
(and each side-card bullet) carries a ``citations[]`` array describing
the entities it references and where the FE should deep-link them.

The extractor is intentionally regex-based — both the template provider
and the LLM provider feed their HTML through the same pass, so
citations are consistent regardless of who wrote the prose.
"""
from __future__ import annotations

import re
from typing import Any, Iterable

# Match patterns we know how to deep-link. Anchor preserved so the FE
# can build a "Sources" chip row that mirrors what the prose said.
_ARTICLE_RE = re.compile(r"\bArticle\s+(\d{4,7}-[A-Z])\b", re.IGNORECASE)
_AID_BARE_RE = re.compile(r"\b(\d{6}-[A-Z])\b")
_CUSTOMER_RE = re.compile(r"\bCustomer\s+(\d{6})\b", re.IGNORECASE)
_CLUSTER_RE = re.compile(r"\b(BKAES|BKAGG|BKAIZ|SOPU)\b")
_RECOMMENDATION_RE = re.compile(r"\bRecommendation\s+#?(\d+)\b", re.IGNORECASE)
_AB_TEST_RE = re.compile(r"\bA/B(?:\s+test)?\s+#?([0-9a-f-]{6,36})\b", re.IGNORECASE)


_STRIP_TAGS_RE = re.compile(r"<[^>]*>")


def _strip_tags(html: str) -> str:
    return _STRIP_TAGS_RE.sub("", html)


def _dedup(items: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str]] = set()
    out: list[dict[str, Any]] = []
    for c in items:
        key = (c["kind"], c["target_id"])
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out


def extract(html: str) -> list[dict[str, Any]]:
    """Return the citation list for a single paragraph or bullet.

    Each citation: ``{kind, target_id, anchor, label, jumpTo}``.
    """
    text = _strip_tags(html)
    cites: list[dict[str, Any]] = []

    for m in _ARTICLE_RE.finditer(text):
        aid = m.group(1)
        cites.append({
            "kind": "article",
            "target_id": aid,
            "anchor": m.group(0),
            "label": f"SKU {aid}",
            "jumpTo": f"/pricing?aid={aid}",
        })

    # Plain bare AIDs (e.g., "200832-E") not already covered by "Article …".
    article_aids = {c["target_id"] for c in cites if c["kind"] == "article"}
    for m in _AID_BARE_RE.finditer(text):
        aid = m.group(1)
        if aid in article_aids:
            continue
        cites.append({
            "kind": "article",
            "target_id": aid,
            "anchor": m.group(0),
            "label": f"SKU {aid}",
            "jumpTo": f"/pricing?aid={aid}",
        })

    for m in _CUSTOMER_RE.finditer(text):
        cid = m.group(1)
        cites.append({
            "kind": "customer",
            "target_id": cid,
            "anchor": m.group(0),
            "label": f"Customer {cid}",
            "jumpTo": f"/margin?customer_id={cid}",
        })

    for m in _CLUSTER_RE.finditer(text):
        code = m.group(1)
        cites.append({
            "kind": "cluster",
            "target_id": code,
            "anchor": code,
            "label": f"Cluster {code}",
            "jumpTo": f"/margin?cluster={code}",
        })

    for m in _RECOMMENDATION_RE.finditer(text):
        rid = m.group(1)
        cites.append({
            "kind": "recommendation",
            "target_id": rid,
            "anchor": m.group(0),
            "label": f"Recommendation #{rid}",
            "jumpTo": f"/action-center?focus=rec-{rid}",
        })

    for m in _AB_TEST_RE.finditer(text):
        tid = m.group(1)
        cites.append({
            "kind": "ab_test",
            "target_id": tid,
            "anchor": m.group(0),
            "label": f"A/B test {tid[:8]}",
            "jumpTo": f"/action-center?focus=ab-{tid}",
        })

    return _dedup(cites)


def annotate_paragraphs(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Add a ``citations`` array to each ``{html: ...}`` item, in place safely."""
    out: list[dict[str, Any]] = []
    for it in items:
        cites = extract(it.get("html", "") or "")
        new_it = dict(it)
        if cites:
            new_it["citations"] = cites
        out.append(new_it)
    return out
