import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { generateCampaignContent, predictOutcomes as predictAI } from '../lib/ai';
import { Prisma } from '@prisma/client';

export const campaignsRouter = Router();

// POST /campaigns/generate
campaignsRouter.post('/generate', async (req: Request, res: Response) => {
  try {
    const payload = req.body as {
      query: string;
      audience_size: number;
      avg_spend: number;
      health_focus: string;
      recoverable_revenue: number;
    };
    const content = await generateCampaignContent(payload);
    res.json(content);
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Failed to generate campaign' });
  }
});

// POST /campaigns/predict
campaignsRouter.post('/predict', async (req: Request, res: Response) => {
  try {
    const payload = req.body as {
      channel: string;
      audience_size: number;
      avg_spend: number;
      health_focus: string;
    };
    const result = predictAI(payload);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Failed to predict outcomes' });
  }
});

// POST /campaigns/create
campaignsRouter.post('/create', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      name: string;
      goal: string;
      channel: string;
      audience_filters?: object;
      audience_size: number;
      subject_line?: string;
      message_body?: string;
      cta?: string;
      predicted_open_rate?: number;
      predicted_ctr?: number;
      predicted_conversion_rate?: number;
      prediction_confidence?: number;
    };

    const campaign = await prisma.campaign.create({
      data: {
        name: body.name,
        channel: body.channel,
        status: 'draft',
        audienceDescription: body.audience_filters ? JSON.stringify(body.audience_filters) : null,
        message: body.message_body,
        predictedOpenRate: body.predicted_open_rate,
        predictedClickRate: body.predicted_ctr,
        predictedConversionRate: body.predicted_conversion_rate,
      },
    });

    res.json({ campaign_id: campaign.id, ...campaign });
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Failed to create campaign' });
  }
});

// POST /campaigns/launch
campaignsRouter.post('/launch', async (req: Request, res: Response) => {
  try {
    const { campaign_id } = req.body as { campaign_id: string };

    const campaign = await prisma.campaign.findUnique({ where: { id: campaign_id } });
    if (!campaign) {
      res.status(404).json({ detail: 'Campaign not found' });
      return;
    }

    // Since we don't have exact JSON filters anymore, we'll just grab the first 100 at_risk customers
    const customers = await prisma.customer.findMany({
      where: { healthStatus: 'at_risk' },
      take: 100,
    });

    // We will simulate the launch by inserting CampaignEvents and creating an AnalyticsSnapshot
    let sent = 0, delivered = 0, opened = 0, clicked = 0, converted = 0;
    
    // Batch create events
    for (const customer of customers) {
      sent++;
      await prisma.campaignEvent.create({ data: { campaignId: campaign.id, customerId: customer.id, eventType: 'sent' } });
      
      const r = Math.random();
      if (r < 0.9) {
        delivered++;
        await prisma.campaignEvent.create({ data: { campaignId: campaign.id, customerId: customer.id, eventType: 'delivered' } });
        if (Math.random() < 0.45) {
          opened++;
          await prisma.campaignEvent.create({ data: { campaignId: campaign.id, customerId: customer.id, eventType: 'opened' } });
          if (Math.random() < 0.25) {
            clicked++;
            await prisma.campaignEvent.create({ data: { campaignId: campaign.id, customerId: customer.id, eventType: 'clicked' } });
            if (Math.random() < 0.35) {
              converted++;
              await prisma.campaignEvent.create({ data: { campaignId: campaign.id, customerId: customer.id, eventType: 'converted' } });
            }
          }
        }
      }
    }

    // Update campaign status
    const updated = await prisma.campaign.update({
      where: { id: campaign_id },
      data: { status: 'active' },
    });

    // Create Snapshot
    const revenueGenerated = converted * (campaign.predictedConversionRate ?? 0.03) * 1500;
    await prisma.analyticsSnapshot.create({
      data: {
        campaignId: campaign.id,
        sent,
        delivered,
        opened,
        clicked,
        converted,
        revenueGenerated
      }
    });

    res.json({
      message: `Campaign launched to ${customers.length} customers`,
      campaign_id,
      sent: customers.length,
      ...updated,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Failed to launch campaign' });
  }
});

// GET /campaigns
campaignsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        analyticsSnapshot: true,
      },
    });

    const result = campaigns.map((c) => ({
      ...c,
      sent: c.analyticsSnapshot?.sent || 0,
      created_at: c.createdAt,
      status: c.status,
      channel: c.channel,
      name: c.name,
      id: c.id
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Failed to list campaigns' });
  }
});
