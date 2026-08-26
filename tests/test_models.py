"""Tests for routing domain models and input validation."""

import pytest

from delivery_router.models import Order, TravelTimeMatrix

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
