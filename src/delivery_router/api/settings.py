"""Environment-backed application configuration."""

from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Load secrets and provider behavior without putting them in source code."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

    app_environment: Literal["development", "test", "production"] = "development"
    map_provider: Literal["development", "google"] = "development"
    google_maps_api_key: SecretStr | None = None
    google_maps_region: str = "us"
    google_maps_components: str = (
        "country:US|administrative_area:MA|locality:Worcester"
    )
    google_maps_bounds: str = "42.20,-71.90|42.35,-71.70"
    google_maps_timeout_seconds: float = Field(default=10.0, gt=0, le=60)
    google_maps_max_attempts: int = Field(default=2, ge=1, le=3)

    @model_validator(mode="after")
    def require_explicit_real_provider(self) -> "Settings":
        if self.app_environment == "production" and self.map_provider != "google":
            raise ValueError("Production requires MAP_PROVIDER=google; estimates are development-only")
        if self.map_provider == "google" and (
            self.google_maps_api_key is None
            or not self.google_maps_api_key.get_secret_value().strip()
        ):
            raise ValueError("MAP_PROVIDER=google requires GOOGLE_MAPS_API_KEY")
        if self.map_provider == "development" and self.google_maps_api_key is not None:
            raise ValueError("A Google key is configured; set MAP_PROVIDER=google or remove the key")
        return self
