# Eye on Fat — Web image
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY db ./db
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @eof/domain build && pnpm --filter @eof/web build

FROM node:22-alpine
WORKDIR /repo
RUN corepack enable && addgroup -S eof && adduser -S eof -G eof
COPY --from=build /repo ./
USER eof
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@eof/web", "start"]
