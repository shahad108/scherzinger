from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://pryzm:pryzm_dev@localhost:5432/scherzinger_margin_db"
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    # Comma-separated. Wildcard "*" allowed only for local dev.
    CORS_ORIGINS: str = "http://localhost:5173"

    # Phase 2 — auth.
    # 32+ random bytes. dev default; rotate per env.
    JWT_SECRET: str = "dev-only-rotate-this-in-prod-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    JWT_ALGORITHM: str = "HS256"
    JWT_TTL_SECONDS: int = 3600  # 1h access token
    REFRESH_TTL_DAYS: int = 30
    AUTH_COOKIE_SECURE: bool = False  # set True in prod
    AUTH_COOKIE_SAMESITE: str = "lax"

    # Phase 2 settings
    FORECAST_MIN_MONTHS: int = 12
    RISK_MIN_INVOICES: int = 5
    MONTE_CARLO_SIMS: int = 10000
    MONTE_CARLO_THRESHOLD: float = 0.50
    SEASONAL_MIN_PER_MONTH: int = 10
    COST_MIN_QUARTERS: int = 3

    # v3 forecaster (AutoETS + MinT reconciliation + ACI bands). Off by
    # default; flip to "1" to serve the supervised cache from
    # notebooks/forecasting_v3/output/. v3_loader.py reads this via os.getenv,
    # but pydantic-settings would still reject the unknown var without this
    # declaration.
    FORECAST_V3: str = "1"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"


settings = Settings()
