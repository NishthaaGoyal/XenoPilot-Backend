import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

const CITIES = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow'];
const CATEGORIES = ['Electronics', 'Fashion', 'Home & Kitchen', 'Sports', 'Beauty', 'Books', 'Toys', 'Grocery', 'Jewelry', 'Automotive'];
const CHANNELS = ['email', 'whatsapp', 'sms'];
const GENDERS = ['Male', 'Female', 'Non-binary'];

function computeHealthScore(totalSpent: number, orderCount: number, daysSincePurchase: number): { score: number; status: string } {
  let score = 50;
  if (totalSpent > 5000) score += 20;
  else if (totalSpent > 2000) score += 10;
  else if (totalSpent < 500) score -= 15;

  if (orderCount > 5) score += 15;
  else if (orderCount > 2) score += 5;
  else score -= 10;

  if (daysSincePurchase < 30) score += 15;
  else if (daysSincePurchase < 90) score += 5;
  else if (daysSincePurchase > 180) score -= 20;
  else if (daysSincePurchase > 90) score -= 10;

  score = Math.max(0, Math.min(100, score + (Math.random() - 0.5) * 10));

  let status: string;
  if (score >= 65) status = 'healthy';
  else if (score >= 35) status = 'at_risk';
  else status = 'churning';

  return { score: parseFloat(score.toFixed(1)), status };
}

export async function seed(customerCount = 500): Promise<void> {
  console.log(`🌱 Seeding ${customerCount} customers...`);

  // Clear existing data (order matters due to FK constraints)
  await prisma.event.deleteMany();
  await prisma.communication.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();

  const customers = [];

  for (let i = 0; i < customerCount; i++) {
    const orderCount = faker.number.int({ min: 0, max: 12 });
    const totalSpent = orderCount * faker.number.float({ min: 200, max: 3000, fractionDigits: 2 });
    const lastPurchaseDaysAgo = faker.number.int({ min: 1, max: 365 });
    const lastPurchaseDate = new Date(Date.now() - lastPurchaseDaysAgo * 86400 * 1000);
    const { score, status } = computeHealthScore(totalSpent, orderCount, lastPurchaseDaysAgo);

    customers.push({
      name: faker.person.fullName(),
      email: faker.internet.email().toLowerCase(),
      phone: faker.phone.number(),
      city: faker.helpers.arrayElement(CITIES),
      age: faker.number.int({ min: 18, max: 65 }),
      gender: faker.helpers.arrayElement(GENDERS),
      preferred_channel: faker.helpers.arrayElement(CHANNELS),
      total_spent: parseFloat(totalSpent.toFixed(2)),
      last_purchase_date: orderCount > 0 ? lastPurchaseDate : null,
      health_score: score,
      health_status: status,
      order_count: orderCount,
      created_at: faker.date.past({ years: 2 }),
    });
  }

  // Deduplicate emails
  const seen = new Set<string>();
  const unique = customers.filter((c) => {
    if (seen.has(c.email)) return false;
    seen.add(c.email);
    return true;
  });

  // Batch insert customers
  const created = await Promise.all(
    unique.map((c) => prisma.customer.create({ data: c }))
  );

  console.log(`✅ Created ${created.length} customers`);

  // Create orders for each customer
  const orders = [];
  for (const customer of created) {
    for (let j = 0; j < customer.order_count; j++) {
      const orderDate = customer.last_purchase_date
        ? new Date(new Date(customer.last_purchase_date).getTime() - j * 30 * 86400 * 1000)
        : faker.date.past({ years: 1 });

      orders.push({
        customer_id: customer.id,
        amount: parseFloat((customer.total_spent / Math.max(customer.order_count, 1)).toFixed(2)),
        category: faker.helpers.arrayElement(CATEGORIES),
        order_date: orderDate,
      });
    }
  }

  if (orders.length > 0) {
    await prisma.order.createMany({ data: orders });
    console.log(`✅ Created ${orders.length} orders`);
  }

  console.log('🎉 Seeding complete!');
}

// Run directly if called as script
if (require.main === module) {
  seed()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
