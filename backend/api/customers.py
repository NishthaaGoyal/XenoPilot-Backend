from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta
from db.session import get_db
from models.database import Customer, Order
from schemas.pydantic_models import DashboardStats, HealthDistribution, RevenueTrendPoint
import services.ai_service as ai_service

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("/stats")
async def get_dashboard_stats(db: AsyncSession = Depends(get_db)):
    """Return all KPIs for the dashboard in a single call."""

    total = (await db.execute(select(func.count(Customer.id)))).scalar() or 0
    total_rev = (await db.execute(select(func.sum(Customer.total_spent)))).scalar() or 0

    repeat = (
        await db.execute(select(func.count(Customer.id)).where(Customer.order_count >= 2))
    ).scalar() or 0

    at_risk = (
        await db.execute(select(func.count(Customer.id)).where(Customer.health_status == "at_risk"))
    ).scalar() or 0

    churning = (
        await db.execute(select(func.count(Customer.id)).where(Customer.health_status == "churning"))
    ).scalar() or 0

    healthy = (
        await db.execute(select(func.count(Customer.id)).where(Customer.health_status == "healthy"))
    ).scalar() or 0

    avg_order = (await db.execute(select(func.avg(Order.amount)))).scalar() or 0

    # AI insight
    db_stats = {
        "total_customers": total,
        "at_risk_customers": at_risk,
        "churning_customers": churning,
        "total_revenue": float(total_rev),
        "avg_order_value": float(avg_order),
    }
    ai_insight = await ai_service.generate_ai_insight(db_stats)

    return {
        "total_customers": total,
        "total_revenue": round(float(total_rev), 2),
        "repeat_customers": repeat,
        "at_risk_customers": at_risk,
        "churning_customers": churning,
        "healthy_customers": healthy,
        "avg_order_value": round(float(avg_order), 2),
        "ai_insight": ai_insight,
        "health_distribution": {
            "healthy": healthy,
            "at_risk": at_risk,
            "churning": churning,
        },
    }


@router.get("/revenue-trend")
async def get_revenue_trend(db: AsyncSession = Depends(get_db)):
    """Return monthly revenue for the last 6 months."""
    now = datetime.utcnow()
    result = []
    for i in range(5, -1, -1):
        month_start = (now.replace(day=1) - timedelta(days=30 * i)).replace(day=1)
        month_end = (month_start + timedelta(days=32)).replace(day=1)

        rev = (
            await db.execute(
                select(func.sum(Order.amount)).where(
                    Order.order_date >= month_start,
                    Order.order_date < month_end,
                )
            )
        ).scalar() or 0

        orders = (
            await db.execute(
                select(func.count(Order.id)).where(
                    Order.order_date >= month_start,
                    Order.order_date < month_end,
                )
            )
        ).scalar() or 0

        result.append({
            "month": month_start.strftime("%b %Y"),
            "revenue": round(float(rev), 2),
            "orders": orders,
        })

    return result


@router.get("")
async def list_customers(
    page: int = 1,
    limit: int = 50,
    health: str = None,
    city: str = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Customer)
    if health:
        stmt = stmt.where(Customer.health_status == health)
    if city:
        stmt = stmt.where(Customer.city == city)

    stmt = stmt.offset((page - 1) * limit).limit(limit)
    result = await db.execute(stmt)
    customers = result.scalars().all()
    return [
        {
            "id": str(c.id),
            "name": c.name,
            "email": c.email,
            "city": c.city,
            "age": c.age,
            "preferred_channel": c.preferred_channel,
            "total_spent": c.total_spent,
            "last_purchase_date": c.last_purchase_date.isoformat() if c.last_purchase_date else None,
            "health_score": c.health_score,
            "health_status": c.health_status,
            "order_count": c.order_count,
        }
        for c in customers
    ]
