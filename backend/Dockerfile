FROM --platform=linux/amd64 node:22-alpine

# Install dependencies for better-sqlite3
RUN apk add --no-cache python3 py3-setuptools make g++ sqlite-dev

WORKDIR /app

# Copy root manifest files
COPY package.json pnpm-lock.yaml ./

# Copy contracts package and sources (needed for artifacts)
COPY contracts/package.json contracts/pnpm-lock.yaml ./contracts/
COPY contracts/core ./contracts/core
COPY contracts/lib ./contracts/lib
COPY contracts/README.md ./contracts/README.md

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Install and build contracts to produce artifacts
RUN pnpm --dir ./contracts install --frozen-lockfile
RUN pnpm --dir ./contracts build

# Rebuild better-sqlite3 from source for Alpine (for SQLite fallback)
RUN cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npm run build-release

# Copy backend source code
COPY backend/package.json backend/pnpm-lock.yaml ./
COPY backend/tsconfig.json ./tsconfig.json
COPY backend/src ./src
COPY backend/.env.example ./.env.example

# Copy built contract artifacts into backend image for runtime
COPY contracts/artifacts ./contracts/artifacts

# Build TypeScript
RUN pnpm build

# Point ContractFactory to baked artifacts
ENV ARTIFACTS_ROOT=/app/contracts/artifacts

# Expose port (use PORT env var, default to 3001)
EXPOSE ${PORT:-3001}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT:-3001}/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server
CMD ["node", "dist/index.js"]
