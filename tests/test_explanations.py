"""Tests for human-readable route explanations."""

import pytest

from delivery_router.explanations import (
    explain_route,
    explain_strategy_comparison,
)
from delivery_router.models import Order, TravelTimeMatrix
from delivery_router.scoring import ScoringConfig
from delivery_router.strategies import age_aware_route, compare_strategies


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


def test_explain_strategy_comparison_describes_selection() -> None:
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
    comparison = compare_strategies(
        "R",
        orders,
        matrix,
        ScoringConfig(),
    )

    explanation = explain_strategy_comparison(comparison)

    assert explanation == (
        "Selected age-aware route: A -> C -> B\n"
        "Selected score: 191.0\n"
        "\n"
        "Shortest-route baseline: B -> C -> A\n"
        "- Driving: 19 min\n"
        "- Total late minutes: 10\n"
        "- Score: 195.0\n"
        "\n"
        "Oldest-order-first baseline: A -> B -> C\n"
        "- Driving: 21 min\n"
        "- Total late minutes: 7\n"
        "- Score: 192.0\n"
        "\n"
        "The age-aware route was selected because its weighted score "
        "of 191.0 was lower than the shortest-route score of 195.0 and "
        "the oldest-order-first score of 192.0."
    )


def test_explain_strategy_comparison_rejects_missing_strategy() -> None:
    with pytest.raises(
        ValueError,
        match="comparison is missing strategies: age_aware, oldest_order_first",
    ):
        explain_strategy_comparison({"shortest_route": object()})
