"""Environment-backed application configuration."""

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Load secrets and provider behavior without putting them in source code."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    google_maps_api_key: SecretStr | None = None
    google_maps_region: str = "us"
    google_maps_components: str = (
        "country:US|administrative_area:MA|locality:Worcester"
    )
    google_maps_bounds: str = "42.20,-71.90|42.35,-71.70"
    google_maps_timeout_seconds: float = Field(default=10.0, gt=0, le=60)
    google_maps_max_attempts: int = Field(default=2, ge=1, le=3)
