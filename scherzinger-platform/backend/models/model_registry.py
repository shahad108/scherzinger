from datetime import datetime

from sqlalchemy import DateTime, Float, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class ModelRegistryEntry(Base):
    __tablename__ = "model_registry"
    __table_args__ = (
        Index(
            "ix_model_registry_lookup",
            "model_name",
            "entity_type",
            "entity_id",
            "metric_name",
            "trained_at",
        ),
        Index("ix_model_registry_trained_at", "trained_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_name: Mapped[str] = mapped_column(String(120))
    version: Mapped[str] = mapped_column(String(40))
    trained_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    holdout_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    metric_name: Mapped[str] = mapped_column(String(40))
    metric_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    n_observations: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feature_list: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    feature_importance: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
