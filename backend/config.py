from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://xenopilot:xenopilot123@localhost:5432/xenopilot"
    channel_service_url: str = "http://localhost:8001"
    crm_base_url: str = "http://localhost:8000"
    openai_api_key: str = ""
    seed_on_startup: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
