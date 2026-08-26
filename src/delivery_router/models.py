"""Domain models for orders, travel-time matrices, and route results."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Order:
    """A delivery order waiting at a specific route stop."""

    order_id: str
    stop_id: str
    age_minutes: int

    def __post_init__(self) -> None:
        """Validate the order identifier, stop identifier, and age."""

        if not self.order_id.strip():
            raise ValueError("order_id cannot be empty")

        if not self.stop_id.strip():
            raise ValueError("stop_id cannot be empty")

        if self.age_minutes < 0:
            raise ValueError("age_minutes cannot be negative")


@dataclass(frozen=True, slots=True)
class TravelTimeMatrix:
    """Directed travel times between the restaurant and delivery stops."""

    times: dict[str, dict[str, int]]

    def __post_init__(self) -> None:
        """Validate that the matrix has usable, nonnegative travel times."""

        if not self.times:
            raise ValueError("times cannot be empty")

        for origin, destinations in self.times.items():
            for destination, travel_time in destinations.items():
                if not isinstance(travel_time, int):
                    raise ValueError("travel time cannot be non-integer")

                if travel_time < 0:
                    raise ValueError("travel time cannot be negative")


    def travel_time(self, origin: str, destination: str) -> int:
        """Return the travel time between two known locations.

        Returns zero when the origin and destination are the same.

        Raises:
            KeyError: If either location is unknown or the route is missing.
        """

        if origin not in self.times:
            raise KeyError(f"unknown origin: {origin}")

        if destination not in self.times:
            raise KeyError(f"unknown destination: {destination}")

        if origin == destination:
            return 0

        if destination not in self.times[origin]:
            raise KeyError(f"missing route: {origin} -> {destination}")

        return self.times[origin][destination]


@dataclass(frozen=True, slots=True)
class DeliveryPrediction:
    """Predicted timing and lateness for one delivered order."""

    order: Order
    elapsed_minutes: int
    wait_minutes: int
    late_minutes: int

    def __post_init__(self) -> None:
        """Validate timing values and ensure customer wait is consistent."""

        if self.elapsed_minutes < 0:
            raise ValueError("elapsed_minutes cannot be negative")

        if self.wait_minutes < 0:
            raise ValueError("wait_minutes cannot be negative")

        if self.late_minutes < 0:
            raise ValueError("late_minutes cannot be negative")

        if self.wait_minutes != self.order.age_minutes + self.elapsed_minutes:
            raise ValueError(
                "wait_minutes must be equal to age_minutes + elapsed_minutes"
            )
