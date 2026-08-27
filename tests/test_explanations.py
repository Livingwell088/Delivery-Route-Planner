"""Tests for human-readable route explanations."""

from delivery_router.explanations import explain_route
from delivery_router.models import Order, TravelTimeMatrix
from delivery_router.scoring import ScoringConfig
from delivery_router.strategies import age_aware_route


def test_explain_route_describes_sequence_deliveries_and_metrics() -> None:
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
    evaluation = age_aware_route("R", orders, matrix, ScoringConfig())

    explanation = explain_route(evaluation)

    assert explanation == (
        "Route: R -> A -> C -> B -> R\n"
        "Order sequence: A -> C -> B\n"
        "Deliveries:\n"
        "- Order A: delivery in 8 min, customer wait 52 min, late by 7 min\n"
        "- Order C: delivery in 16 min, customer wait 21 min, late by 0 min\n"
        "- Order B: delivery in 18 min, customer wait 28 min, late by 0 min\n"
        "Total driving: 20 min\n"
        "Average customer wait: 33.7 min\n"
        "Maximum customer wait: 52 min\n"
        "Severely late orders: 1\n"
        "Route score: 191.0"
    )
