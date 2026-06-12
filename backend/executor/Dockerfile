FROM --platform=linux/amd64 node:22-alpine

WORKDIR /app

RUN npm install -g pnpm@10

COPY shared/package.json ./shared/package.json
COPY shared/tsconfig.json ./shared/tsconfig.json
COPY shared/ ./shared/

COPY backend/executor/package.json ./executor/package.json

RUN printf '{"name":"flowguard","private":true,"version":"0.1.0"}' > package.json
RUN printf '{"packages":["executor","shared"]}' > pnpm-workspace.yaml

WORKDIR /app/shared
RUN pnpm install --no-frozen-lockfile
RUN pnpm build

WORKDIR /app/executor
RUN pnpm install --no-frozen-lockfile

COPY backend/executor/ ./

RUN pnpm build

CMD ["node", "dist/index.js"]
