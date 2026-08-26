"""Tests for routing domain models and input validation."""

import pytest

from delivery_router.models import (
    DeliveryPrediction,
    Order,
    RouteEvaluation,
    TravelTimeMatrix,
)

def test_order_accepts_valid_values() -> None:
    order = Order(
        order_id="order-a",
        stop_id="stop-a",
        age_minutes=24,
    )

    assert order.order_id == "order-a"
    assert order.stop_id == "stop-a"
    assert order.age_minutes == 24

def test_order_rejects_empty_order_id() -> None:
    with pytest.raises(ValueError, match="order_id cannot be empty"):
        Order(
            order_id="",
            stop_id="stop_a",
            age_minutes=24
        )

def test_order_rejects_empty_stop_id() -> None:
    with pytest.raises(ValueError, match="stop_id cannot be empty"):
        Order(
            order_id="order_a",
            stop_id="",
            age_minutes=24
        )

def test_order_rejects_negative_age_minutes() -> None:
    with pytest.raises(ValueError, match="age_minutes cannot be negative"):
        Order(
            order_id="order_a",
            stop_id="stop_a",
            age_minutes=-23
        )

def test_order_accepts_zero_age() -> None:
    order = Order(
        order_id="new-order",
        stop_id="stop_a",
        age_minutes=0
    )

    assert order.age_minutes == 0


def test_travel_time_returns_the_requested_time() -> None:
    matrix = TravelTimeMatrix(
        times={
            "R": {"A": 5},
            "A": {"R": 4},
        }
    )

    assert matrix.travel_time("R", "A") == 5


def test_travel_times_can_be_asymmetric() -> None:
    matrix = TravelTimeMatrix(
        times={
            "R": {"A": 5},
            "A": {"R": 4},
        }
    )

    assert matrix.travel_time("R", "A") == 5
    assert matrix.travel_time("A", "R") == 4


def test_same_location_travel_time_is_zero() -> None:
    matrix = TravelTimeMatrix(times={"R": {}})

    assert matrix.travel_time("R", "R") == 0


def test_unknown_origin_is_rejected() -> None:
    matrix = TravelTimeMatrix(times={"R": {}})

    with pytest.raises(KeyError, match="unknown origin: X"):
        matrix.travel_time("X", "R")


def test_unknown_destination_is_rejected() -> None:
    matrix = TravelTimeMatrix(times={"R": {}})

    with pytest.raises(KeyError, match="unknown destination: X"):
        matrix.travel_time("R", "X")


def test_missing_route_is_rejected() -> None:
    matrix = TravelTimeMatrix(
        times={
            "R": {},
            "A": {"R": 4},
        }
    )

    with pytest.raises(KeyError, match="missing route: R -> A"):
        matrix.travel_time("R", "A")


def test_negative_travel_time_is_rejected() -> None:
    with pytest.raises(ValueError, match="travel time cannot be negative"):
        TravelTimeMatrix(
            times={
                "R": {"A": -1},
                "A": {"R": 4},
            }
        )


def test_delivery_prediction_accepts_consistent_values() -> None:
    order = Order(order_id="B", stop_id="stop-b", age_minutes=40)

    prediction = DeliveryPrediction(
        order=order,
        elapsed_minutes=8,
        wait_minutes=48,
        late_minutes=3,
    )

    assert prediction.order is order
    assert prediction.elapsed_minutes == 8
    assert prediction.wait_minutes == 48
    assert prediction.late_minutes == 3


@pytest.mark.parametrize(
    ("field_name", "error_message"),
    [
        ("elapsed_minutes", "elapsed_minutes cannot be negative"),
        ("wait_minutes", "wait_minutes cannot be negative"),
        ("late_minutes", "late_minutes cannot be negative"),
    ],
)
def test_delivery_prediction_rejects_negative_minutes(
    field_name: str,
    error_message: str,
) -> None:
    values = {
        "order": Order(order_id="A", stop_id="stop-a", age_minutes=10),
        "elapsed_minutes": 5,
        "wait_minutes": 15,
        "late_minutes": 0,
    }
    values[field_name] = -1

    with pytest.raises(ValueError, match=error_message):
        DeliveryPrediction(**values)


