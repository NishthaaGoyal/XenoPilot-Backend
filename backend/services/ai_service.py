"""
AI Service – OpenAI GPT-4o with realistic mock fallbacks.
When OPENAI_API_KEY is set, uses GPT-4o with structured outputs.
Otherwise returns contextually-aware mock responses.
"""

import json
import random
from typing import Optional
from config import get_settings

settings = get_settings()

# Lazy-load OpenAI only if key is provided
_openai_client = None


def _get_client():
    global _openai_client
    if _openai_client is None and settings.openai_api_key:
        from openai import AsyncOpenAI
        _openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _openai_client


# ── Mock Response Templates ────────────────────────────────────────────────────

_AUDIENCE_MOCKS = [
    {
        "explanation": "Identified customers with high purchase history but no activity in the last 60+ days. These are your highest-potential win-back targets.",
        "why_selected": "These customers have demonstrated strong buying intent in the past (₹5,000+ average spend) but have gone quiet. A well-timed, personalised offer has a high probability of re-activating them.",
        "filters": [
            {"field": "total_spent", "operator": "gte", "value": 5000},
            {"field": "days_since_purchase", "operator": "gte", "value": 60},
        ],
    },
    {
        "explanation": "Surfaced premium customers from Tier-1 cities who are at risk of churning based on declining purchase frequency.",
        "why_selected": "These are your most valuable customers by lifetime value. Even retaining 20% of this segment would recover significant revenue. Urgency: high.",
        "filters": [
            {"field": "total_spent", "operator": "gte", "value": 8000},
            {"field": "health_status", "operator": "eq", "value": "at_risk"},
        ],
    },
    {
        "explanation": "Found customers who purchase frequently but spend below average — strong upsell candidates.",
        "why_selected": "This segment shops consistently (3+ orders) but each basket is small. A targeted bundle or category expansion offer could meaningfully grow their LTV.",
        "filters": [
            {"field": "order_count", "operator": "gte", "value": 3},
            {"field": "total_spent", "operator": "lte", "value": 4000},
        ],
    },
    {
        "explanation": "Discovered customers who haven't purchased in 90+ days and are classified as churning.",
        "why_selected": "This is your most at-risk cohort. Without intervention, these customers are likely lost permanently. A high-discount win-back offer is recommended.",
        "filters": [
            {"field": "health_status", "operator": "eq", "value": "churning"},
            {"field": "days_since_purchase", "operator": "gte", "value": 90},
        ],
    },
]

_CAMPAIGN_MOCKS = [
    {
        "name": "Win-Back Campaign",
        "goal": "Re-engage lapsed customers who haven't purchased in 60+ days",
        "subject_line": "We Miss You ❤️ — Here's 20% Off, Just for You",
        "message_body": "Hi {name},\n\nIt's been a while since we've seen you, and honestly, we miss you.\n\nAs a thank-you for being a valued customer, we're offering you 20% off your next purchase — no minimum spend required.\n\nYour favourite brands are waiting. Come back and explore what's new.\n\nThis offer expires in 48 hours.",
        "cta": "Claim My 20% Off",
    },
    {
        "name": "Premium Re-Engagement",
        "goal": "Re-activate high-value customers showing churn signals",
        "subject_line": "Your Exclusive VIP Offer is Ready 🌟",
        "message_body": "Hi {name},\n\nAs one of our most valued customers, you deserve something special.\n\nWe've put together an exclusive offer just for you — early access to our new collection along with a ₹500 loyalty credit added to your account.\n\nNo strings attached. Just our way of saying thank you for your loyalty.",
        "cta": "View My Exclusive Offer",
    },
    {
        "name": "Upsell Campaign",
        "goal": "Increase basket size for frequent but low-spend customers",
        "subject_line": "You'll Love These Picks Based on Your History 🛍️",
        "message_body": "Hi {name},\n\nWe've curated a selection just for you based on what you love.\n\nBuy 2, Get 1 Free — this weekend only. Mix and match from your favourite categories: Fashion, Beauty, and Coffee.\n\nYour personalized picks are ready inside.",
        "cta": "See My Picks",
    },
    {
        "name": "Churn Recovery",
        "goal": "Last-chance re-activation for churning customers",
        "subject_line": "Last Chance: Your Account Has a ₹300 Credit Waiting",
        "message_body": "Hi {name},\n\nWe noticed it's been a while, and we don't want to lose you.\n\nWe've added ₹300 credit to your account — valid for the next 72 hours only. No minimum purchase required.\n\nWe'd love to have you back.",
        "cta": "Use My ₹300 Credit",
    },
]

