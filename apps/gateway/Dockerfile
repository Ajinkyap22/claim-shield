FROM node:20-slim

WORKDIR /workspace

COPY apps/shared-ts/ /workspace/shared-ts/
RUN cd /workspace/shared-ts && npm install && npm run build

WORKDIR /workspace/gateway
COPY apps/gateway/package.json apps/gateway/tsconfig.json ./
RUN npm install

COPY apps/gateway/ ./
RUN npm run build

CMD ["node", "dist/index.js"]
