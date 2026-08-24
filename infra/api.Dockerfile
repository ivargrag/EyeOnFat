# Eye on Fat — API image (multi-stage, non-root)
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY db ./db
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @eof/domain build && pnpm --filter @eof/model-gw build \
 && pnpm --filter @eof/agents build && pnpm --filter @eof/db build \
 && pnpm --filter @eof/api build

FROM node:22-alpine
WORKDIR /repo
RUN corepack enable && addgroup -S eof && adduser -S eof -G eof
COPY --from=build /repo ./
USER eof
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
