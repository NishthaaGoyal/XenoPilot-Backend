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
        goal: body.goal,
        channel: body.channel,
        status: 'draft',
        audience_filters: body.audience_filters != null ? (body.audience_filters as Prisma.InputJsonValue) : Prisma.JsonNull,
        audience_size: body.audience_size ?? 0,
        subject_line: body.subject_line,
        message_body: body.message_body,
        cta: body.cta,
        predicted_open_rate: body.predicted_open_rate,
        predicted_ctr: body.predicted_ctr,
        predicted_conversion_rate: body.predicted_conversion_rate,
        prediction_confidence: body.prediction_confidence,
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

    // Get audience from filters
    const filters = campaign.audience_filters as Record<string, string | number> | null;
    const where: Record<string, unknown> = {};
    if (filters) {
      if (filters.health_status) where.health_status = filters.health_status;
      if (filters.preferred_channel) where.preferred_channel = filters.preferred_channel;
    }

    const customers = await prisma.customer.findMany({
      where,
      take: campaign.audience_size || 100,
    });

    // Create communications + events in bulk
    const statuses = ['delivered', 'opened', 'clicked', 'failed'];
    const weights = [0.15, 0.45, 0.25, 0.15]; // probability distribution

    function pickStatus(): string {
      const r = Math.random();
      let acc = 0;
      for (let i = 0; i < weights.length; i++) {
        acc += weights[i];
        if (r < acc) return statuses[i];
      }
      return 'delivered';
    }

    // Batch create communications
    for (const customer of customers) {
      const status = pickStatus();
      const comm = await prisma.communication.create({
        data: {
          campaign_id: campaign.id,
          customer_id: customer.id,
          message: (campaign.message_body || 'Hello {{name}}').replace('{{name}}', customer.name),
          channel: campaign.channel,
          status,
        },
      });

      // Create events based on status
      const eventTypes: string[] = ['sent'];
      if (['delivered', 'opened', 'clicked'].includes(status)) eventTypes.push('delivered');
      if (['opened', 'clicked'].includes(status)) eventTypes.push('opened');
      if (status === 'clicked') eventTypes.push('clicked');

      for (const eventType of eventTypes) {
        await prisma.event.create({
          data: { communication_id: comm.id, event_type: eventType },
        });
      }
    }

    // Update campaign status
    const updated = await prisma.campaign.update({
      where: { id: campaign_id },
      data: { status: 'active', launched_at: new Date() },
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
      orderBy: { created_at: 'desc' },
      include: {
        _count: { select: { communications: true } },
      },
    });

    const result = campaigns.map((c) => ({
      ...c,
      sent: c._count.communications,
      _count: undefined,
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ detail: 'Failed to list campaigns' });
  }
});
