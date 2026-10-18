# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG GIT_SHA=dev
# Dokploy passes no commit hash: fall back to a hash of the sources so every deploy gets a new app version
RUN SHA="$GIT_SHA"; \
    if [ "$SHA" = dev ]; then SHA=$(find client server shared package-lock.json -type f -not -path '*/node_modules/*' | sort | xargs sha256sum | sha256sum | cut -c1-7); fi; \
    GIT_SHA=$SHA npm run build && GIT_SHA=$SHA npm test && echo "$SHA" > dist/build-sha

FROM node:24-alpine
LABEL org.opencontainers.image.title="BenchBet" \
      org.opencontainers.image.description="A betting game for friends on AI models, benchmarks and the next big release." \
      org.opencontainers.image.url="https://bet.logge.top" \
      org.opencontainers.image.source="https://github.com/LoggeL/benchbet" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 DATA_DIR=/app/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.ts"]
