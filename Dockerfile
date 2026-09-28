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
# Le CLI Prisma (devDependency) sert à `migrate deploy` au démarrage : on
# l'installe explicitement, à la version épinglée du package.json, sinon
# `npx prisma` téléchargerait la dernière version (7/8, incompatible).
RUN npm ci --omit=dev \
 && npm install --no-save "prisma@$(node -p "require('./package.json').devDependencies.prisma")"
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
# Scripts d'administration (ex. npm run admin:create) exécutables en production.
COPY --from=builder /usr/src/app/scripts ./scripts
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3001
# Applique les migrations Prisma en attente avant de démarrer (idempotent).
CMD ["sh", "-c", "if [ -z \"$DATABASE_URL\" ]; then echo 'ERREUR : la variable DATABASE_URL est absente. Sur Render : service API > Environment > DATABASE_URL = Internal Database URL de la base PostgreSQL.' >&2; exit 1; fi; npx --no-install prisma migrate deploy && node dist/main"]
