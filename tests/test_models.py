"""Tests for routing domain models and input validation."""

import pytest 
from delivery_router.models import Order

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