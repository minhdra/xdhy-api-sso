# Build stage: cần devDependencies (typescript...) để biên dịch, và toolchain
# native build cho bcrypt (musl trên alpine không có prebuilt binary sẵn).
FROM node:lts-alpine AS build
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@10.30.2 --activate
WORKDIR /api-sso
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Production stage: chỉ cài dependency thật, chạy JS đã biên dịch bằng node
# thẳng - không nodemon/ts-node (dev-only, không việc gì phải tốn CPU/RAM đó
# trong container). Vẫn cần toolchain build vì bcrypt biên dịch lại native
# binding cho stage này.
FROM node:lts-alpine AS production
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@10.30.2 --activate
WORKDIR /api-sso
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /api-sso/dist ./dist
ENV NODE_OPTIONS=--max-http-header-size=10485760
ENV NODE_ENV=production
EXPOSE 6005
CMD ["pnpm", "start:prod"]
