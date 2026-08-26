"""Tests for age and extreme-lateness penalties."""

import pytest

from delivery_router.scoring import (
    ScoringConfig,
    calculate_late_minutes,
    calculate_route_score,
    calculate_wait_minutes,
)


def test_scoring_config_has_expected_defaults() -> None:
    config = ScoringConfig()

    assert config.severe_lateness_minutes == 45
    assert config.driving_weight == 1.0
    assert config.waiting_weight == 1.0
    assert config.late_minute_weight == 10.0


def test_scoring_config_accepts_custom_values() -> None:
    config = ScoringConfig(
        severe_lateness_minutes=60,
        driving_weight=0.5,
        waiting_weight=2.0,
        late_minute_weight=20.0,
    )

    assert config.severe_lateness_minutes == 60
    assert config.driving_weight == 0.5
    assert config.waiting_weight == 2.0
    assert config.late_minute_weight == 20.0


def test_negative_severe_lateness_threshold_is_rejected() -> None:
    with pytest.raises(
        ValueError,
        match="severe_lateness_minutes cannot be negative",
    ):
        ScoringConfig(severe_lateness_minutes=-1)


@pytest.mark.parametrize(
    "weight_name",
    ["driving_weight", "waiting_weight", "late_minute_weight"],
)
def test_negative_scoring_weight_is_rejected(weight_name: str) -> None:
    with pytest.raises(ValueError, match=f"{weight_name} cannot be negative"):
        ScoringConfig(**{weight_name: -1.0})


def test_all_zero_scoring_weights_are_rejected() -> None:
    with pytest.raises(
        ValueError,
        match="At least one weight should be greater than zero",
    ):
        ScoringConfig(
            driving_weight=0,
            waiting_weight=0,
            late_minute_weight=0,
        )


def test_calculate_wait_minutes_adds_age_and_elapsed_time() -> None:
    assert calculate_wait_minutes(24, 5) == 29


def test_calculate_wait_minutes_accepts_zero_values() -> None:
    assert calculate_wait_minutes(0, 0) == 0


def test_wait_below_threshold_has_no_late_minutes() -> None:
    assert calculate_late_minutes(
        wait_minutes=44,
        severe_lateness_minutes=45,
    ) == 0


def test_wait_at_threshold_has_no_late_minutes() -> None:
    assert calculate_late_minutes(
        wait_minutes=45,
        severe_lateness_minutes=45,
    ) == 0


def test_wait_above_threshold_returns_excess_minutes() -> None:
    assert calculate_late_minutes(
        wait_minutes=48,
        severe_lateness_minutes=45,
    ) == 3


def test_late_minutes_uses_custom_threshold() -> None:
    assert calculate_late_minutes(
        wait_minutes=35,
        severe_lateness_minutes=30,
    ) == 5


def test_route_score_matches_hand_calculated_scenario() -> None:
    score = calculate_route_score(
        total_driving_minutes=14,
        total_customer_wait_minutes=96,
        total_late_minutes=3,
        config=ScoringConfig(),
    )

    assert score == 140


def test_route_score_handles_zero_late_minutes() -> None:
    score = calculate_route_score(
        total_driving_minutes=12,
        total_customer_wait_minutes=85,
        total_late_minutes=0,
        config=ScoringConfig(),
    )

    assert score == 97


def test_route_score_applies_custom_weights() -> None:
    config = ScoringConfig(
        driving_weight=0.5,
        waiting_weight=2.0,
        late_minute_weight=4.0,
    )

    score = calculate_route_score(
        total_driving_minutes=10,
        total_customer_wait_minutes=20,
        total_late_minutes=3,
        config=config,
    )

    assert score == 57


def test_route_score_can_ignore_driving_time() -> None:
    config = ScoringConfig(
        driving_weight=0,
        waiting_weight=1.0,
        late_minute_weight=10.0,
    )

    score = calculate_route_score(
        total_driving_minutes=100,
        total_customer_wait_minutes=20,
        total_late_minutes=1,
        config=config,
    )

    assert score == 30