_CHANNEL_RULES = {
    "churning": {"channel": "whatsapp", "confidence": 0.84, "reasoning": "Churning customers respond best to direct, personal outreach. WhatsApp has 3× higher open rates than email for this segment and creates an immediate sense of personal attention."},
    "at_risk": {"channel": "whatsapp", "confidence": 0.78, "reasoning": "At-risk customers need timely engagement. WhatsApp delivers messages instantly with read receipts, making it ideal for time-sensitive re-engagement."},
    "healthy": {"channel": "email", "confidence": 0.81, "reasoning": "Healthy customers are active and engaged. Email allows richer content, product carousels, and detailed personalization that drives higher conversion for this segment."},
    "mixed": {"channel": "sms", "confidence": 0.72, "reasoning": "For a mixed audience, SMS provides universal reach with high deliverability across all demographics and device types."},
}

_INSIGHT_MOCKS = [
    "187 customers haven't purchased in 60+ days. Estimated revenue at risk: ₹2.3 lakh. A win-back campaign targeting this segment could recover 25–35% of that value.",
    "Your top 15% of customers drive 61% of total revenue. This segment is currently healthy but showing early churn signals — proactive engagement now prevents expensive win-backs later.",
    "Customers from Chennai have a 40% higher repeat purchase rate than average. Consider region-specific offers to amplify this trend.",
    "Fashion category drives the highest average order value (₹3,200). Customers who buy Fashion + Beauty have 2× the LTV of single-category buyers.",
]


# ── Service Functions ─────────────────────────────────────────────────────────

async def interpret_audience_query(query: str, db_stats: dict) -> dict:
    """Convert natural language query into audience filters + explanation."""

    client = _get_client()
    if client:
        try:
            prompt = f"""You are an AI audience builder for a retail CRM.
Database stats: {json.dumps(db_stats)}

User query: "{query}"

Return a JSON object with:
- explanation: 1-2 sentence summary of who was selected
- why_selected: 2-3 sentence explanation of WHY these customers were selected (strategic rationale)
- filters: list of {{field, operator, value}} objects using fields: total_spent, days_since_purchase, health_status (healthy/at_risk/churning), order_count, city, age, preferred_channel, gender

Respond ONLY with valid JSON."""

            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.3,
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"OpenAI error (audience): {e}")

    # Mock fallback – pick template based on query keywords
    q = query.lower()
    if any(w in q for w in ["churn", "lost", "inactive", "haven't purchased", "not purchased"]):
        template = _AUDIENCE_MOCKS[3]
    elif any(w in q for w in ["premium", "high value", "vip", "top"]):
        template = _AUDIENCE_MOCKS[1]
    elif any(w in q for w in ["frequent", "upsell", "small", "basket"]):
        template = _AUDIENCE_MOCKS[2]
    else:
        template = _AUDIENCE_MOCKS[0]

    return template


async def generate_campaign_content(
    audience_explanation: str,
    audience_size: int,
    avg_spend: float,
    health_focus: str,
    recoverable_revenue: float,
) -> dict:
    """Generate campaign copy and channel recommendation."""

    client = _get_client()
    if client:
        try:
            prompt = f"""You are an expert CRM campaign copywriter for Indian retail brands (fashion, beauty, coffee).

Audience: {audience_explanation}
Audience size: {audience_size} customers
Average spend: ₹{avg_spend:,.0f}
Customer health: {health_focus}
Recoverable revenue: ₹{recoverable_revenue:,.0f}

Generate a campaign. Return JSON with:
- name: short campaign name
- goal: campaign objective (1 sentence)
- subject_line: email/whatsapp subject (with 1 emoji, max 60 chars)
- message_body: personalized message (use {{name}} as placeholder, 3-4 short paragraphs)
- cta: call-to-action button text (max 5 words)
- channel: recommended channel (whatsapp/email/sms)
- channel_confidence: float 0-1
- channel_reasoning: 1-2 sentences explaining channel choice

Respond ONLY with valid JSON."""

            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.7,
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"OpenAI error (campaign): {e}")

    # Mock fallback
    campaign = random.choice(_CAMPAIGN_MOCKS).copy()
    channel_info = _CHANNEL_RULES.get(health_focus, _CHANNEL_RULES["mixed"])
    campaign.update(channel_info)
    return campaign


