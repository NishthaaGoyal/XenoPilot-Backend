FROM node:18

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy source code and Prisma schema
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Compile TypeScript to plain JavaScript
RUN npx tsc

# Start the application using raw Node.js (fastest and most reliable)
CMD ["node", "dist/index.js"]
