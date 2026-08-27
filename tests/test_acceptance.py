"""End-to-end Phase 2 acceptance scenarios."""

from delivery_router.explanations import explain_strategy_comparison
from delivery_router.models import Order, TravelTimeMatrix
from delivery_router.scoring import ScoringConfig
from delivery_router.strategies import compare_strategies


def test_phase_two_selects_and_explains_best_route() -> None:
    orders = (
        Order(order_id="A", stop_id="A", age_minutes=44),
        Order(order_id="B", stop_id="B", age_minutes=10),
        Order(order_id="C", stop_id="C", age_minutes=5)
    )

    matrix = TravelTimeMatrix(
        times={
            "R": {"A": 8, "B": 2, "C": 3},
            "A": {"R": 8, "B": 8, "C": 8},
            "B": {"R": 2, "A": 8, "C": 2},
            "C": {"R": 3, "A": 7, "B": 2},
        }
    )

    comparison = compare_strategies(restaurant_id="R", orders=orders, matrix=matrix, config=ScoringConfig())

    selected = comparison["age_aware"]
    explanation = explain_strategy_comparison(comparison)


    assert comparison["shortest_route"].order_sequence == ("B", "C", "A")
    assert comparison["oldest_order_first"].order_sequence == ("A", "B", "C")
    assert selected.order_sequence == ("A", "C", "B")

    assert selected.score == 191
    assert selected.total_driving_minutes == 20
    assert selected.severely_late_order_count == 1

    assert "Selected age-aware route: A -> C -> B" in explanation
    assert "weighted score of 191.0 was lower" in explanation
















