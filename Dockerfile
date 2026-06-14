FROM node:18-alpine
WORKDIR /app

# Install dependencies and generate Prisma client properly
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install
RUN npx prisma generate

# Copy application source and build
COPY . .
RUN npx tsc

# Start the application
CMD ["node", "dist/index.js"]
