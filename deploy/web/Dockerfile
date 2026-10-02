# syntax=docker/dockerfile:1
#
# The knowledge portal's browser app behind nginx, under /knowledge/.
# Build from the repository root: docker build -f deploy/web/Dockerfile .
# The page's Content-Security-Policy must name the deployment's OIDC issuer. The
# published image cannot know it, so it is built with a placeholder and the
# container's CSP_IDENTITY_ORIGINS fills it in at start-up (default.conf.template).
# Building with CSP_IDENTITY_ORIGINS set to real origins bakes them in instead.

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY contracts/ ../contracts/
ARG VITE_API_BASE=/knowledge-api
ARG CSP_IDENTITY_ORIGINS=runtime
ENV VITE_API_BASE=$VITE_API_BASE \
    CSP_IDENTITY_ORIGINS=$CSP_IDENTITY_ORIGINS
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:26b0bf6fbf07297983cb341998d79c831508787de26627dd2a112321b9c3a4af
# Take Alpine security fixes at build time, then drop back to the unprivileged user.
USER root
RUN apk upgrade --no-cache
USER 101
# Rendered into conf.d at start-up with the container's environment; give the
# container a writable /etc/nginx/conf.d (a tmpfs) when its root is read-only.
COPY deploy/web/default.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/web/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
ENV CSP_IDENTITY_ORIGINS=""
EXPOSE 8080
