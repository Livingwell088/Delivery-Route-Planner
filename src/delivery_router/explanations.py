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








