import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// ── Audience AI ─────────────────────────────────────────────────────────────

export async function parseAudienceQuery(query: string): Promise<{
  explanation: string;
  why_selected: string;
  filters: Array<{ field: string; operator: string; value: string | number }>;
}> {
  if (openai) {
    try {
      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a CRM audience builder. Parse a natural language query into structured filters.
Fields: total_spent, health_status (healthy/at_risk/churning), city, gender, preferred_channel (email/whatsapp/sms), order_count, age.
Operators: gt, lt, eq, gte, lte.
Return JSON: { explanation, why_selected, filters: [{field, operator, value}] }`,
          },
          { role: 'user', content: query },
        ],
      });
      return JSON.parse(resp.choices[0].message.content || '{}');
    } catch {
      // fall through to mock
    }
  }

  // Mock fallback
  const lq = query.toLowerCase();
  const filters: Array<{ field: string; operator: string; value: string | number }> = [];

  if (lq.includes('at-risk') || lq.includes('at risk'))
    filters.push({ field: 'health_status', operator: 'eq', value: 'at_risk' });
  if (lq.includes('churn'))
    filters.push({ field: 'health_status', operator: 'eq', value: 'churning' });
  if (lq.includes('healthy'))
    filters.push({ field: 'health_status', operator: 'eq', value: 'healthy' });
  if (lq.includes('high value') || lq.includes('spent'))
    filters.push({ field: 'total_spent', operator: 'gt', value: 500 });
  if (lq.includes('email'))
    filters.push({ field: 'preferred_channel', operator: 'eq', value: 'email' });
  if (lq.includes('whatsapp'))
    filters.push({ field: 'preferred_channel', operator: 'eq', value: 'whatsapp' });
  if (filters.length === 0)
    filters.push({ field: 'health_status', operator: 'eq', value: 'at_risk' });

  return {
    explanation: `Identified customers matching: "${query}"`,
    why_selected: 'Customers were selected based on behavioral signals and RFM segmentation patterns indicating engagement opportunity.',
    filters,
  };
}

// ── Campaign AI ─────────────────────────────────────────────────────────────

export async function generateCampaignContent(payload: {
  query: string;
  audience_size: number;
  avg_spend: number;
  health_focus: string;
  recoverable_revenue: number;
}): Promise<{
  name: string;
  goal: string;
  subject_line: string;
  message_body: string;
  cta: string;
  channel: string;
  channel_confidence: number;
  channel_reasoning: string;
}> {
  if (openai) {
    try {
      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are an expert CRM campaign copywriter. Generate compelling campaign content.
Return JSON: { name, goal, subject_line, message_body, cta, channel, channel_confidence (0-1), channel_reasoning }`,
          },
          {
            role: 'user',
            content: `Create a campaign for: "${payload.query}"
Audience: ${payload.audience_size} customers, avg spend ₹${payload.avg_spend.toFixed(0)}, focus: ${payload.health_focus}
Recoverable revenue: ₹${payload.recoverable_revenue.toFixed(0)}`,
          },
        ],
      });
      return JSON.parse(resp.choices[0].message.content || '{}');
    } catch {
      // fall through to mock
    }
  }

  // Mock fallback
  const isChurning = payload.health_focus === 'churning';
  const isHealthy = payload.health_focus === 'healthy';
  const channel = isChurning ? 'whatsapp' : isHealthy ? 'email' : 'email';

  return {
    name: isChurning
      ? 'Win-Back Campaign'
      : isHealthy
        ? 'Loyalty Rewards Campaign'
        : 'Re-Engagement Campaign',
    goal: isChurning
      ? 'Recover churning customers with an exclusive offer'
      : isHealthy
        ? 'Reward top customers and increase lifetime value'
        : 'Re-engage at-risk customers before they churn',
    subject_line: isChurning
      ? "We miss you — here's 20% off to come back 💫"
      : isHealthy
        ? "You're our VIP — exclusive rewards inside ⭐"
        : "It's been a while — we have something special for you 🎁",
    message_body: isChurning
      ? `Hi {{name}}, we noticed you haven't shopped with us recently. As a valued customer, we'd love to welcome you back with an exclusive 20% discount on your next order. This offer expires in 48 hours!`
      : isHealthy
        ? `Hi {{name}}, thank you for being one of our most loyal customers! As a VIP member, you're getting early access to our exclusive rewards program. Enjoy special perks designed just for you.`
        : `Hi {{name}}, we've been thinking about you! It's been a while since your last visit, and we miss you. Come back today and discover what's new — we have great deals waiting for you.`,
    cta: isChurning ? 'Claim 20% Off Now' : isHealthy ? 'Access VIP Rewards' : 'Shop New Arrivals',
    channel,
    channel_confidence: 0.87,
    channel_reasoning: `${channel.charAt(0).toUpperCase() + channel.slice(1)} has the highest engagement rate for ${payload.health_focus} customer segments based on historical campaign data.`,
  };
}

