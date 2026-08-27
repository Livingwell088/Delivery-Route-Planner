"""Exhaustive optimizer and baseline routing strategies."""


from delivery_router.metrics import evaluate_route
from delivery_router.models import Order, RouteEvaluation, TravelTimeMatrix
from delivery_router.scoring import ScoringConfig


def oldest_order_first(restaurant_id: str, orders: tuple[Order, ...], matrix: TravelTimeMatrix, config: ScoringConfig) -> RouteEvaluation:
    """Sort the orders from oldest to youngest and then evaluate route"""

    ordered = tuple(sorted(orders, key=lambda order: order.age_minutes, reverse=True))

    return evaluate_route(restaurant_id=restaurant_id, orders=ordered, matrix=matrix, config=config)