async def predict_campaign_outcomes(
    channel: str,
    audience_size: int,
    avg_spend: float,
    health_focus: str,
) -> dict:
    """Predict campaign performance metrics."""

    client = _get_client()
    if client:
        try:
            prompt = f"""You are a campaign performance predictor for an Indian retail CRM.

Campaign details:
- Channel: {channel}
- Audience size: {audience_size}
- Average customer spend: ₹{avg_spend:,.0f}
- Customer health segment: {health_focus}

Return JSON with realistic predictions:
- predicted_open_rate: float 0-1 (e.g. 0.62 = 62%)
- predicted_ctr: float 0-1
- predicted_conversion_rate: float 0-1
- confidence_score: float 0-1 (based on data quality)
- predicted_revenue: estimated revenue from campaign in INR

Base on real-world benchmarks. WhatsApp opens are highest (60-80%), SMS medium (40-60%), email lowest (20-40%).

Respond ONLY with valid JSON."""

            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.2,
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"OpenAI error (prediction): {e}")

    # Mock fallback with realistic benchmarks
    benchmarks = {
        "whatsapp": {"open": (0.62, 0.82), "ctr": (0.25, 0.42), "conv": (0.08, 0.18)},
        "sms":      {"open": (0.42, 0.62), "ctr": (0.12, 0.28), "conv": (0.04, 0.12)},
        "email":    {"open": (0.22, 0.42), "ctr": (0.08, 0.22), "conv": (0.02, 0.08)},
    }
    b = benchmarks.get(channel, benchmarks["email"])

    # Adjust for health status
    multiplier = {"churning": 0.75, "at_risk": 0.90, "healthy": 1.15, "mixed": 1.0}.get(health_focus, 1.0)

    open_rate = random.uniform(*b["open"]) * multiplier
    ctr = random.uniform(*b["ctr"]) * multiplier
    conv = random.uniform(*b["conv"]) * multiplier
    confidence = random.uniform(0.72, 0.91)
    pred_revenue = audience_size * conv * avg_spend * 0.3

    return {
        "predicted_open_rate": round(min(open_rate, 0.95), 3),
        "predicted_ctr": round(min(ctr, 0.55), 3),
        "predicted_conversion_rate": round(min(conv, 0.30), 3),
        "confidence_score": round(confidence, 2),
        "predicted_revenue": round(pred_revenue, 2),
    }


async def generate_ai_insight(db_stats: dict) -> str:
    """Generate the dashboard AI insight card."""
    client = _get_client()
    if client:
        try:
            prompt = f"""You are an AI marketing analyst. Generate a single, actionable insight for a retail brand CRM dashboard.

Data: {json.dumps(db_stats)}

Return a single sentence insight that:
1. Highlights a specific number/metric
2. Explains business impact
3. Suggests an action

Example: "187 customers haven't purchased in 60+ days. Estimated revenue at risk: ₹1.8 lakh. A win-back campaign targeting this segment could recover 25-35%."

Respond with ONLY the insight text, no JSON."""

            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.5,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"OpenAI error (insight): {e}")

    return random.choice(_INSIGHT_MOCKS)


async def generate_campaign_insights(analytics: dict) -> dict:
    """Generate post-campaign AI insights and next best actions."""

    client = _get_client()
    if client:
        try:
            prompt = f"""You are an AI campaign analyst for an Indian retail brand.

Campaign analytics: {json.dumps(analytics)}

Return JSON with:
- summary: 2-3 sentence overall assessment
- top_performing_city: city name with highest engagement
- best_channel: channel used
- open_rate_assessment: "excellent" | "good" | "average" | "poor"
- recommendations: list of 3 objects with:
  - title: short action title
  - description: 1-2 sentence explanation
  - action: CTA text (e.g. "Create Follow-up Campaign")
  - priority: "high" | "medium" | "low"
  - estimated_impact: e.g. "₹45,000 potential recovery"

Respond ONLY with valid JSON."""

            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.4,
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            print(f"OpenAI error (insights): {e}")

    # Mock fallback
    open_rate = analytics.get("open_rate", 0)
    assessment = "excellent" if open_rate > 0.6 else "good" if open_rate > 0.4 else "average" if open_rate > 0.2 else "poor"

    return {
        "summary": f"Your campaign reached {analytics.get('total_sent', 0):,} customers with a {open_rate*100:.1f}% open rate — {'above' if open_rate > 0.4 else 'below'} industry benchmarks for this channel. The conversion funnel shows strong delivery but an opportunity to improve click-to-convert rates.",
        "top_performing_city": analytics.get("top_city", "Chennai"),
        "best_channel": analytics.get("channel", "whatsapp"),
        "open_rate_assessment": assessment,
        "recommendations": [
            {
                "title": "Follow-up Campaign for Clickers",
                "description": f"Customers who clicked but didn't convert are warm leads. A targeted follow-up within 48 hours can recover an estimated 30–40% of that group.",
                "action": "Create Follow-up Campaign",
                "priority": "high",
                "estimated_impact": f"₹{analytics.get('total_sent', 100) * 0.1 * 800:,.0f} potential revenue",
            },
            {
                "title": "Re-target Non-Openers with SMS",
                "description": "Customers who didn't open your message may prefer a different channel. A cross-channel SMS nudge typically lifts total campaign reach by 15–20%.",
                "action": "Build SMS Retargeting Audience",
                "priority": "medium",
                "estimated_impact": "15–20% reach uplift",
            },
            {
                "title": "Launch Loyalty Tier for Converters",
                "description": "Customers who converted are your highest-intent audience right now. Enroll them in a loyalty programme to maximize their 90-day LTV.",
                "action": "Design Loyalty Campaign",
                "priority": "medium",
                "estimated_impact": "2× LTV improvement",
            },
        ],
    }
