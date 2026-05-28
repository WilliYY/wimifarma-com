FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev
RUN mkdir -p public

ENV NODE_ENV=production

EXPOSE 3700

CMD ["node", "dist/server.js"]
