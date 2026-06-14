import uuid
from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr


# ── Customer ──────────────────────────────────────────────────────────────────

class CustomerBase(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    city: str
    age: int
    gender: str
    preferred_channel: str
    total_spent: float
    last_purchase_date: Optional[datetime] = None
    health_score: float
    health_status: str
    order_count: int


class CustomerOut(CustomerBase):
    id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


# ── Stats / Dashboard ─────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_customers: int
    total_revenue: float
    repeat_customers: int
    at_risk_customers: int
    churning_customers: int
    healthy_customers: int
    avg_order_value: float
    ai_insight: str


class HealthDistribution(BaseModel):
    healthy: int
    at_risk: int
    churning: int


class RevenueTrendPoint(BaseModel):
    month: str
    revenue: float
    orders: int


# ── Audience ──────────────────────────────────────────────────────────────────

class AudienceRequest(BaseModel):
    query: str


class AudienceFilter(BaseModel):
    field: str
    operator: str
    value: Any


class AudienceMetrics(BaseModel):
    audience_size: int
    avg_spend: float
    avg_days_since_purchase: float
    recoverable_revenue: float
    city_breakdown: dict[str, int]
    channel_breakdown: dict[str, int]


class AudienceResponse(BaseModel):
    query: str
    explanation: str
    why_selected: str
    filters_applied: List[AudienceFilter]
    metrics: AudienceMetrics
    customers: List[CustomerOut]


# ── Campaign ──────────────────────────────────────────────────────────────────

class CampaignGenerateRequest(BaseModel):
    query: str
    audience_size: int
    avg_spend: float
    health_focus: str  # healthy | at_risk | churning | mixed
    recoverable_revenue: float


class CampaignContent(BaseModel):
    name: str
    goal: str
    subject_line: str
    message_body: str
    cta: str
    channel: str
    channel_confidence: float
    channel_reasoning: str


class PredictionResult(BaseModel):
    predicted_open_rate: float
    predicted_ctr: float
    predicted_conversion_rate: float
    confidence_score: float
    predicted_revenue: float


class CampaignLaunchRequest(BaseModel):
    campaign_id: uuid.UUID


class CampaignOut(BaseModel):
    id: uuid.UUID
    name: str
    goal: str
    channel: str
    status: str
    audience_size: int
    subject_line: Optional[str]
    message_body: Optional[str]
    cta: Optional[str]
    predicted_open_rate: Optional[float]
    predicted_ctr: Optional[float]
    predicted_conversion_rate: Optional[float]
    prediction_confidence: Optional[float]
    created_at: datetime
    launched_at: Optional[datetime]

    class Config:
        from_attributes = True


class CreateCampaignRequest(BaseModel):
    name: str
    goal: str
    channel: str
    audience_filters: List[dict]
    audience_size: int
    subject_line: str
    message_body: str
    cta: str
    predicted_open_rate: Optional[float] = None
    predicted_ctr: Optional[float] = None
    predicted_conversion_rate: Optional[float] = None
    prediction_confidence: Optional[float] = None


# ── Analytics ─────────────────────────────────────────────────────────────────

class CampaignAnalytics(BaseModel):
    campaign_id: uuid.UUID
    campaign_name: str
    channel: str
    status: str
    total_sent: int
    delivered: int
    opened: int
    clicked: int
    converted: int
    failed: int
    open_rate: float
    ctr: float
    conversion_rate: float
    delivery_rate: float
    estimated_revenue: float
    city_breakdown: dict[str, int]
    event_timeline: List[dict]


# ── Recommendations ───────────────────────────────────────────────────────────

class Recommendation(BaseModel):
    title: str
    description: str
    action: str
    priority: str  # high | medium | low
    estimated_impact: str


class CampaignInsights(BaseModel):
    campaign_id: uuid.UUID
    summary: str
    top_performing_city: str
    best_channel: str
    open_rate_assessment: str
    recommendations: List[Recommendation]


# ── Webhooks ──────────────────────────────────────────────────────────────────

class WebhookEvent(BaseModel):
    communication_id: uuid.UUID
    event_type: str
    timestamp: datetime
