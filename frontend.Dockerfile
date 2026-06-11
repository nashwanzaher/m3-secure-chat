# frontend.Dockerfile
# Multi-stage build for the React SPA. Final image is ~30 MB and runs as
# a non-root user. Use with `docker compose up` or any container host.

# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Install pnpm via corepack (ships with Node 20)
RUN corepack enable && corepack prepare pnpm@9 --activate

# Cache deps
COPY package.json pnpm-lock.yaml* ./
COPY .npmrc ./
RUN pnpm install --frozen-lockfile

# Build
COPY . .
RUN pnpm build

# ---- Runtime stage ----
FROM nginx:1.27-alpine AS runtime

# Drop default config and replace with ours
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static assets
COPY --from=build /app/dist /usr/share/nginx/html

# Run as the built-in nginx user (UID 101)
USER nginx

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
