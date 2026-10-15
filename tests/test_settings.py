"""Tests for environment-backed API configuration."""

import pytest
from pydantic import ValidationError

from delivery_router.api.settings import Settings


def test_settings_reads_google_key_without_exposing_it(monkeypatch) -> None:
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "private-test-key")
    monkeypatch.setenv("MAP_PROVIDER", "google")

    settings = Settings(_env_file=None)

    assert settings.google_maps_api_key is not None
    assert settings.google_maps_api_key.get_secret_value() == "private-test-key"
    assert "private-test-key" not in repr(settings)


@pytest.mark.parametrize("key", [None, "", "   "])
def test_google_mode_rejects_missing_credentials(monkeypatch, key) -> None:
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    with pytest.raises(ValidationError, match="requires GOOGLE_MAPS_API_KEY"):
        Settings(_env_file=None, map_provider="google", google_maps_api_key=key)


def test_production_cannot_use_estimated_travel_times() -> None:
    with pytest.raises(ValidationError, match="Production requires"):
        Settings(_env_file=None, app_environment="production", map_provider="development",
                 google_maps_api_key=None)


def test_key_cannot_be_silently_ignored_in_development_mode() -> None:
    with pytest.raises(ValidationError, match="set MAP_PROVIDER=google") as caught:
        Settings(_env_file=None, map_provider="development", google_maps_api_key="private-test-key")
    assert "private-test-key" not in str(caught.value)


def test_production_google_mode_is_supported() -> None:
    settings = Settings(_env_file=None, app_environment="production", map_provider="google",
                        google_maps_api_key="test-key")
    assert settings.map_provider == "google"


def test_unknown_provider_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, map_provider="unknown", google_maps_api_key=None)
