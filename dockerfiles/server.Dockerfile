# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.25.0 --activate

FROM base AS pruner
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN pnpm add -g turbo
WORKDIR /app
COPY . .
RUN turbo prune @radix-vaults/server --docker

FROM base AS deps
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/ .
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
RUN pnpm --filter @radix-vaults/server build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 server
COPY --from=builder --chown=server:nodejs /app/apps/server/dist ./apps/server/dist
COPY --from=builder --chown=server:nodejs /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder --chown=server:nodejs /app/packages ./packages
COPY --from=builder --chown=server:nodejs /app/node_modules ./node_modules
USER server
CMD ["node", "apps/server/dist/main.mjs"]
