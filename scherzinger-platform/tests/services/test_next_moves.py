def test_ranks_by_impact():
    from backend.services.forecast import next_moves
    out = next_moves.build_next_moves(cluster_signals={
        "A": {"forecast_impact_eur": 100000, "signal": "x"},
        "B": {"forecast_impact_eur": 300000, "signal": "y"},
        "C": {"forecast_impact_eur": 200000, "signal": "z"},
    })
    assert [m["cluster"] for m in out] == ["B", "C", "A"]
    assert out[0]["rank"] == 1 and out[2]["rank"] == 3


def test_top_n():
    from backend.services.forecast import next_moves
    out = next_moves.build_next_moves(
        cluster_signals={f"C{i}": {"forecast_impact_eur": i} for i in range(10)},
        top_n=3,
    )
    assert len(out) == 3


def test_intent_kind_and_context_stamped():
    """v2.2 Phase A: each move carries a typed action intent (kind + context
    dict) so Phase B's Action Center wiring can do a 1:1 translation into
    a FormDrawerKind."""
    from backend.services.forecast import next_moves
    out = next_moves.build_next_moves(cluster_signals={
        "BKAES": {
            "forecast_impact_eur": 250_000,
            "skus_below_floor": 3,
            "signal": "cost crossing list price",
            "intent_kind": "partial_accept",
            "intent_context": {
                "cluster": "BKAES",
                "articleId": "30001234",
                "sourceScreen": "forecasting",
                "sourceKind": "next-cycle-move",
            },
        },
        "MBDIV": {
            "forecast_impact_eur": 80_000,
            "signal": "declining customer",
            "intent_kind": "queue_renewal",
            "intent_context": {
                "cluster": "MBDIV",
                "sourceScreen": "forecasting",
                "sourceKind": "next-cycle-move",
            },
        },
    })
    # Ranked by impact desc, capped at top_n (default 5).
    assert [m["cluster"] for m in out] == ["BKAES", "MBDIV"]
    assert out[0]["rank"] == 1 and out[1]["rank"] == 2
    # Every move has a kind that maps to a real FormDrawerKind.
    valid_kinds = {"partial_accept", "queue_renewal", "snooze", "ab_setup"}
    for m in out:
        ai = m["actionIntent"]
        assert ai["kind"] in valid_kinds
        payload = ai["payload"]
        assert payload["cluster"] == m["cluster"]
        assert payload["sourceScreen"] == "forecasting"
        assert payload["sourceKind"] == "next-cycle-move"
        assert payload["headline"]  # filled by build_next_moves
    # The partial-accept move keeps its articleId.
    assert out[0]["actionIntent"]["payload"]["articleId"] == "30001234"


def test_rejection_code_signal_emits_partial_accept_intent():
    """v2.2 Phase A patch: when ``_next_move_signals`` mines lost-quote
    rejection codes (PA / PR), the resulting NextMove must carry a
    partial_accept ``actionIntent`` whose payload includes the
    ``rejectionCode`` so Phase B's drawer can deep-link the right filter.
    """
    from backend.services.forecast import next_moves
    out = next_moves.build_next_moves(cluster_signals={
        "BKAES": {
            "forecast_impact_eur": 175_000,
            "signal": (
                "Tighten quoting on cluster BKAES — 18 quotes lost to PA "
                "in last 90d"
            ),
            "intent_kind": "partial_accept",
            "intent_context": {
                "cluster": "BKAES",
                "sourceScreen": "forecasting",
                "sourceKind": "next-cycle-move",
                "rejectionCode": "PA",
                "rejectionCount": 18,
            },
        },
    })
    assert len(out) == 1
    move = out[0]
    assert move["actionIntent"]["kind"] == "partial_accept"
    payload = move["actionIntent"]["payload"]
    assert payload["rejectionCode"] == "PA"
    assert payload["rejectionCount"] == 18
    assert payload["cluster"] == "BKAES"
    assert payload["sourceKind"] == "next-cycle-move"
    # The headline should be filled by build_next_moves from the signal.
    assert "BKAES" in move["headline"]
