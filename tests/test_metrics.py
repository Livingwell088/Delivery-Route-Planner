"""Tests for route metrics and strategy comparisons."""

import pytest

from delivery_router.metrics import evaluate_route
from delivery_router.models import Order, TravelTimeMatrix
from delivery_router.scoring import ScoringConfig


def test_evaluate_route_matches_hand_calculated_cba_route() -> None:
    orders = (
        Order(order_id="C", stop_id="C", age_minutes=7),
        Order(order_id="B", stop_id="B", age_minutes=40),
        Order(order_id="A", stop_id="A", age_minutes=24),
    )
    matrix = TravelTimeMatrix(
        times={
            "R": {"A": 5, "B": 5, "C": 1},
            "A": {"R": 4, "B": 3, "C": 5},
            "B": {"R": 4, "A": 3, "C": 4},
            "C": {"R": 2, "A": 5, "B": 4},
        }
    )

    evaluation = evaluate_route("R", orders, matrix, ScoringConfig())

    assert evaluation.order_sequence == ("C", "B", "A")
    assert tuple(
        delivery.elapsed_minutes for delivery in evaluation.deliveries
    ) == (1, 5, 8)
    assert tuple(
        delivery.wait_minutes for delivery in evaluation.deliveries
    ) == (8, 45, 32)
    assert evaluation.total_driving_minutes == 12
    assert evaluation.total_customer_wait_minutes == 85
    assert evaluation.total_late_minutes == 0
    assert evaluation.score == 97


def test_evaluate_route_uses_configured_lateness_threshold() -> None:
    orders = (Order(order_id="A", stop_id="A", age_minutes=40),)
    matrix = TravelTimeMatrix(
        times={
            "R": {"A": 5},
            "A": {"R": 4},
        }
    )
    config = ScoringConfig(severe_lateness_minutes=50)

    evaluation = evaluate_route("R", orders, matrix, config)

    assert evaluation.deliveries[0].wait_minutes == 45
    assert evaluation.deliveries[0].late_minutes == 0
    assert evaluation.score == 54


def test_evaluate_route_rejects_empty_orders() -> None:
    matrix = TravelTimeMatrix(times={"R": {}})

    with pytest.raises(ValueError, match="orders cannot be empty"):
        evaluate_route("R", (), matrix, ScoringConfig())
