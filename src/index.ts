import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { customersRouter } from './routes/customers';
import { audiencesRouter } from './routes/audiences';
import { campaignsRouter } from './routes/campaigns';
import { analyticsRouter } from './routes/analytics';
import { recommendationsRouter } from './routes/recommendations';
import { prisma } from './lib/prisma';

const app = express();
const PORT = parseInt(process.env.PORT || '8000', 10);

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/customers', customersRouter);
app.use('/audiences', audiencesRouter);
app.use('/campaigns', campaignsRouter);
app.use('/analytics', analyticsRouter);
app.use('/recommendations', recommendationsRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'xenopilot-backend', version: '2.0.0' });
});

// ── ALWAYS start HTTP server first so Railway health checks pass ─────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 XenoPilot backend listening on 0.0.0.0:${PORT}`);
});

// ── Connect DB ───────────────────────────────────────────────────────────────
async function initDb() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to database');
  } catch (err) {
    console.error('❌ DB init error (server still running):', err);
  }
}

initDb();
