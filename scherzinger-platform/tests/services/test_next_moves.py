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
