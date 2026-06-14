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
        where.health_status = { equals: String(val) };
      } else if (f.field === 'preferred_channel') {
        where.preferred_channel = { equals: String(val) };
      } else if (f.field === 'city') {
        where.city = { equals: String(val) };
      } else if (f.field === 'gender') {
        where.gender = { equals: String(val) };
      } else if (['total_spent', 'age', 'order_count', 'health_score'].includes(f.field)) {
        const numVal = Number(val);
        const prismaField = f.field as 'total_spent' | 'age' | 'order_count' | 'health_score';
        if (f.operator === 'gt') (where as any)[prismaField] = { gt: numVal };
        else if (f.operator === 'gte') (where as any)[prismaField] = { gte: numVal };
        else if (f.operator === 'lt') (where as any)[prismaField] = { lt: numVal };
        else if (f.operator === 'lte') (where as any)[prismaField] = { lte: numVal };
        else if (f.operator === 'eq') (where as any)[prismaField] = { equals: numVal };
      }
    }

    const customers = await prisma.customer.findMany({
      where,
      take: 500,
      orderBy: { total_spent: 'desc' },
    });

    // Compute metrics
    const totalSpent = customers.reduce((s, c) => s + c.total_spent, 0);
    const avgSpend = customers.length > 0 ? totalSpent / customers.length : 0;
    const daysSincePurchase = customers.map((c) => {
      if (!c.last_purchase_date) return 180;
      const diff = (Date.now() - new Date(c.last_purchase_date).getTime()) / (1000 * 60 * 60 * 24);
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
      channelBreakdown[c.preferred_channel] = (channelBreakdown[c.preferred_channel] || 0) + 1;
    }

    const recoverableRevenue = customers
      .filter((c) => c.health_status !== 'healthy')
      .reduce((s, c) => s + c.total_spent * 0.3, 0);

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
      customers,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Failed to generate audience' });
  }
});
