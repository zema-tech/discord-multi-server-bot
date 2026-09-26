# apps/dashboard/Dockerfile — dashboard Next.js (TypeScript) production.
# Build/run con pnpm (npm non supporta "workspace:*") o Bun.
# Uso: docker build -f apps/dashboard/Dockerfile -t bot-dashboard . && docker run -p 3000:3000 --env-file .env bot-dashboard
# Su Render/Railway/Fly: vedi render.yaml / railway.toml / fly.toml.
FROM node:24-slim AS deps

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/ui/package.json packages/ui/
COPY packages/db/package.json packages/db/
COPY packages/config/package.json packages/config/
COPY packages/typescript-config/package.json packages/typescript-config/
RUN pnpm install --no-frozen-lockfile --ignore-scripts

FROM node:24-slim AS build
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/dashboard/node_modules ./apps/dashboard/node_modules
COPY . ./
RUN pnpm --filter dashboard build

FROM node:24-slim AS run
ENV NODE_ENV=production
WORKDIR /app/apps/dashboard
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/dashboard/node_modules ./node_modules
COPY --from=build /app/apps/dashboard/.next ./.next
COPY --from=build /app/apps/dashboard/package.json ./package.json
COPY --from=build /app/apps/dashboard/next.config.ts ./next.config.ts
COPY --from=build /app/packages /app/packages
RUN chown -R node:node /app/apps/dashboard/.next /app/node_modules
# STORE_DIR di default punta a ../../src/database (solo lettura settings);
# in produzione la dashboard legge via REST + Postgres (Fase 2), niente volume.
EXPOSE 3000
USER node
# next start legge $PORT da solo; -H 0.0.0.0 per accettare connessioni esterne.
CMD ["sh", "-c", "pnpm --filter dashboard start -- -H 0.0.0.0 -p ${PORT:-3000}"]
