# auth.nymphilia.com. CI builds this for each push of main and hands it to the server, where
# deploy/site/image starts it as nymphilia/auth:live; see deploy/README.md.
FROM node:24.22.3-alpine3.24@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5

WORKDIR /app
ENV NODE_ENV=production \
    # node:sqlite still calls itself experimental, once per start.
    NODE_OPTIONS=--disable-warning=ExperimentalWarning \
    AUTH_DATA=/data \
    PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
COPY public ./public

# The node user is uid 1000, which owns /srv/auth/data on the server.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --start-interval=1s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "src/main.ts"]
