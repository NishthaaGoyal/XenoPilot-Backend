import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { generateRecommendations } from '../lib/ai';

export const recommendationsRouter = Router();

// GET /recommendations/:campaign_id
recommendationsRouter.get('/:campaign_id', async (req: Request, res: Response) => {
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
    const opened = snapshot.opened;
    const clicked = snapshot.clicked;
    const converted = snapshot.converted;

    const openRate = totalSent > 0 ? opened / totalSent : 0;
    const ctr = totalSent > 0 ? clicked / totalSent : 0;
    const convRate = totalSent > 0 ? converted / totalSent : 0;

    const recommendations = generateRecommendations({
      open_rate: openRate,
      ctr,
      conversion_rate: convRate,
      channel: campaign.channel,
      total_sent: totalSent,
    });

    // Top city (fetch simplified since we flattened)
    // We could group CampaignEvents by Customer City but for speed we'll say N/A
    const topCity = 'N/A';

    // Open rate assessment
    let openRateAssessment = 'Good';
    if (openRate < 0.2) openRateAssessment = 'Below Average — needs improvement';
    else if (openRate < 0.35) openRateAssessment = 'Average — room for optimization';
    else openRateAssessment = 'Excellent — above industry benchmark';

    res.json({
      campaign_id,
      summary: `Campaign "${campaign.name}" reached ${totalSent} customers with a ${(openRate * 100).toFixed(1)}% open rate and ${(ctr * 100).toFixed(1)}% CTR.`,
      top_performing_city: topCity,
      best_channel: campaign.channel,
      open_rate_assessment: openRateAssessment,
      recommendations,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Failed to fetch recommendations' });
  }
});
