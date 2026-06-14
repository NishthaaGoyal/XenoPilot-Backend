FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy source code and Prisma schema
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Expose the port Railway will use
EXPOSE 8000

# Start the application using ts-node
CMD ["npm", "start"]
