import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const analyticsRouter = Router();

// GET /analytics/:campaign_id
analyticsRouter.get('/:campaign_id', async (req: Request, res: Response) => {
  try {
    const { campaign_id } = req.params;

    const campaign = await prisma.campaign.findUnique({ where: { id: String(campaign_id) } });
    if (!campaign) {
      res.status(404).json({ detail: 'Campaign not found' });
      return;
    }

    const communications = await prisma.communication.findMany({
      where: { campaign_id: String(campaign_id) },
      include: { events: true, customer: { select: { city: true } } },
    });

    const totalSent = communications.length;
    const delivered = communications.filter((c) =>
      ['delivered', 'opened', 'clicked'].includes(c.status),
    ).length;
    const opened = communications.filter((c) =>
      ['opened', 'clicked'].includes(c.status),
    ).length;
    const clicked = communications.filter((c) => c.status === 'clicked').length;
    const failed = communications.filter((c) => c.status === 'failed').length;
    const converted = Math.floor(clicked * 0.35); // estimate conversions from clicks

    const cityBreakdown: Record<string, number> = {};
    for (const c of communications) {
      const city = c.customer.city;
      cityBreakdown[city] = (cityBreakdown[city] || 0) + 1;
    }

    // Build event timeline (hourly buckets for last 24h)
    const timeline: { time: string; events: number }[] = [];
    const now = new Date();
    for (let h = 23; h >= 0; h--) {
      const t = new Date(now.getTime() - h * 60 * 60 * 1000);
      const label = t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const count = communications.filter((c) => {
        const created = new Date(c.created_at);
        return Math.abs(created.getTime() - t.getTime()) < 30 * 60 * 1000;
      }).length;
      if (count > 0) timeline.push({ time: label, events: count });
    }

    const estimatedRevenue = converted * (campaign.predicted_conversion_rate ?? 0.03) * 1500;

    res.json({
      campaign_id,
      campaign_name: campaign.name,
      channel: campaign.channel,
      status: campaign.status,
      total_sent: totalSent,
      delivered,
      opened,
      clicked,
      converted,
      failed,
      open_rate: totalSent > 0 ? parseFloat((opened / totalSent).toFixed(3)) : 0,
      ctr: totalSent > 0 ? parseFloat((clicked / totalSent).toFixed(3)) : 0,
      conversion_rate: totalSent > 0 ? parseFloat((converted / totalSent).toFixed(3)) : 0,
      delivery_rate: totalSent > 0 ? parseFloat((delivered / totalSent).toFixed(3)) : 0,
      estimated_revenue: parseFloat(estimatedRevenue.toFixed(2)),
      city_breakdown: cityBreakdown,
      event_timeline: timeline,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Failed to fetch analytics' });
  }
});
