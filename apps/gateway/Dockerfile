FROM node:20-slim

WORKDIR /app

COPY apps/shared-ts/ /app/shared-ts/
RUN cd /app/shared-ts && npm install && npm run build

COPY apps/gateway/package.json apps/gateway/tsconfig.json /app/
RUN npm install

COPY apps/gateway/ /app/
RUN npm run build

CMD ["node", "dist/index.js"]
