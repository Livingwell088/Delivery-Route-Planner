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


@dataclass(frozen=True, slots=True)
class RouteEvaluation:
    """Evaluation results for one complete delivery route"""

    restaurant_id: str
    deliveries: tuple[DeliveryPrediction, ...]
    total_driving_minutes: int
    score: float
    
    def __post_init__(self) -> None:

        if not self.restaurant_id.strip():
            raise ValueError("restaurant_id cannot be empty")

        if not self.deliveries:
            raise ValueError("deliveries cannot be empty")

        if not isinstance(self.deliveries, tuple):
            raise TypeError("deliveries must be a tuple")

        if not all(isinstance(delivery, DeliveryPrediction) for delivery in self.deliveries):
            raise TypeError("deliveries must contain DeliveryPrediction objects")

        if self.total_driving_minutes < 0:
            raise ValueError("total_driving_minutes cannot be negative")

        if self.score < 0:
            raise ValueError("score cannot be negative")

        unique = set()

        for delivery in self.deliveries:
            if delivery.order.order_id in unique:
                raise ValueError("every order_id must be unique")

            unique.add(delivery.order.order_id)

    @property
    def order_sequence(self) -> tuple[str, ...]:
        """Return order IDs in delivery order."""

        return tuple(delivery.order.order_id for delivery in self.deliveries)


    @property
    def stop_sequence(self) -> tuple[str, ...]:
        """Return the complete route, including restaurant start and return"""

        return (
            self.restaurant_id,
            *(delivery.order.stop_id for delivery in self.deliveries),
            self.restaurant_id,
        )


    @property
    def total_customer_wait_minutes(self) -> int:
        """Return the combined customer wait across all deliveries."""

        return sum(delivery.wait_minutes for delivery in self.deliveries)


    @property
    def average_customer_wait_minutes(self) -> float:
        """Return the average customer wait of the deliveries."""

        return self.total_customer_wait_minutes / len(self.deliveries)


    @property
    def maximum_customer_wait_minutes(self) -> int:
        """Return the max customer wait time."""

        return max(delivery.wait_minutes for delivery in self.deliveries)


    @property
    def total_late_minutes(self) -> int:
        """Return the total late minutes."""

        return sum(delivery.late_minutes for delivery in self.deliveries)



    @property
    def severely_late_order_count(self) -> int:
        """Return the number of severely late orders"""

        return sum(delivery.late_minutes > 0 for delivery in self.deliveries)