def test_delivery_prediction_rejects_inconsistent_wait() -> None:
    order = Order(order_id="A", stop_id="stop-a", age_minutes=24)

    with pytest.raises(
        ValueError,
        match=r"wait_minutes must be equal to age_minutes \+ elapsed_minutes",
    ):
        DeliveryPrediction(
            order=order,
            elapsed_minutes=5,
            wait_minutes=30,
            late_minutes=0,
        )


def make_prediction(
    order_id: str,
    stop_id: str,
    age_minutes: int,
    elapsed_minutes: int,
    late_minutes: int = 0,
) -> DeliveryPrediction:
    """Create a consistent delivery prediction for route tests."""

    return DeliveryPrediction(
        order=Order(
            order_id=order_id,
            stop_id=stop_id,
            age_minutes=age_minutes,
        ),
        elapsed_minutes=elapsed_minutes,
        wait_minutes=age_minutes + elapsed_minutes,
        late_minutes=late_minutes,
    )


def test_route_evaluation_returns_order_and_stop_sequences() -> None:
    deliveries = (
        make_prediction("C", "stop-c", 7, 1),
        make_prediction("B", "stop-b", 40, 5),
        make_prediction("A", "stop-a", 24, 8),
    )

    evaluation = RouteEvaluation(
        restaurant_id="R",
        deliveries=deliveries,
        total_driving_minutes=12,
        score=97,
    )

    assert evaluation.order_sequence == ("C", "B", "A")
    assert evaluation.stop_sequence == ("R", "stop-c", "stop-b", "stop-a", "R")


@pytest.mark.parametrize("restaurant_id", ["", "   "])
def test_route_evaluation_rejects_empty_restaurant_id(
    restaurant_id: str,
) -> None:
    deliveries = (make_prediction("A", "stop-a", 24, 5),)

    with pytest.raises(ValueError, match="restaurant_id cannot be empty"):
        RouteEvaluation(restaurant_id, deliveries, 9, 38)


def test_route_evaluation_rejects_empty_deliveries() -> None:
    with pytest.raises(ValueError, match="deliveries cannot be empty"):
        RouteEvaluation("R", (), 0, 0)


def test_route_evaluation_rejects_mutable_delivery_list() -> None:
    deliveries = [make_prediction("A", "stop-a", 24, 5)]

    with pytest.raises(TypeError, match="deliveries must be a tuple"):
        RouteEvaluation("R", deliveries, 9, 38)


def test_route_evaluation_rejects_non_prediction_item() -> None:
    with pytest.raises(
        TypeError,
        match="deliveries must contain DeliveryPrediction objects",
    ):
        RouteEvaluation("R", ("not-a-prediction",), 9, 38)


@pytest.mark.parametrize(
    ("field_name", "value", "error_message"),
    [
        ("total_driving_minutes", -1, "total_driving_minutes cannot be negative"),
        ("score", -1, "score cannot be negative"),
    ],
)
def test_route_evaluation_rejects_negative_totals(
    field_name: str,
    value: int,
    error_message: str,
) -> None:
    values = {
        "restaurant_id": "R",
        "deliveries": (make_prediction("A", "stop-a", 24, 5),),
        "total_driving_minutes": 9,
        "score": 38,
    }
    values[field_name] = value

    with pytest.raises(ValueError, match=error_message):
        RouteEvaluation(**values)


def test_route_evaluation_rejects_duplicate_order_ids() -> None:
    deliveries = (
        make_prediction("A", "stop-a", 24, 5),
        make_prediction("A", "different-stop", 30, 8),
    )

    with pytest.raises(ValueError, match="every order_id must be unique"):
        RouteEvaluation("R", deliveries, 12, 100)


def test_route_evaluation_allows_orders_at_same_stop() -> None:
    deliveries = (
        make_prediction("A", "shared-stop", 24, 5),
        make_prediction("B", "shared-stop", 40, 5),
    )

    evaluation = RouteEvaluation("R", deliveries, 9, 100)

    assert evaluation.order_sequence == ("A", "B")
    assert evaluation.stop_sequence == ("R", "shared-stop", "shared-stop", "R")
