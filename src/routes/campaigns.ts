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

    const customers = await prisma.customer.findMany({
      where: { healthStatus: 'at_risk' },
      take: 100,
      select: { id: true },
    });

    // Build all events in memory first, then bulk-insert in ONE DB call
    const events: { campaignId: string; customerId: string; eventType: string }[] = [];
    let sent = 0, delivered = 0, opened = 0, clicked = 0, converted = 0;

    for (const customer of customers) {
      sent++;
      events.push({ campaignId: campaign.id, customerId: customer.id, eventType: 'sent' });

      if (Math.random() < 0.9) {
        delivered++;
        events.push({ campaignId: campaign.id, customerId: customer.id, eventType: 'delivered' });
        if (Math.random() < 0.45) {
          opened++;
          events.push({ campaignId: campaign.id, customerId: customer.id, eventType: 'opened' });
          if (Math.random() < 0.25) {
            clicked++;
            events.push({ campaignId: campaign.id, customerId: customer.id, eventType: 'clicked' });
            if (Math.random() < 0.35) {
              converted++;
              events.push({ campaignId: campaign.id, customerId: customer.id, eventType: 'converted' });
            }
          }
        }
      }
    }

    // Single bulk insert + status update + snapshot — all in parallel
    const revenueGenerated = converted * (campaign.predictedConversionRate ?? 0.03) * 1500;

    await Promise.all([
      prisma.campaignEvent.createMany({ data: events, skipDuplicates: true }),
      prisma.campaign.update({ where: { id: campaign_id }, data: { status: 'active' } }),
      prisma.analyticsSnapshot.upsert({
        where: { campaignId: campaign.id },
        create: { campaignId: campaign.id, sent, delivered, opened, clicked, converted, revenueGenerated },
        update: { sent, delivered, opened, clicked, converted, revenueGenerated },
      }),
    ]);

    res.json({
      campaign_id,
      status: 'active',
      message: `Campaign launched to ${customers.length} customers`,
      sent: customers.length,
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
      include: { analyticsSnapshot: true },
    });

    const result = campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      goal: (c as any).goal || '',
      channel: c.channel,
      status: c.status,
      audience_size: c.analyticsSnapshot?.sent || 0,
      subject_line: (c as any).subjectLine || null,
      message_body: c.message || null,
      cta: (c as any).cta || null,
      predicted_open_rate: c.predictedOpenRate || null,
      predicted_ctr: c.predictedClickRate || null,
      predicted_conversion_rate: c.predictedConversionRate || null,
      prediction_confidence: null,
      sent: c.analyticsSnapshot?.sent || 0,
      created_at: c.createdAt,
      launched_at: c.status === 'active' ? c.createdAt : null,
      // keep camel case originals too in case any other consumer needs them
      analyticsSnapshot: c.analyticsSnapshot,
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Failed to list campaigns' });
  }
});
