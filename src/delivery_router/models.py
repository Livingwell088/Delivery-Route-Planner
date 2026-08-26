"""Domain models for orders, travel-time matrices, and route results."""

from dataclasses import Field, dataclass


@dataclass(frozen=True, slots=True)
class Order:
    order_id: str 
    stop_id: str 
    age_minutes: int 

    def __post_init__(self) -> None:
        if not self.order_id.strip():
            raise ValueError("order_id cannot be empty")

        if not self.stop_id.strip():
            raise ValueError("stop_id cannot be empty")

        if self.age_minutes < 0:
            raise ValueError("age_minutes cannot be negative")