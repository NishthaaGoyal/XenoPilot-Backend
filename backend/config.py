import os
from pydantic_settings import BaseSettings
from functools import lru_cache


def _coerce_db_url(url: str) -> str:
    """
    Render (and other platforms) provide DATABASE_URL in the form
    postgres://... or postgresql://... which is NOT compatible with
    asyncpg. This helper converts it to the correct asyncpg scheme.
    """
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://") and "+asyncpg" not in url:
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://xenopilot:xenopilot123@localhost:5432/xenopilot"
    channel_service_url: str = "http://localhost:8001"
    crm_base_url: str = "http://localhost:8000"
    openai_api_key: str = ""
    seed_on_startup: bool = True

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Coerce the URL after loading so env vars are respected
        object.__setattr__(self, "database_url", _coerce_db_url(self.database_url))

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
