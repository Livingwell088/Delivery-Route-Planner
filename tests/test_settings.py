"""Tests for environment-backed API configuration."""

from delivery_router.api.settings import Settings


def test_settings_reads_google_key_without_exposing_it(monkeypatch) -> None:
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "private-test-key")

    settings = Settings(_env_file=None)

    assert settings.google_maps_api_key is not None
    assert settings.google_maps_api_key.get_secret_value() == "private-test-key"
    assert "private-test-key" not in repr(settings)
