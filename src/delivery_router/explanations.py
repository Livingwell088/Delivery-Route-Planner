"""Human-readable explanations for selected routes."""


from math import isclose

from delivery_router.models import RouteEvaluation
from delivery_router.scoring import ScoringConfig


def explain_driver_route(selected: RouteEvaluation, config: ScoringConfig,
                         comparison: dict[str, RouteEvaluation] | None = None) -> list[str]:
    """Explain actual results without inventing priorities or claiming strict wins for ties."""
    threshold = config.severe_lateness_minutes
    if comparison is None:
        ages = [delivery.wait_minutes for delivery in selected.deliveries]
        return [
            "Your selected stop order was preserved; no automatic optimization was applied.",
            f"Total driving, including restaurant return: {selected.total_driving_minutes} min.",
            f"Predicted order ages at delivery range from {min(ages)} to {max(ages)} min. "
            f"{selected.severely_late_order_count} order(s) exceed {threshold} min of total age.",
        ]

    def describe(name: str, baseline: RouteEvaluation) -> str:
        if selected.order_sequence == baseline.order_sequence:
            return f"The stop order matches {name}: {selected.total_driving_minutes} min driving, including return."
        difference = selected.total_driving_minutes - baseline.total_driving_minutes
        driving = (f"Driving time matches {name} ({selected.total_driving_minutes} min)." if difference == 0 else
                   f"Driving takes {selected.total_driving_minutes} min, {abs(difference)} min "
                   f"{'more' if difference > 0 else 'less'} than {name}.")
        tie = " These stop orders tie under the driving-and-order-age selection rules." if isclose(selected.score, baseline.score) else ""
        return (f"{driving} Total order ages across all deliveries: {selected.total_customer_wait_minutes} "
                f"vs {baseline.total_customer_wait_minutes} min. Combined minutes beyond {threshold} min of age: "
                f"{selected.total_late_minutes} vs {baseline.total_late_minutes}.{tie}")

    return [
        f"Balances driving time with total order age at delivery. Each minute beyond {threshold} min of order age "
        f"receives extra weight when choosing the stop order.",
        describe("the shortest-driving route", comparison["shortest_route"]),
        describe("oldest-order-first", comparison["oldest_order_first"]),
    ]


def explain_route(evaluation: RouteEvaluation) -> str:
    """Explain a route's sequence, delivery predictions, and metrics."""

    lines = [
        f"Route: {' -> '.join(evaluation.stop_sequence)}",
        f"Order sequence: {' -> '.join(evaluation.order_sequence)}",
        "Deliveries:"
    ]

    for delivery in evaluation.deliveries:
        lines.append(
            f"- Order {delivery.order.order_id}: "
            f"delivery in {delivery.elapsed_minutes} min, "
            f"customer wait {delivery.wait_minutes} min, "
            f"late by {delivery.late_minutes} min"
        )

    lines.extend(
        [
            f"Total driving: {evaluation.total_driving_minutes} min",
            (
                "Average customer wait: "
                f"{evaluation.average_customer_wait_minutes:.1f} min"
            ),
            (
                "Maximum customer wait: "
                f"{evaluation.maximum_customer_wait_minutes} min"
            ),
            (
                "Severely late orders: "
                f"{evaluation.severely_late_order_count}"
            ),
            f"Route score: {evaluation.score:.1f}"
        ]
    )

    return "\n".join(lines)


def explain_strategy_comparison(
    comparison: dict[str, RouteEvaluation],
) -> str:
    """Explain why the age-aware route was selected over the baselines."""

    required = {
        "shortest_route",
        "oldest_order_first",
        "age_aware",
    }
    missing = required - comparison.keys()

    if missing:
        raise ValueError(
            f"comparison is missing strategies: {', '.join(sorted(missing))}"
        )

    shortest = comparison["shortest_route"]
    oldest = comparison["oldest_order_first"]
    selected = comparison["age_aware"]

    lines = [
        (
            "Selected age-aware route: "
            f"{' -> '.join(selected.order_sequence)}"
        ),
        f"Selected score: {selected.score:.1f}",
        "",
        (
            "Shortest-route baseline: "
            f"{' -> '.join(shortest.order_sequence)}"
        ),
        f"- Driving: {shortest.total_driving_minutes} min",
        f"- Total late minutes: {shortest.total_late_minutes}",
        f"- Score: {shortest.score:.1f}",
        "",
        (
            "Oldest-order-first baseline: "
            f"{' -> '.join(oldest.order_sequence)}"
        ),
        f"- Driving: {oldest.total_driving_minutes} min",
        f"- Total late minutes: {oldest.total_late_minutes}",
        f"- Score: {oldest.score:.1f}",
        "",
        (
            "The age-aware route was selected because its weighted score "
            f"of {selected.score:.1f} was lower than the shortest-route "
            f"score of {shortest.score:.1f} and the oldest-order-first "
            f"score of {oldest.score:.1f}."
        ),
    ]

    return "\n".join(lines)
