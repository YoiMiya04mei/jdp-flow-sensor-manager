# Multi-stage Dockerfile for JDP Flow Sensor Manager & Traffic Analyzer
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat
ENV NEXT_TELEMETRY_DISABLED=1

# Dependency installation stage
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# Build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Web Application Runner stage
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data
USER nextjs
EXPOSE 3000
CMD ["npm", "run", "start"]

# UDP Collector Daemon Runner stage
FROM base AS collector
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 collector && \
    adduser --system --uid 1001 collector
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
RUN mkdir -p /app/data && chown -R collector:collector /app/data
USER collector
EXPOSE 2055/udp 6343/udp 9995/udp
CMD ["npm", "run", "collector"]

