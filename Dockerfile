FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY dist/ dist/
COPY drizzle/ drizzle/
COPY scripts/build-worker.mjs scripts/
COPY worker/ worker/
COPY server/ server/
RUN npm run build
ENV NODE_ENV=production
CMD ["npm", "start"]
