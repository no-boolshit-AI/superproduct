# Workspace image for Node / TypeScript / Next.js projects (built per project by dev-agent).
ARG NODE_MAJOR=22
FROM node:${NODE_MAJOR}-bookworm

ARG CLAUDE_SDK_VERSION
ARG APT_PACKAGES=""
ARG PLAYWRIGHT=0
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates curl jq ripgrep procps less unzip openssh-client ${APT_PACKAGES} \
 && rm -rf /var/lib/apt/lists/*
RUN (corepack enable || true)

COPY install-claude.sh /usr/local/bin/install-claude
RUN chmod 755 /usr/local/bin/install-claude && install-claude "${CLAUDE_SDK_VERSION}"
RUN if [ "${PLAYWRIGHT}" = "1" ]; then npx -y playwright@latest install-deps chromium && rm -rf /root/.npm; fi

RUN mkdir -p /workspace/repo /workspace/.home /workspace/.cache && chmod 1777 /workspace /workspace/.home /workspace/.cache
WORKDIR /workspace/repo
CMD ["sleep", "infinity"]
