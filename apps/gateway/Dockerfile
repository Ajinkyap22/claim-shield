FROM node:20-slim

WORKDIR /workspace

COPY apps/shared-ts/ /workspace/shared-ts/
RUN cd /workspace/shared-ts && npm install && npm run build

WORKDIR /workspace/gateway
COPY apps/gateway/package.json apps/gateway/tsconfig.json ./
RUN npm install

COPY apps/gateway/src/ ./src/
COPY apps/gateway/fixtures/ ./fixtures/
RUN npm run build

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD node -e "require('http').get('http://localhost:8000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
