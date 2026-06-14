import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clear existing data
  await prisma.campaignEvent.deleteMany();
  await prisma.analyticsSnapshot.deleteMany();
  await prisma.order.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.customer.deleteMany();

  // 1. Create 500 Customers
  const customersData = Array.from({ length: 500 }).map(() => ({
    name: faker.person.fullName(),
    email: faker.internet.email(),
    phone: faker.phone.number(),
    city: faker.location.city(),
    healthStatus: faker.helpers.arrayElement(['healthy', 'at_risk', 'churned']),
    preferredChannel: faker.helpers.arrayElement(['email', 'sms', 'push']),
    totalSpend: 0, // will calculate later
  }));

  console.log('Inserting Customers...');
  await prisma.customer.createMany({ data: customersData });
  const allCustomers = await prisma.customer.findMany();

  // 2. Create 2000+ Orders
  console.log('Inserting Orders...');
  const orderCategories = ['Electronics', 'Clothing', 'Home', 'Beauty', 'Sports'];
  
  for (const customer of allCustomers) {
    // Give each customer 2 to 6 orders
    const numOrders = faker.number.int({ min: 2, max: 6 });
    const orders = [];
    let totalSpend = 0;
    let lastPurchaseDate = new Date(0);

    for (let i = 0; i < numOrders; i++) {
      const amount = faker.number.float({ min: 20, max: 500, fractionDigits: 2 });
      const orderDate = faker.date.past({ years: 1 });
      
      if (orderDate > lastPurchaseDate) lastPurchaseDate = orderDate;
      totalSpend += amount;

      orders.push({
        customerId: customer.id,
        amount,
        category: faker.helpers.arrayElement(orderCategories),
        orderDate,
      });
    }

    await prisma.order.createMany({ data: orders });
    await prisma.customer.update({
      where: { id: customer.id },
      data: { totalSpend, lastPurchaseDate }
    });
  }

  // 3. Create Campaigns
  console.log('Inserting Campaigns & Analytics...');
  const campaignsToCreate = [
    { name: 'Summer Sale Blast', channel: 'email', predictedOpenRate: 0.35, predictedClickRate: 0.12, predictedConversionRate: 0.04 },
    { name: 'Win-Back At-Risk Users', channel: 'sms', predictedOpenRate: 0.85, predictedClickRate: 0.22, predictedConversionRate: 0.08 },
    { name: 'VIP Exclusive Preview', channel: 'email', predictedOpenRate: 0.55, predictedClickRate: 0.25, predictedConversionRate: 0.10 },
  ];

  for (const c of campaignsToCreate) {
    const campaign = await prisma.campaign.create({
      data: {
        name: c.name,
        channel: c.channel,
        status: 'active',
        message: 'Hello, check out our latest offers!',
        predictedOpenRate: c.predictedOpenRate,
        predictedClickRate: c.predictedClickRate,
        predictedConversionRate: c.predictedConversionRate,
      }
    });

    // Simulate sending to a subset of customers
    const audience = faker.helpers.arrayElements(allCustomers, faker.number.int({ min: 200, max: 400 }));
    let sent = 0, delivered = 0, opened = 0, clicked = 0, converted = 0;

    for (const user of audience) {
      sent++;
      await prisma.campaignEvent.create({ data: { campaignId: campaign.id, customerId: user.id, eventType: 'sent', timestamp: faker.date.recent({ days: 7 }) } });
      
      if (Math.random() < 0.95) {
        delivered++;
        await prisma.campaignEvent.create({ data: { campaignId: campaign.id, customerId: user.id, eventType: 'delivered', timestamp: faker.date.recent({ days: 7 }) } });
        
        if (Math.random() < c.predictedOpenRate) {
          opened++;
          await prisma.campaignEvent.create({ data: { campaignId: campaign.id, customerId: user.id, eventType: 'opened', timestamp: faker.date.recent({ days: 7 }) } });
          
          if (Math.random() < c.predictedClickRate) {
            clicked++;
            await prisma.campaignEvent.create({ data: { campaignId: campaign.id, customerId: user.id, eventType: 'clicked', timestamp: faker.date.recent({ days: 7 }) } });
            
            if (Math.random() < c.predictedConversionRate) {
              converted++;
              await prisma.campaignEvent.create({ data: { campaignId: campaign.id, customerId: user.id, eventType: 'converted', timestamp: faker.date.recent({ days: 7 }) } });
            }
          }
        }
      }
    }

    // Create AnalyticsSnapshot
    await prisma.analyticsSnapshot.create({
      data: {
        campaignId: campaign.id,
        sent,
        delivered,
        opened,
        clicked,
        converted,
        revenueGenerated: converted * faker.number.int({ min: 50, max: 200 })
      }
    });
  }

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
