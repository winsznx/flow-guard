FROM node:22-alpine

# Install dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Rebuild better-sqlite3 for Alpine Linux
RUN pnpm rebuild better-sqlite3

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm build

# Expose port
EXPOSE 8080

# Start the server
CMD ["node", "dist/index.js"]
