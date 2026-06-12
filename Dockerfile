FROM --platform=linux/amd64 node:22-alpine AS base

# Install dependencies for better-sqlite3 and nginx
RUN apk add --no-cache python3 py3-setuptools make g++ sqlite-dev nginx supervisor

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm@10

# ============================================
# Backend Build Stage
# ============================================
FROM base AS backend-builder

WORKDIR /app/backend

# Copy backend package files
COPY backend/package.json backend/pnpm-lock.yaml ./

# Install backend dependencies
RUN pnpm install --frozen-lockfile

# Rebuild better-sqlite3 from source for Alpine
RUN cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npm run build-release

# Copy backend source code
COPY backend/ .

# Build TypeScript
RUN pnpm build

# ============================================
# Frontend Build Stage
# ============================================
FROM base AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package.json frontend/pnpm-lock.yaml ./

# Install frontend dependencies
RUN pnpm install --frozen-lockfile

# Copy frontend source code
COPY frontend/ .

# Build arguments for Vite
ARG VITE_API_URL=http://localhost:3001/api
ARG VITE_BCH_NETWORK=chipnet
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BCH_NETWORK=${VITE_BCH_NETWORK:-chipnet}

# Build frontend
RUN pnpm build

# ============================================
# Production Stage
# ============================================
FROM base AS production

# Copy backend build
COPY --from=backend-builder /app/backend/dist /app/backend/dist
COPY --from=backend-builder /app/backend/node_modules /app/backend/node_modules
COPY --from=backend-builder /app/backend/package.json /app/backend/package.json
COPY --from=backend-builder /app/backend/src/contracts /app/backend/dist/contracts

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Create data directory for SQLite
RUN mkdir -p /app/data

# Create supervisor config script
RUN echo '#!/bin/sh' > /usr/local/bin/start-services.sh && \
    echo 'set -e' >> /usr/local/bin/start-services.sh && \
    echo 'export NODE_ENV=${NODE_ENV:-production}' >> /usr/local/bin/start-services.sh && \
    echo 'export PORT=${PORT:-3001}' >> /usr/local/bin/start-services.sh && \
    echo 'export BCH_NETWORK=${BCH_NETWORK:-chipnet}' >> /usr/local/bin/start-services.sh && \
    echo 'export DATABASE_PATH=${DATABASE_PATH:-/app/data/flowguard.db}' >> /usr/local/bin/start-services.sh && \
    echo 'cd /app/backend && node dist/index.js &' >> /usr/local/bin/start-services.sh && \
    echo 'exec nginx -g "daemon off;"' >> /usr/local/bin/start-services.sh && \
    chmod +x /usr/local/bin/start-services.sh

# Create supervisor config
RUN echo '[supervisord]' > /etc/supervisord.conf && \
    echo 'nodaemon=true' >> /etc/supervisord.conf && \
    echo '' >> /etc/supervisord.conf && \
    echo '[program:backend]' >> /etc/supervisord.conf && \
    echo 'command=node /app/backend/dist/index.js' >> /etc/supervisord.conf && \
    echo 'directory=/app/backend' >> /etc/supervisord.conf && \
    echo 'autostart=true' >> /etc/supervisord.conf && \
    echo 'autorestart=true' >> /etc/supervisord.conf && \
    echo 'stderr_logfile=/var/log/backend.err.log' >> /etc/supervisord.conf && \
    echo 'stdout_logfile=/var/log/backend.out.log' >> /etc/supervisord.conf && \
    echo 'environment=NODE_ENV="%(ENV_NODE_ENV)s",PORT="%(ENV_PORT)s",BCH_NETWORK="%(ENV_BCH_NETWORK)s",DATABASE_PATH="%(ENV_DATABASE_PATH)s"' >> /etc/supervisord.conf && \
    echo '' >> /etc/supervisord.conf && \
    echo '[program:nginx]' >> /etc/supervisord.conf && \
    echo 'command=nginx -g "daemon off;"' >> /etc/supervisord.conf && \
    echo 'autostart=true' >> /etc/supervisord.conf && \
    echo 'autorestart=true' >> /etc/supervisord.conf && \
    echo 'stderr_logfile=/var/log/nginx.err.log' >> /etc/supervisord.conf && \
    echo 'stdout_logfile=/var/log/nginx.out.log' >> /etc/supervisord.conf

# Expose ports
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

# Start supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]

