"""Route evaluation and strategy-comparison metrics."""



from delivery_router.models import DeliveryPrediction, Order, RouteEvaluation, TravelTimeMatrix
from delivery_router.scoring import ScoringConfig, calculate_late_minutes, calculate_route_score, calculate_wait_minutes


def evaluate_route(restaurant_id: str, orders: tuple[Order, ...], matrix: TravelTimeMatrix, config: ScoringConfig) -> RouteEvaluation:
    """Evaluates one specific delivery route"""

    current_location = restaurant_id
    elapsed_minutes = 0
    predictions: list[DeliveryPrediction] = []

    if not orders:
        raise ValueError("orders cannot be empty")

    for order in orders:
        travel_time = matrix.travel_time(current_location, order.stop_id)
        elapsed_minutes += travel_time
        customer_wait = calculate_wait_minutes(order.age_minutes, elapsed_minutes)
        late_minutes = calculate_late_minutes(customer_wait, config.severe_lateness_minutes)

        delivery_prediction = DeliveryPrediction(order=order, elapsed_minutes=elapsed_minutes, wait_minutes=customer_wait, late_minutes=late_minutes)
        predictions.append(delivery_prediction)
        current_location = order.stop_id


    travel_time = matrix.travel_time(current_location, restaurant_id)
    elapsed_minutes += travel_time

    
    total_wait_minutes = sum(delivery.wait_minutes for delivery in predictions)
    total_late_minutes = sum(delivery.late_minutes for delivery in predictions)


    score = calculate_route_score(total_driving_minutes=elapsed_minutes, total_customer_wait_minutes=total_wait_minutes, total_late_minutes=total_late_minutes, config=config)

    return RouteEvaluation(restaurant_id=restaurant_id, deliveries=tuple(predictions), total_driving_minutes=elapsed_minutes, score=score)








