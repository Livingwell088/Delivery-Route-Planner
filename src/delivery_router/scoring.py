"""Route scoring rules and configurable penalty weights."""


from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ScoringConfig:
    severe_lateness_minutes: int = 45
    driving_weight: float = 1.0
    waiting_weight: float = 1.0
    late_minute_weight: float = 10.0


    def __post_init__(self) -> None:
        if self.severe_lateness_minutes < 0:
            raise ValueError("severe_lateness_minutes cannot be negative")

        if self.driving_weight < 0:
            raise ValueError("driving_weight cannot be negative")

        if self.waiting_weight < 0:
            raise ValueError("waiting_weight cannot be negative") 

        if self.late_minute_weight < 0:
            raise ValueError("late_minute_weight cannot be negative")

        total = sum([self.driving_weight, self.waiting_weight, self.late_minute_weight])

        if total == 0:
            raise ValueError("At least one weight should be greater than zero")


def calculate_wait_minutes(starting_age_minutes: int, elapsed_route_minutes: int) -> int:
    return starting_age_minutes + elapsed_route_minutes

def calculate_late_minutes(wait_minutes: int, severe_lateness_minutes: int) -> int:
    return max(0, wait_minutes - severe_lateness_minutes)

# score = total driving time + total customer waiting time + 10 x total late minutes
def calculate_route_score(total_driving_minutes: int, total_customer_wait_minutes: int, total_late_minutes: int, config: ScoringConfig) -> float:
    return (total_driving_minutes * config.driving_weight) + (total_customer_wait_minutes * config.waiting_weight) + (total_late_minutes * config.late_minute_weight)

        

        