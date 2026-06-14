import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export const customersRouter = Router();

// GET /customers/stats
customersRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [
      totalCustomers,
      healthyCount,
      atRiskCount,
      churningCount,
      orderAgg,
      customerAgg,
      repeatCount,
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.count({ where: { healthStatus: 'healthy' } }),
      prisma.customer.count({ where: { healthStatus: 'at_risk' } }),
      prisma.customer.count({ where: { healthStatus: 'churning' } }),
      prisma.order.aggregate({ _sum: { amount: true }, _count: { id: true }, _avg: { amount: true } }),
      prisma.customer.aggregate({ _sum: { totalSpend: true } }),
      prisma.customer.count({ where: { orders: { some: {} } } }),
    ]);

    const totalRevenue = Number(customerAgg._sum.totalSpend) || 0;
    const totalOrders  = orderAgg._count.id || 0;
    const avgOrderValue = totalOrders > 0 ? (Number(orderAgg._sum.amount) || 0) / totalOrders : 0;

    // Generate a simple rule-based AI insight
    const atRiskPct = totalCustomers > 0 ? ((atRiskCount / totalCustomers) * 100).toFixed(0) : 0;
    const aiInsight = atRiskCount > 0
      ? `${atRiskPct}% of your customers are at risk of churning. Consider launching a personalised re-engagement campaign targeting this segment to recover potential revenue.`
      : `Great news — your customer base looks healthy! Focus on rewarding your ${healthyCount} healthy customers to boost lifetime value.`;

    res.json({
      total_customers: totalCustomers,
      active_customers: healthyCount,
      healthy_customers: healthyCount,
      at_risk_customers: atRiskCount,
      churning_customers: churningCount,
      repeat_customers: repeatCount,
      total_revenue: totalRevenue,
      avg_order_value: avgOrderValue,
      recent_engagement: Math.floor(healthyCount * 0.4),
      ai_insight: aiInsight,
      health_distribution: {
        healthy: healthyCount,
        at_risk: atRiskCount,
        churning: churningCount,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Failed to fetch customer stats' });
  }
});

// GET /customers/revenue-trend
customersRouter.get('/revenue-trend', async (req: Request, res: Response) => {
  try {
    const filter = (req.query.filter as string) || '6m';
    
    let months = 6;
    if (filter === '3m') months = 3;
    if (filter === '1y') months = 12;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const orders = await prisma.order.findMany({
      where: { orderDate: { gte: startDate } },
      select: { amount: true, orderDate: true },
      orderBy: { orderDate: 'asc' },
    });

    const monthlyRevenue: Record<string, number> = {};
    for (const order of orders) {
      const monthYear = `${order.orderDate.getFullYear()}-${(order.orderDate.getMonth() + 1).toString().padStart(2, '0')}`;
      monthlyRevenue[monthYear] = (monthlyRevenue[monthYear] || 0) + order.amount;
    }

    const monthlyData: Record<string, { revenue: number; orders: number }> = {};
    for (const order of orders) {
      const monthYear = order.orderDate.toLocaleString('en-US', { month: 'short', year: '2-digit' });
      if (!monthlyData[monthYear]) monthlyData[monthYear] = { revenue: 0, orders: 0 };
      monthlyData[monthYear].revenue += order.amount;
      monthlyData[monthYear].orders += 1;
    }

    const result = Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({ month, revenue: Math.round(d.revenue), orders: d.orders }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Failed to fetch revenue trend' });
  }
});

// GET /customers
customersRouter.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(String(req.query.page || '1'));
    const limit = parseInt(String(req.query.limit || '20'));
    const health = req.query.health as string | undefined;

    const where: Prisma.CustomerWhereInput = {};
    if (health) where.healthStatus = health;

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.customer.count({ where }),
    ]);

    res.json({
      customers: customers.map(c => ({
        ...c,
        total_spent: c.totalSpend,
        health_status: c.healthStatus,
        last_purchase_date: c.lastPurchaseDate,
        preferred_channel: c.preferredChannel,
        created_at: c.createdAt
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Failed to fetch customers' });
  }
});
