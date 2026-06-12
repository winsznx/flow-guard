# Stage 1: Build
FROM --platform=linux/amd64 node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
# VITE_API_URL will be set at build time
ARG VITE_API_URL
ARG VITE_BCH_NETWORK
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BCH_NETWORK=${VITE_BCH_NETWORK:-chipnet}

RUN pnpm build

# Stage 2: Serve with nginx
FROM --platform=linux/amd64 nginx:alpine

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port (default 80, can be overridden)
EXPOSE ${FRONTEND_PORT:-80}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:${FRONTEND_PORT:-80}/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

