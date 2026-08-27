"""Runnable synthetic example comparing all routing strategies."""



from delivery_router.explanations import explain_route, explain_strategy_comparison
from delivery_router.models import Order, TravelTimeMatrix
from delivery_router.scoring import ScoringConfig
from delivery_router.strategies import compare_strategies


def main() -> None:
    """Run a synthetic comparison of all routing strategies."""

    orders = (
        Order(order_id="A", stop_id="A", age_minutes=44),
        Order(order_id="B", stop_id="B", age_minutes=10),
        Order(order_id="C", stop_id="C", age_minutes=5)
    )

    matrix = TravelTimeMatrix(
        times = {
            "R": {"A": 8, "B": 2, "C": 3},
            "A": {"R": 8, "B": 8, "C": 8},
            "B": {"R": 2, "A": 8, "C": 2},
            "C": {"R": 3, "A": 7, "B": 2},
        }
    )

    config = ScoringConfig()

    comparison = compare_strategies(restaurant_id="R", orders=orders, matrix=matrix, config=config)


    print(explain_strategy_comparison(comparison))
    print()
    print("Selected route details")
    print("----------------------")
    print(explain_route(comparison["age_aware"]))


if __name__ == "__main__":
    main()







