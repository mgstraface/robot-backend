FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src

ENV NODE_ENV=production
ENV PORT=4100
EXPOSE 4100

USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://127.0.0.1:4100/api/health || exit 1

CMD ["node", "src/index.js"]
