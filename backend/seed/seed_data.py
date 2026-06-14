"""
Seed script – generates 500 realistic Indian customers and 3000 orders.
Health scores are computed via RFM formula and stored on the customer record.
Runs automatically on first startup if the customers table is empty.
"""

import asyncio
import random
import uuid
from datetime import datetime, timedelta
from faker import Faker

fake = Faker("en_IN")
random.seed(42)

CITIES = ["Chennai", "Bangalore", "Mumbai", "Delhi", "Hyderabad"]
CATEGORIES = ["Fashion", "Beauty", "Coffee", "Electronics"]
CHANNELS = ["whatsapp", "email", "sms"]
GENDERS = ["Male", "Female"]

CITY_WEIGHTS = [0.22, 0.25, 0.20, 0.18, 0.15]
CATEGORY_WEIGHTS = [0.35, 0.25, 0.20, 0.20]

# Order amount ranges per category (INR)
CATEGORY_AMOUNTS = {
    "Fashion": (800, 5500),
    "Beauty": (400, 3200),
    "Coffee": (250, 1800),
    "Electronics": (1200, 12000),
}


def _generate_customers(n: int = 500) -> list[dict]:
    customers = []
    now = datetime.utcnow()

    for _ in range(n):
        city = random.choices(CITIES, weights=CITY_WEIGHTS)[0]
        gender = random.choice(GENDERS)
        age = random.randint(18, 55)
        preferred_channel = random.choices(CHANNELS, weights=[0.45, 0.35, 0.20])[0]

        # Simulate recency: spread last purchases across 0–180 days ago
        days_ago = random.choices(
            range(0, 181),
            weights=[max(1, 10 - abs(d - 30)) for d in range(181)],  # skew toward recent
        )[0]
        last_purchase = now - timedelta(days=days_ago) if random.random() > 0.05 else None

        customers.append({
            "id": uuid.uuid4(),
            "name": fake.name(),
            "email": fake.unique.email(),
            "phone": fake.phone_number()[:15],
            "city": city,
            "age": age,
            "gender": gender,
            "preferred_channel": preferred_channel,
            "last_purchase_date": last_purchase,
            # total_spent, order_count, health_score computed after orders
        })

    return customers


def _generate_orders(customers: list[dict], n: int = 3000) -> list[dict]:
    orders = []
    now = datetime.utcnow()

    # Weight customers so some get many orders (power-law)
    weights = [random.paretovariate(1.5) for _ in customers]
    total_w = sum(weights)
    weights = [w / total_w for w in weights]

    for _ in range(n):
        customer = random.choices(customers, weights=weights)[0]
        category = random.choices(CATEGORIES, weights=CATEGORY_WEIGHTS)[0]
        lo, hi = CATEGORY_AMOUNTS[category]
        amount = round(random.uniform(lo, hi), 2)

        # Order date: within last 2 years, biased toward last_purchase_date
        if customer["last_purchase_date"]:
            max_days_ago = min(730, (now - customer["last_purchase_date"]).days + 365)
        else:
            max_days_ago = 730
        order_days_ago = random.randint(0, max_days_ago)
        order_date = now - timedelta(days=order_days_ago)

        orders.append({
            "id": uuid.uuid4(),
            "customer_id": customer["id"],
            "amount": amount,
            "category": category,
            "order_date": order_date,
        })

    return orders


def _compute_rfm(customers: list[dict], orders: list[dict]) -> list[dict]:
    """Compute RFM health scores and aggregate totals onto customer records."""
    from collections import defaultdict

    now = datetime.utcnow()
    cust_orders: dict = defaultdict(list)
    for o in orders:
        cust_orders[o["customer_id"]].append(o)

    # Determine RFM quintile boundaries
    all_recency = []
    all_frequency = []
    all_monetary = []

    for c in customers:
        o_list = cust_orders[c["id"]]
        if o_list:
            last = max(o["order_date"] for o in o_list)
            recency_days = (now - last).days
        else:
            recency_days = 365
        all_recency.append(recency_days)
        all_frequency.append(len(o_list))
        all_monetary.append(sum(o["amount"] for o in o_list))

    def percentile(data, pct):
        sorted_d = sorted(data)
        idx = int(len(sorted_d) * pct / 100)
        return sorted_d[min(idx, len(sorted_d) - 1)]

    r_p = [percentile(all_recency, p) for p in [20, 40, 60, 80]]
    f_p = [percentile(all_frequency, p) for p in [20, 40, 60, 80]]
    m_p = [percentile(all_monetary, p) for p in [20, 40, 60, 80]]

    def score(val, breakpoints, reverse=False):
        """Score 1–5; reverse=True means lower value = higher score."""
        s = 1
        for bp in breakpoints:
            if val >= bp:
                s += 1
        return (6 - s) if reverse else s

    enriched = []
    for c, rec, freq, mon in zip(customers, all_recency, all_frequency, all_monetary):
        r_score = score(rec, r_p, reverse=True)   # lower recency days = better
        f_score = score(freq, f_p)
        m_score = score(mon, m_p)

        health_score = round(((r_score + f_score + m_score) / 15) * 100, 1)
        health_status = (
            "healthy" if health_score >= 60
            else "at_risk" if health_score >= 30
            else "churning"
        )

        o_list = cust_orders[c["id"]]
        last_purchase = max((o["order_date"] for o in o_list), default=None)

        enriched.append({
            **c,
            "total_spent": round(mon, 2),
            "order_count": len(o_list),
            "last_purchase_date": last_purchase,
            "health_score": health_score,
            "health_status": health_status,
        })

    return enriched


async def seed(db_url: str):
    """Entry point – idempotent seed function."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from sqlalchemy import text, insert
    from models.database import Customer, Order, Base

    engine = create_async_engine(db_url, echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    AsyncSession_ = async_sessionmaker(engine, expire_on_commit=False)

    async with AsyncSession_() as session:
        count = (await session.execute(text("SELECT COUNT(*) FROM customers"))).scalar()
        if count and count > 0:
            print(f"Seed skipped – {count} customers already exist.")
            await engine.dispose()
            return

        print("Seeding database with 500 customers and 3000 orders...")
        customers_raw = _generate_customers(500)
        orders_raw = _generate_orders(customers_raw, 3000)
        customers_enriched = _compute_rfm(customers_raw, orders_raw)

        # Bulk insert customers
        await session.execute(
            insert(Customer),
            [
                {
                    "id": c["id"],
                    "name": c["name"],
                    "email": c["email"],
                    "phone": c["phone"],
                    "city": c["city"],
                    "age": c["age"],
                    "gender": c["gender"],
                    "preferred_channel": c["preferred_channel"],
                    "total_spent": c["total_spent"],
                    "last_purchase_date": c["last_purchase_date"],
                    "health_score": c["health_score"],
                    "health_status": c["health_status"],
                    "order_count": c["order_count"],
                }
                for c in customers_enriched
            ],
        )

        # Bulk insert orders
        await session.execute(
            insert(Order),
            [
                {
                    "id": o["id"],
                    "customer_id": o["customer_id"],
                    "amount": o["amount"],
                    "category": o["category"],
                    "order_date": o["order_date"],
                }
                for o in orders_raw
            ],
        )

        await session.commit()
        print("✓ Seeded 500 customers and 3000 orders successfully.")

    await engine.dispose()


if __name__ == "__main__":
    import os
    db_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://xenopilot:xenopilot123@localhost:5432/xenopilot")
    asyncio.run(seed(db_url))
