"""Tests for exhaustive and baseline routing strategies."""

from delivery_router.models import Order, TravelTimeMatrix
from delivery_router.scoring import ScoringConfig
from delivery_router.strategies import oldest_order_first


def test_oldest_order_first_matches_baseline_scenario() -> None:
    orders = (
        Order(order_id="A", stop_id="A", age_minutes=44),
        Order(order_id="B", stop_id="B", age_minutes=10),
        Order(order_id="C", stop_id="C", age_minutes=5),
    )
    matrix = TravelTimeMatrix(
        times={
            "R": {"A": 8, "B": 2, "C": 3},
            "A": {"R": 8, "B": 8, "C": 8},
            "B": {"R": 2, "A": 8, "C": 2},
            "C": {"R": 3, "A": 7, "B": 2},
        }
    )

    evaluation = oldest_order_first(
        restaurant_id="R",
        orders=orders,
        matrix=matrix,
        config=ScoringConfig(),
    )

    assert evaluation.order_sequence == ("A", "B", "C")
    assert evaluation.total_driving_minutes == 21
    assert tuple(
        delivery.wait_minutes for delivery in evaluation.deliveries
    ) == (52, 26, 23)
    assert evaluation.total_customer_wait_minutes == 101
    assert evaluation.total_late_minutes == 7
    assert evaluation.score == 192


def test_oldest_order_first_preserves_input_order_for_equal_ages() -> None:
    orders = (
        Order(order_id="X", stop_id="X", age_minutes=10),
        Order(order_id="Y", stop_id="Y", age_minutes=10),
    )
    matrix = TravelTimeMatrix(
        times={
            "R": {"X": 1, "Y": 2},
            "X": {"R": 1, "Y": 1},
            "Y": {"R": 2, "X": 1},
        }
    )

    evaluation = oldest_order_first(
        restaurant_id="R",
        orders=orders,
        matrix=matrix,
        config=ScoringConfig(),
    )

    assert evaluation.order_sequence == ("X", "Y")
