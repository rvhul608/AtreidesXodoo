FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --include=dev

COPY apps/api apps/api
COPY db db
COPY tsconfig.base.json ./
RUN npm run build --workspace @brightloop/api

FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /app/apps/api/dist apps/api/dist
COPY db db
COPY apps/api/docker-entrypoint.sh /usr/local/bin/brightloop-api
RUN chmod +x /usr/local/bin/brightloop-api

EXPOSE 3000

ENTRYPOINT ["brightloop-api"]
