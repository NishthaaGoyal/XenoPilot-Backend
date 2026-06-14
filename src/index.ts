import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { customersRouter } from './routes/customers';
import { audiencesRouter } from './routes/audiences';
import { campaignsRouter } from './routes/campaigns';
import { analyticsRouter } from './routes/analytics';
import { recommendationsRouter } from './routes/recommendations';
import { prisma } from './lib/prisma';
import { seed } from './seed';

const app = express();
const PORT = process.env.PORT || 8000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── Routes ──────────────────────────────────────────────────────────────────
// All routes are mounted without prefix; frontend calls /customers/stats etc.
app.use('/customers', customersRouter);
app.use('/audiences', audiencesRouter);
app.use('/campaigns', campaignsRouter);
app.use('/analytics', analyticsRouter);
app.use('/recommendations', recommendationsRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'xenopilot-backend', version: '2.0.0' });
});

// ── Startup ─────────────────────────────────────────────────────────────────
async function main() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to database');

    // Seed on startup if DB is empty or env flag is set
    if (process.env.SEED_ON_STARTUP === 'true') {
      const count = await prisma.customer.count();
      if (count === 0) {
        console.log('🌱 Empty database detected — seeding...');
        await seed();
        console.log('✅ Seeding complete');
      } else {
        console.log(`ℹ️  Database already has ${count} customers — skipping seed`);
      }
    }

    app.listen(PORT, () => {
      console.log(`🚀 XenoPilot backend running on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

main();
