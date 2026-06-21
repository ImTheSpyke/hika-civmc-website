# 1) build web
FROM node:22-alpine AS web
WORKDIR /app
COPY packages/web/package*.json ./packages/web/
RUN cd packages/web && npm install --prefer-offline
COPY packages/web ./packages/web
RUN cd packages/web && npm run build

# 2) build server
FROM node:22-alpine AS server
WORKDIR /app
COPY packages/server/package*.json ./packages/server/
RUN cd packages/server && npm install --prefer-offline
COPY packages/server ./packages/server
RUN cd packages/server && npm run build

# 3) runtime
FROM node:22-alpine
WORKDIR /app
COPY --from=server /app/packages/server/dist ./dist
COPY --from=server /app/packages/server/node_modules ./node_modules
COPY --from=server /app/packages/server/src/migrations ./dist/migrations
COPY --from=web    /app/packages/web/dist ./public
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
