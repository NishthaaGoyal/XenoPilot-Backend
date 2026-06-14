import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const analyticsRouter = Router();

// GET /analytics/:campaign_id
analyticsRouter.get('/:campaign_id', async (req: Request, res: Response) => {
  try {
    const { campaign_id } = req.params;

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaign_id },
      include: { analyticsSnapshot: true }
    });

    if (!campaign) {
      res.status(404).json({ detail: 'Campaign not found' });
      return;
    }

    const snapshot = campaign.analyticsSnapshot || {
      sent: 0, delivered: 0, opened: 0, clicked: 0, converted: 0, revenueGenerated: 0
    };

    const totalSent = snapshot.sent;

    // Build event timeline (hourly buckets for last 24h)
    const timeline: { time: string; events: number }[] = [];
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recentEvents = await prisma.campaignEvent.findMany({
      where: {
        campaignId: campaign_id,
        timestamp: { gte: twentyFourHoursAgo }
      },
      select: { timestamp: true }
    });

    for (let h = 23; h >= 0; h--) {
      const t = new Date(now.getTime() - h * 60 * 60 * 1000);
      const label = t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
      const count = recentEvents.filter((e) => {
        return Math.abs(e.timestamp.getTime() - t.getTime()) < 30 * 60 * 1000;
      }).length;
      if (count > 0) timeline.push({ time: label, events: count });
    }

    res.json({
      campaign_id,
      campaign_name: campaign.name,
      channel: campaign.channel,
      status: campaign.status,
      total_sent: totalSent,
      delivered: snapshot.delivered,
      opened: snapshot.opened,
      clicked: snapshot.clicked,
      converted: snapshot.converted,
      failed: Math.max(0, totalSent - snapshot.delivered),
      open_rate: totalSent > 0 ? parseFloat((snapshot.opened / totalSent).toFixed(3)) : 0,
      ctr: totalSent > 0 ? parseFloat((snapshot.clicked / totalSent).toFixed(3)) : 0,
      conversion_rate: totalSent > 0 ? parseFloat((snapshot.converted / totalSent).toFixed(3)) : 0,
      delivery_rate: totalSent > 0 ? parseFloat((snapshot.delivered / totalSent).toFixed(3)) : 0,
      estimated_revenue: parseFloat(snapshot.revenueGenerated.toFixed(2)),
      city_breakdown: {}, // Deprecated in flat structure for performance
      event_timeline: timeline,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Failed to fetch analytics' });
  }
});
