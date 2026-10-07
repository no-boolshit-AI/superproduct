# Workspace image for PHP / Laravel projects (built per project by dev-agent, see src/workspace/image.ts).
# Build args come from the project profile: PHP/Node versions, extra PHP extensions and apt packages.
ARG PHP_VERSION=8.4
ARG NODE_MAJOR=22
FROM node:${NODE_MAJOR}-bookworm-slim AS node
FROM composer:2 AS composer
FROM mlocati/php-extension-installer:latest AS phpext
FROM php:${PHP_VERSION}-cli-bookworm

ARG CLAUDE_SDK_VERSION
ARG PHP_EXTENSIONS="bcmath exif gd intl pcntl pdo_mysql pdo_pgsql redis zip"
ARG APT_PACKAGES=""
ARG PLAYWRIGHT=0
ENV DEBIAN_FRONTEND=noninteractive \
    COMPOSER_ALLOW_SUPERUSER=1 \
    COMPOSER_NO_INTERACTION=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends git unzip zip curl ca-certificates sqlite3 jq ripgrep procps less openssh-client default-mysql-client postgresql-client ${APT_PACKAGES} \
 && rm -rf /var/lib/apt/lists/*
COPY --from=phpext /usr/bin/install-php-extensions /usr/local/bin/
RUN install-php-extensions ${PHP_EXTENSIONS} \
 && printf 'memory_limit=1G\n' > /usr/local/etc/php/conf.d/zz-dev-agent.ini
COPY --from=composer /usr/bin/composer /usr/local/bin/composer

# Node.js for Vite/Inertia builds and npx-based MCP servers
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -sf ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && if [ -f /usr/local/lib/node_modules/corepack/dist/corepack.js ]; then \
      ln -sf ../lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack && corepack enable; fi \
 && node --version && npm --version

COPY install-claude.sh /usr/local/bin/install-claude
RUN chmod 755 /usr/local/bin/install-claude && install-claude "${CLAUDE_SDK_VERSION}"
RUN if [ "${PLAYWRIGHT}" = "1" ]; then npx -y playwright@latest install-deps chromium && rm -rf /root/.npm; fi

RUN mkdir -p /workspace/repo /workspace/.home /workspace/.cache && chmod 1777 /workspace /workspace/.home /workspace/.cache
WORKDIR /workspace/repo
CMD ["sleep", "infinity"]
