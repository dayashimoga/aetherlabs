# Hardened Multi-Stage Rootless Dockerfile for KubeLabs
FROM node:25-alpine AS production

WORKDIR /app

# Create non-root user and group (UID/GID 10001)
RUN addgroup -g 10001 -S kubelabs && \
    adduser -u 10001 -S kubelabs -G kubelabs && \
    mkdir -p /app/data && \
    chown -R kubelabs:kubelabs /app

COPY --chown=kubelabs:kubelabs package.json README.md ./
COPY --chown=kubelabs:kubelabs schemas ./schemas
COPY --chown=kubelabs:kubelabs plugins ./plugins
COPY --chown=kubelabs:kubelabs src ./src
COPY --chown=kubelabs:kubelabs public ./public
COPY --chown=kubelabs:kubelabs docs ./docs
COPY --chown=kubelabs:kubelabs agents ./agents
COPY --chown=kubelabs:kubelabs scripts ./scripts

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4100

USER 10001:10001
EXPOSE 4100

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4100/api/health || exit 1

CMD ["node", "src/server.js"]

