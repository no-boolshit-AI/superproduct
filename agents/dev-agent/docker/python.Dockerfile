# Workspace image for Python / Django / FastAPI projects (built per project by dev-agent).
ARG PYTHON_VERSION=3.13
ARG NODE_MAJOR=22
FROM node:${NODE_MAJOR}-bookworm-slim AS node
FROM ghcr.io/astral-sh/uv:latest AS uv
FROM python:${PYTHON_VERSION}-bookworm

ARG CLAUDE_SDK_VERSION
ARG APT_PACKAGES=""
ARG PLAYWRIGHT=0
ENV DEBIAN_FRONTEND=noninteractive \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_ROOT_USER_ACTION=ignore \
    UV_LINK_MODE=copy \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates curl jq ripgrep procps less unzip openssh-client libpq-dev default-libmysqlclient-dev pkg-config sqlite3 ${APT_PACKAGES} \
 && rm -rf /var/lib/apt/lists/*
COPY --from=uv /uv /uvx /usr/local/bin/

# Node.js for front-end tooling and npx-based MCP servers
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -sf ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && if [ -f /usr/local/lib/node_modules/corepack/dist/corepack.js ]; then \
      ln -sf ../lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack && corepack enable; fi \
 && node --version

COPY install-claude.sh /usr/local/bin/install-claude
RUN chmod 755 /usr/local/bin/install-claude && install-claude "${CLAUDE_SDK_VERSION}"
RUN if [ "${PLAYWRIGHT}" = "1" ]; then npx -y playwright@latest install-deps chromium && rm -rf /root/.npm; fi

RUN mkdir -p /workspace/repo /workspace/.home /workspace/.cache && chmod 1777 /workspace /workspace/.home /workspace/.cache
WORKDIR /workspace/repo
CMD ["sleep", "infinity"]
