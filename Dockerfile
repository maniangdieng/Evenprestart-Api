FROM node:20-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3001
# Applique les migrations Prisma en attente avant de démarrer (idempotent).
# prisma/seed.ts étant compilé avec src/, la sortie est dist/src/main.js.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
