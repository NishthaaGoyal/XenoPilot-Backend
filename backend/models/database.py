import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, Text, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from db.session import Base


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    age: Mapped[int] = mapped_column(Integer, nullable=False)
    gender: Mapped[str] = mapped_column(String(20), nullable=False)
    preferred_channel: Mapped[str] = mapped_column(String(20), nullable=False, default="email")
    total_spent: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    last_purchase_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    health_score: Mapped[float] = mapped_column(Float, nullable=False, default=50.0)
    health_status: Mapped[str] = mapped_column(String(20), nullable=False, default="at_risk")
    order_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    orders: Mapped[list["Order"]] = relationship("Order", back_populates="customer", lazy="select")
    communications: Mapped[list["Communication"]] = relationship("Communication", back_populates="customer", lazy="select")


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    order_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    customer: Mapped["Customer"] = relationship("Customer", back_populates="orders")


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    goal: Mapped[str] = mapped_column(String(255), nullable=False)
    channel: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")
    audience_filters: Mapped[dict] = mapped_column(JSON, nullable=True)
    audience_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    subject_line: Mapped[str | None] = mapped_column(Text, nullable=True)
    message_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    cta: Mapped[str | None] = mapped_column(String(100), nullable=True)
    predicted_open_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    predicted_ctr: Mapped[float | None] = mapped_column(Float, nullable=True)
    predicted_conversion_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    prediction_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    launched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    communications: Mapped[list["Communication"]] = relationship("Communication", back_populates="campaign", lazy="select")


class Communication(Base):
    __tablename__ = "communications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    channel: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="communications")
    customer: Mapped["Customer"] = relationship("Customer", back_populates="communications")
    events: Mapped[list["Event"]] = relationship("Event", back_populates="communication", lazy="select")


class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    communication_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("communications.id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    communication: Mapped["Communication"] = relationship("Communication", back_populates="events")
