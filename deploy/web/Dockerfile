# syntax=docker/dockerfile:1
#
# The knowledge portal's browser app behind nginx, under its base path
# (KNOWLEDGE_BASE_PATH: /knowledge/ by default, / on its own hostname).
# Build from the repository root: docker build -f deploy/web/Dockerfile .
# The page's Content-Security-Policy must name the deployment's OIDC issuer. The
# published image cannot know it, so it is built with a placeholder and the
# container's CSP_IDENTITY_ORIGINS fills it in at start-up (default.conf.template).
# Building with CSP_IDENTITY_ORIGINS set to real origins bakes them in instead.

FROM node:26-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY contracts/ ../contracts/
ARG VITE_API_BASE=/knowledge-api
# The path the app is served under (requirement-portal ADR-0104): /knowledge/ by
# default, or / at the root of the portal's own hostname.
ARG KNOWLEDGE_BASE_PATH=/knowledge/
ARG CSP_IDENTITY_ORIGINS=runtime
# "true" builds the catalogue redesign lab in (a local image only); published images leave it out.
ARG VITE_CATALOGUE_LAB=false
ENV VITE_API_BASE=$VITE_API_BASE \
    KNOWLEDGE_BASE_PATH=$KNOWLEDGE_BASE_PATH \
    CSP_IDENTITY_ORIGINS=$CSP_IDENTITY_ORIGINS \
    VITE_CATALOGUE_LAB=$VITE_CATALOGUE_LAB
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e
# Take Alpine security fixes at build time, then drop back to the unprivileged user.
USER root
RUN apk upgrade --no-cache
# Rendered into conf.d at start-up with the container's environment; give the
# container a writable /etc/nginx/conf.d (a tmpfs) when its root is read-only.
# The base path is the build's, written in here, as the app was built for it.
ARG KNOWLEDGE_BASE_PATH=/knowledge/
COPY deploy/web/default.conf.template /etc/nginx/templates/default.conf.template
RUN template=/etc/nginx/templates/default.conf.template \
    && segments=$(printf '%s' "$KNOWLEDGE_BASE_PATH" | sed -e 's#^/*##' -e 's#/*$##') \
    && if [ -z "$segments" ]; then base=/; sed -i '/# not at the root/d' "$template"; \
       else base="/$segments/"; fi \
    && sed -i -e "s#__BASE_BARE__#${base%/}#g" -e "s#__BASE__#$base#g" "$template" \
    && ! grep -q '__BASE' "$template"
USER 101
COPY deploy/web/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
# Where requirement work is (requirement-portal ADR-0104): the platform's root by
# default, an absolute URL when it has its own host, or empty to leave out every
# link to it. Filled into each page at start-up.
ENV CSP_IDENTITY_ORIGINS="" \
    REQUIREMENT_PORTAL_URL="/"
EXPOSE 8080
