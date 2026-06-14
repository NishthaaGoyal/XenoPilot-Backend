import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const customersRouter = Router();

// GET /customers/stats
customersRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [
      total,
      totalRevenue,
      atRiskCount,
      churningCount,
      healthyCount,
      repeatCustomers,
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.aggregate({ _sum: { total_spent: true } }),
      prisma.customer.count({ where: { health_status: 'at_risk' } }),
      prisma.customer.count({ where: { health_status: 'churning' } }),
      prisma.customer.count({ where: { health_status: 'healthy' } }),
      prisma.customer.count({ where: { order_count: { gt: 1 } } }),
    ]);

    const revenue = totalRevenue._sum.total_spent ?? 0;
    const totalOrders = await prisma.order.count();
    const avgOrderValue = totalOrders > 0 ? revenue / totalOrders : 0;

    // Generate AI insight
    const churnPct = total > 0 ? ((churningCount / total) * 100).toFixed(1) : '0';
    const atRiskPct = total > 0 ? ((atRiskCount / total) * 100).toFixed(1) : '0';
    let ai_insight = `${churnPct}% of your customers are churning and ${atRiskPct}% are at risk. `;
    if (churningCount > 50) {
      ai_insight += `Launching a win-back campaign targeting the ${churningCount} churning customers could recover an estimated ₹${(churningCount * avgOrderValue * 0.3).toFixed(0)} in revenue.`;
    } else {
      ai_insight += `Your customer base is healthy. Focus on rewarding your ${healthyCount} loyal customers to increase lifetime value.`;
    }

    res.json({
      total_customers: total,
      total_revenue: parseFloat(revenue.toFixed(2)),
      repeat_customers: repeatCustomers,
      at_risk_customers: atRiskCount,
      churning_customers: churningCount,
      healthy_customers: healthyCount,
      avg_order_value: parseFloat(avgOrderValue.toFixed(2)),
      ai_insight,
      health_distribution: {
        healthy: healthyCount,
        at_risk: atRiskCount,
        churning: churningCount,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Failed to fetch stats' });
  }
});

// GET /customers/revenue-trend
customersRouter.get('/revenue-trend', async (_req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      select: { amount: true, order_date: true },
      orderBy: { order_date: 'asc' },
    });

    // Group by month (last 6 months)
    const now = new Date();
    const months: { month: string; revenue: number; orders: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

      const monthOrders = orders.filter(
        (o) => new Date(o.order_date) >= start && new Date(o.order_date) <= end,
      );

      months.push({
        month: label,
        revenue: parseFloat(monthOrders.reduce((sum, o) => sum + o.amount, 0).toFixed(2)),
        orders: monthOrders.length,
      });
    }

    res.json(months);
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Failed to fetch revenue trend' });
  }
});

// GET /customers?page=1&limit=20&health=at_risk
customersRouter.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(String(req.query.page || '1'));
    const limit = parseInt(String(req.query.limit || '20'));
    const health = req.query.health as string | undefined;

    const where = health ? { health_status: health } : {};

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      prisma.customer.count({ where }),
    ]);

    res.json({
      customers,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Failed to fetch customers' });
  }
});
