# syntax=docker/dockerfile:1
# Multi-stage build: `tools` keeps dev dependencies for migrations/seeding; `runner` is the slim app image.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS tools
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 STORAGE_DIR=/data/storage
RUN addgroup -S orbit && adduser -S orbit -G orbit && mkdir -p /data/storage && chown -R orbit:orbit /data
COPY --from=tools --chown=orbit:orbit /app/.next/standalone ./
COPY --from=tools --chown=orbit:orbit /app/.next/static ./.next/static
USER orbit
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
