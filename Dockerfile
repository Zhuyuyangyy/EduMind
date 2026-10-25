# syntax=docker/dockerfile:1

FROM node:24.14.0-alpine AS web-build
WORKDIR /app

COPY package.json package-lock.json ./
COPY vendor/dgreenheck-ez-tree-1.1.0.tgz ./vendor/dgreenheck-ez-tree-1.1.0.tgz
COPY scripts/patch-secure-storage.mjs ./scripts/patch-secure-storage.mjs
RUN npm ci

COPY index.html postcss.config.js tailwind.config.js tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
COPY server ./server
COPY scripts ./scripts
RUN npm run build

FROM node:24.14.0-alpine AS api-deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY vendor/dgreenheck-ez-tree-1.1.0.tgz ./vendor/dgreenheck-ez-tree-1.1.0.tgz
COPY scripts/patch-secure-storage.mjs ./scripts/patch-secure-storage.mjs
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24.14.0-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8788

RUN addgroup -S edumind && adduser -S edumind -G edumind
COPY --from=api-deps --chown=edumind:edumind /app/node_modules ./node_modules
COPY --chown=edumind:edumind package.json ./package.json
COPY --chown=edumind:edumind server ./server

USER edumind
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8788/api/health > /dev/null || exit 1
CMD ["node", "server/index.js"]

FROM nginx:1.28.1-alpine AS web
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz > /dev/null || exit 1
