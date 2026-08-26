"""Domain models for orders, travel-time matrices, and route results."""

from dataclasses import dataclass


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


@dataclass(frozen=True, slots=True)
class TravelTimeMatrix:
    times: dict[str, dict[str, int]]


    def __post_init__(self) -> None:
        if not self.times:
            raise ValueError("times cannot be empty")

        for origin, destinations in self.times.items():
            for destination, travel_time in destinations.items():
                if not isinstance(travel_time, int):
                    raise ValueError("travel time cannot be non-integer")

                if travel_time < 0:
                    raise ValueError("travel time cannot be negative")


    def travel_time(self, origin: str, destination: str) -> int:

        if origin not in self.times:
            raise KeyError(f"unknown origin: {origin}")

        if destination not in self.times:
            raise KeyError(f"unknown destination: {destination}")

        if origin == destination:
            return 0

        if destination not in self.times[origin]:
            raise KeyError(f"missing route: {origin} -> {destination}")

        travel_time = self.times[origin][destination]

        return travel_time
