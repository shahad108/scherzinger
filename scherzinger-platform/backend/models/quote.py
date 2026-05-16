from sqlalchemy import String, Integer, Float, Boolean, Date, DateTime, UniqueConstraint, Index, func
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base


class Quote(Base):
    __tablename__ = "quotes"
    __table_args__ = (
        UniqueConstraint("quote_id", "position", name="uq_quote_position"),
        Index("ix_quote_customer_date", "customer_id", "date"),
        Index("ix_quote_article", "article_id"),
        Index("ix_quote_order", "order_id"),
        Index("ix_quote_year_won", "year", "is_won"),
        Index("ix_quote_rejection", "rejection_code"),
        # SF4: WTP cluster-anchor fallback scans by
        # (commodity_group, is_won, date). Without this composite the
        # _load_cluster_anchor_wtp helper sequentially scans the entire
        # quotes table for every thin-sample SKU.
        Index("ix_quote_commodity_won_date", "commodity_group", "is_won", "date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    quote_id: Mapped[str] = mapped_column(String, index=True)
    position: Mapped[int] = mapped_column(Integer)
    status_code: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String)
    is_won: Mapped[bool] = mapped_column(Boolean)
    date: Mapped[Date] = mapped_column(Date, index=True)
    customer_id: Mapped[str] = mapped_column(String)
    article_id: Mapped[str] = mapped_column(String)
    business_unit: Mapped[str | None] = mapped_column(String, nullable=True)
    commodity_group: Mapped[str | None] = mapped_column(String, nullable=True)
    currency: Mapped[str | None] = mapped_column(String, nullable=True)
    exchange_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    revenue: Mapped[float | None] = mapped_column(Float, nullable=True)
    hkvoll: Mapped[float | None] = mapped_column(Float, nullable=True)
    db2_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    db2_margin: Mapped[float | None] = mapped_column(Float, nullable=True)
    order_id: Mapped[str | None] = mapped_column(String, nullable=True)
    rejection_code: Mapped[str | None] = mapped_column(String, nullable=True)
    rejection_code_reliable: Mapped[bool] = mapped_column(Boolean, default=False)
    year: Mapped[int] = mapped_column(Integer)
    quarter: Mapped[int] = mapped_column(Integer)
    month: Mapped[int] = mapped_column(Integer)
    dq_missing_cost: Mapped[bool] = mapped_column(Boolean, default=False)
    dq_100pct_margin: Mapped[bool] = mapped_column(Boolean, default=False)
    dq_any_issue: Mapped[bool] = mapped_column(Boolean, default=False)
