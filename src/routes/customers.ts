import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export const customersRouter = Router();

// GET /customers/stats
customersRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const totalCustomers = await prisma.customer.count();
    const healthyCount = await prisma.customer.count({ where: { healthStatus: 'healthy' } });
    const atRiskCount = await prisma.customer.count({ where: { healthStatus: 'at_risk' } });
    const churningCount = await prisma.customer.count({ where: { healthStatus: 'churning' } });

    const aggregates = await prisma.customer.aggregate({
      _sum: { totalSpend: true },
    });

    res.json({
      total_customers: totalCustomers,
      active_customers: healthyCount,
      total_revenue: aggregates._sum.totalSpend || 0,
      recent_engagement: Math.floor(healthyCount * 0.4), // mock for UI
      health_distribution: {
        healthy: healthyCount,
        at_risk: atRiskCount,
        churning: churningCount
      }
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

    const labels = Object.keys(monthlyRevenue).sort();
    const data = labels.map((l) => monthlyRevenue[l]);

    res.json({ labels, data });
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
