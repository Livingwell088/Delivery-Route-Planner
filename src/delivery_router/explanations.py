"""Human-readable explanations for selected routes."""


from delivery_router.models import RouteEvaluation


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
