"""Exhaustive optimizer and baseline routing strategies."""

from itertools import permutations
from delivery_router.metrics import evaluate_route
from delivery_router.models import Order, RouteEvaluation, TravelTimeMatrix
from delivery_router.scoring import ScoringConfig


def oldest_order_first(restaurant_id: str, orders: tuple[Order, ...], matrix: TravelTimeMatrix, config: ScoringConfig) -> RouteEvaluation:
    """Evaluate orders from oldest to youngest.Orders with equal ages retain their original relative order."""
    ordered = tuple(sorted(orders, key=lambda order: order.age_minutes, reverse=True))

    return evaluate_route(restaurant_id=restaurant_id, orders=ordered, matrix=matrix, config=config)


def shortest_route_baseline(restaurant_id: str, orders: tuple[Order, ...], matrix: TravelTimeMatrix, config: ScoringConfig) -> RouteEvaluation:
    """Evaluate orders based on the shortest route"""

    if not orders:
        raise ValueError("orders cannot be empty")
    

    routes = []


    for current in permutations(orders):
        routes.append(evaluate_route(restaurant_id=restaurant_id, orders=current, matrix=matrix, config=config))

    return min(routes, key=lambda route: route.total_driving_minutes)


def main():

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

    evaluation = shortest_route_baseline(
        restaurant_id="R",
        orders=orders,
        matrix=matrix,
        config=ScoringConfig(),
    )


    


if __name__ == "__main__":
    main()
