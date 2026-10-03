# Build from the repository root: docker build -f frontend/Dockerfile .
# The context includes games/ because the Vite build copies each game's static
# frame beside the bundle. Type-checking runs in CI, so the image only bundles.
FROM node:22-slim AS build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund
COPY frontend/ .
COPY games/ /src/games/
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npx vite build

FROM caddy:2
COPY --from=build /src/frontend/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
