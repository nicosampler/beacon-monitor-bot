FROM node:18-alpine

WORKDIR /app

# Copy necessary files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY packages/fetch ./packages/fetch

# Install pnpm
RUN npm install -g pnpm

# Install dependencies (including dev dependencies)
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN npx prisma generate

# Set working directory to the specific package
WORKDIR /app/packages/fetch

CMD ["pnpm", "start"]