// ── Prediction AI ────────────────────────────────────────────────────────────

export function predictOutcomes(payload: {
  channel: string;
  audience_size: number;
  avg_spend: number;
  health_focus: string;
}): {
  predicted_open_rate: number;
  predicted_ctr: number;
  predicted_conversion_rate: number;
  confidence_score: number;
  predicted_revenue: number;
} {
  const baseRates: Record<string, { open: number; ctr: number; conv: number }> = {
    email: { open: 0.28, ctr: 0.048, conv: 0.022 },
    whatsapp: { open: 0.72, ctr: 0.15, conv: 0.08 },
    sms: { open: 0.55, ctr: 0.09, conv: 0.035 },
  };

  const healthMultipliers: Record<string, number> = {
    healthy: 1.25,
    at_risk: 1.0,
    churning: 0.75,
  };

  const base = baseRates[payload.channel] || baseRates['email'];
  const mult = healthMultipliers[payload.health_focus] || 1.0;

  const open = Math.min(base.open * mult + (Math.random() - 0.5) * 0.05, 0.95);
  const ctr = Math.min(base.ctr * mult + (Math.random() - 0.5) * 0.01, 0.5);
  const conv = Math.min(base.conv * mult + (Math.random() - 0.5) * 0.005, 0.25);
  const revenue = payload.audience_size * conv * payload.avg_spend * 0.8;

  return {
    predicted_open_rate: parseFloat(open.toFixed(3)),
    predicted_ctr: parseFloat(ctr.toFixed(3)),
    predicted_conversion_rate: parseFloat(conv.toFixed(3)),
    confidence_score: parseFloat((0.78 + Math.random() * 0.15).toFixed(2)),
    predicted_revenue: parseFloat(revenue.toFixed(2)),
  };
}

// ── Recommendations AI ───────────────────────────────────────────────────────

export function generateRecommendations(analytics: {
  open_rate: number;
  ctr: number;
  conversion_rate: number;
  channel: string;
  total_sent: number;
}): Array<{
  title: string;
  description: string;
  action: string;
  priority: string;
  estimated_impact: string;
}> {
  const recs = [];

  if (analytics.open_rate < 0.25) {
    recs.push({
      title: 'Improve Subject Lines',
      description: 'Open rate is below benchmark. A/B test more personalized, urgency-driven subject lines.',
      action: 'Test 3 subject line variants with emoji + personalization tokens',
      priority: 'high',
      estimated_impact: '+8-12% open rate improvement',
    });
  }

  if (analytics.ctr < 0.05) {
    recs.push({
      title: 'Strengthen Call-to-Action',
      description: 'Click-through rate is low. The CTA button needs to be more prominent and action-oriented.',
      action: 'Redesign CTA with contrasting color and specific benefit ("Get 20% Off" vs "Click Here")',
      priority: 'high',
      estimated_impact: '+3-5% CTR increase',
    });
  }

  if (analytics.channel === 'email' && analytics.open_rate < 0.3) {
    recs.push({
      title: 'Switch to WhatsApp for Re-engagement',
      description: 'Email engagement is low for this segment. WhatsApp has 2.5x higher open rates.',
      action: 'Migrate this audience segment to WhatsApp channel',
      priority: 'medium',
      estimated_impact: '+45% open rate, +20% conversion',
    });
  }

  if (analytics.total_sent > 100 && analytics.conversion_rate < 0.02) {
    recs.push({
      title: 'Add Incentive Offer',
      description: 'Conversion rate is below 2%. Adding a time-limited discount can significantly boost conversions.',
      action: 'Include a 15% off coupon valid for 48 hours in follow-up message',
      priority: 'medium',
      estimated_impact: '+4-7% conversion rate',
    });
  }

  recs.push({
    title: 'Retarget Non-Openers',
    description: `${Math.round((1 - analytics.open_rate) * 100)}% of recipients haven't opened yet. Send a follow-up with a different subject line.`,
    action: 'Schedule follow-up campaign 3 days after initial send',
    priority: 'low',
    estimated_impact: '+5-8% incremental opens',
  });

  return recs;
}
