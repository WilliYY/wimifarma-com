FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build
RUN npm prune --omit=dev
RUN mkdir -p public/assets public/uploads/funcionarios public/uploads/adm

ENV NODE_ENV=production
CMD ["npm", "start"]
