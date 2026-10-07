FROM node:24-bookworm-slim AS base
# npm comes with the image: upgrade it by bumping the Node base image, not inside containers.
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS manifests
WORKDIR /app
ENV NG_CLI_ANALYTICS=false
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/store/package.json apps/store/
COPY packages/contracts/package.json packages/contracts/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/themes/package.json packages/themes/
COPY packages/ui/package.json packages/ui/

FROM manifests AS dependencies
# procps: nest start --watch mata el proceso anterior con tree-kill, que necesita ps.
RUN apt-get update && apt-get install -y --no-install-recommends procps && rm -rf /var/lib/apt/lists/*
RUN npm ci --no-audit --no-fund

FROM dependencies AS api-build
COPY . .
RUN npm run prisma:generate && npm run build:api

FROM api-build AS migrate
WORKDIR /app/apps/api
CMD ["npx", "prisma", "migrate", "deploy"]

FROM manifests AS api-dependencies
RUN npm ci --omit=dev --workspace=@vendedoria/api --no-audit --no-fund
COPY --from=api-build /app/node_modules/.prisma ./node_modules/.prisma

FROM base AS api
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=api-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=api-build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=api-build --chown=node:node /app/apps/api/data/ubigeos.json ./apps/api/data/ubigeos.json
COPY --from=api-build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=api-build --chown=node:node /app/packages/themes ./packages/themes
RUN mkdir -p /app/apps/api/uploads && chown node:node /app/apps/api/uploads
WORKDIR /app/apps/api
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM dependencies AS web-build
COPY . .
RUN npm run build:web

FROM base AS web
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=web-build --chown=node:node /app/apps/web/dist/web ./dist/web
USER node
EXPOSE 4000
CMD ["node", "dist/web/server/server.mjs"]

FROM dependencies AS store-build
COPY . .
RUN npm run build:store

FROM base AS store
ENV NODE_ENV=production PORT=4300
WORKDIR /app
COPY --from=store-build --chown=node:node /app/apps/store/dist/store ./dist/store
USER node
EXPOSE 4300
CMD ["node", "dist/store/server/server.mjs"]