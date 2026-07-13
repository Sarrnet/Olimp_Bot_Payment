FROM node:22-bookworm-slim

WORKDIR /app

# Add environment variables for Prisma generation during build
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

# Install dependencies first
COPY package*.json ./
RUN npm ci

COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build the project (also copies generated Prisma client and locales into dist)
RUN npm run build

# Make start script executable
RUN chmod +x start.sh

# Start using the script to handle migrations
CMD ["./start.sh"]
