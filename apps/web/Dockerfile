FROM node:22.23.4-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build && npm run build --workspace @bijux/ro-crate-web && npm prune --omit=dev

FROM node:22.23.4-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/core/package.json ./packages/core/package.json
COPY --from=build --chown=node:node /app/packages/core/dist ./packages/core/dist
COPY --from=build --chown=node:node /app/packages/creator/package.json ./packages/creator/package.json
COPY --from=build --chown=node:node /app/packages/creator/dist ./packages/creator/dist
COPY --from=build --chown=node:node /app/packages/validator/package.json ./packages/validator/package.json
COPY --from=build --chown=node:node /app/packages/validator/dist ./packages/validator/dist
COPY --from=build --chown=node:node /app/apps/web/package.json ./apps/web/package.json
COPY --from=build --chown=node:node /app/artifacts/web/dist ./artifacts/web/dist
USER node
EXPOSE 4321
CMD ["node", "artifacts/web/dist/server/entry.mjs"]
