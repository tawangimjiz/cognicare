# Build context: repo root. docker build -f apps/api/Dockerfile .
FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build -w apps/api

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
# ponytail: full node_modules kept (prisma CLI needed for migrate deploy); prune/standalone if image size matters
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
