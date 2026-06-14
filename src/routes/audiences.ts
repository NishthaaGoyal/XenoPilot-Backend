import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { parseAudienceQuery } from '../lib/ai';
import { Prisma } from '@prisma/client';

export const audiencesRouter = Router();

// POST /audiences/generate
audiencesRouter.post('/generate', async (req: Request, res: Response) => {
  try {
    const { query } = req.body as { query: string };
    if (!query) {
      res.status(400).json({ detail: 'query is required' });
      return;
    }

    const { explanation, why_selected, filters } = await parseAudienceQuery(query);

    // Build Prisma where clause from filters
    const where: Prisma.CustomerWhereInput = {};
    for (const f of filters) {
      const val = f.value;
      if (f.field === 'health_status') {
        where.healthStatus = { equals: String(val) };
      } else if (f.field === 'preferred_channel') {
        where.preferredChannel = { equals: String(val) };
      } else if (f.field === 'city') {
        where.city = { equals: String(val) };
      } else if (f.field === 'total_spent') {
        const numVal = Number(val);
        if (f.operator === 'gt') where.totalSpend = { gt: numVal };
        else if (f.operator === 'gte') where.totalSpend = { gte: numVal };
        else if (f.operator === 'lt') where.totalSpend = { lt: numVal };
        else if (f.operator === 'lte') where.totalSpend = { lte: numVal };
        else if (f.operator === 'eq') where.totalSpend = { equals: numVal };
      }
    }

    const customers = await prisma.customer.findMany({
      where,
      take: 500,
      orderBy: { totalSpend: 'desc' },
    });

    // Compute metrics
    const totalSpent = customers.reduce((s, c) => s + c.totalSpend, 0);
    const avgSpend = customers.length > 0 ? totalSpent / customers.length : 0;
    const daysSincePurchase = customers.map((c) => {
      if (!c.lastPurchaseDate) return 180;
      const diff = (Date.now() - new Date(c.lastPurchaseDate).getTime()) / (1000 * 60 * 60 * 24);
      return Math.floor(diff);
    });
    const avgDays =
      daysSincePurchase.length > 0
        ? daysSincePurchase.reduce((a, b) => a + b, 0) / daysSincePurchase.length
        : 0;

    const cityBreakdown: Record<string, number> = {};
    const channelBreakdown: Record<string, number> = {};
    for (const c of customers) {
      cityBreakdown[c.city] = (cityBreakdown[c.city] || 0) + 1;
      channelBreakdown[c.preferredChannel] = (channelBreakdown[c.preferredChannel] || 0) + 1;
    }

    const recoverableRevenue = customers
      .filter((c) => c.healthStatus !== 'healthy')
      .reduce((s, c) => s + c.totalSpend * 0.3, 0);

    res.json({
      query,
      explanation,
      why_selected,
      filters_applied: filters,
      metrics: {
        audience_size: customers.length,
        avg_spend: parseFloat(avgSpend.toFixed(2)),
        avg_days_since_purchase: parseFloat(avgDays.toFixed(1)),
        recoverable_revenue: parseFloat(recoverableRevenue.toFixed(2)),
        city_breakdown: cityBreakdown,
        channel_breakdown: channelBreakdown,
      },
      customers: customers.map(c => ({
        ...c,
        total_spent: c.totalSpend,
        health_status: c.healthStatus,
        last_purchase_date: c.lastPurchaseDate,
        preferred_channel: c.preferredChannel
      })) // Map back to snake_case for frontend
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Failed to generate audience' });
  }
});
