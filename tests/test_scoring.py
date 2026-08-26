"""Tests for age and extreme-lateness penalties."""

import pytest

from delivery_router.scoring import ScoringConfig


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
