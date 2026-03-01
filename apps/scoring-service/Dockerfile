FROM node:20-slim

WORKDIR /workspace

# 1. Build shared-ts (required by @compliance-shield/shared file: reference)
COPY apps/shared-ts/ ./shared-ts/
RUN cd shared-ts && npm install && npm run build

# 2. Install scoring-service deps
WORKDIR /workspace/scoring-service
COPY apps/scoring-service/package.json apps/scoring-service/tsconfig.json ./
RUN npm install

# 3. Compile TypeScript
COPY apps/scoring-service/src/ ./src/
RUN npm run build

EXPOSE 8004

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD node -e "require('http').get('http://localhost:8004/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
