"""Tests for human-readable route explanations."""

import pytest

from delivery_router.explanations import (
    explain_route,
    explain_strategy_comparison,
    explain_driver_route,
)
from delivery_router.metrics import evaluate_route
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


def test_driver_explanation_reports_actual_driving_age_tradeoffs_without_raw_scores():
    orders = (Order("A", "A", 44), Order("B", "B", 10), Order("C", "C", 5))
    matrix = TravelTimeMatrix({
        "R": {"A": 8, "B": 2, "C": 3}, "A": {"R": 8, "B": 8, "C": 8},
        "B": {"R": 2, "A": 8, "C": 2}, "C": {"R": 3, "A": 7, "B": 2},
    })
    config = ScoringConfig()
    comparison = compare_strategies("R", orders, matrix, config)
    lines = explain_driver_route(comparison["age_aware"], config, comparison)
    assert "1 min more than the shortest-driving route" in lines[1]
    assert "Combined minutes beyond 45 min of age: 7 vs 10" in lines[1]
    assert "score" not in " ".join(lines).lower()


def test_driver_explanation_reports_tied_different_orders_without_claiming_an_improvement():
    orders = (Order("A", "A", 10), Order("B", "B", 10))
    matrix = TravelTimeMatrix({"R": {"A": 1, "B": 1}, "A": {"R": 1, "B": 1}, "B": {"R": 1, "A": 1}})
    config = ScoringConfig()
    selected = evaluate_route("R", orders, matrix, config)
    reverse = evaluate_route("R", tuple(reversed(orders)), matrix, config)
    lines = explain_driver_route(selected, config, {"shortest_route": reverse, "oldest_order_first": selected})
    assert "tie under" in lines[1]
    assert "matches oldest-order-first" in lines[2]
    assert "lower" not in " ".join(lines)


def test_driver_selected_explanation_does_not_claim_optimization():
    config = ScoringConfig()
    matrix = TravelTimeMatrix({"R": {"A": 8}, "A": {"R": 10}})
    selected = evaluate_route("R", (Order("A", "A", 44),), matrix, config)
    lines = explain_driver_route(selected, config)
    assert "no automatic optimization" in lines[0]
    assert "18 min" in lines[1]
    assert "52 to 52 min" in lines[2]
    assert "1 order(s) exceed 45 min" in lines[2]
