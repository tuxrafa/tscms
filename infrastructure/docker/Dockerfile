FROM node:22-bookworm AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps ./apps
COPY packages ./packages
COPY starter-kits ./starter-kits
COPY examples ./examples
COPY tsconfig.base.json tsconfig.json turbo.json vitest.config.ts ./
RUN pnpm install --frozen-lockfile
ENV VITE_BASE=/tscms/
RUN pnpm --filter @tscms/author build

FROM node:22-bookworm AS api
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate
COPY --from=build /app /app
COPY infrastructure/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV NODE_ENV=production
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]

FROM nginx:1.27-alpine AS web
COPY infrastructure/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/author/dist /usr/share/nginx/html/tscms
