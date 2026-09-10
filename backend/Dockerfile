FROM node:20-slim

# The backend container itself never compiles/runs Pascal code directly.
# It only orchestrates sandboxed `docker run` calls against the separate
# "fastpascal-runner" image (see /runner/Dockerfile). For that it needs the
# docker CLI and access to the host's docker socket (mounted via compose).
RUN apt-get update && apt-get install -y --no-install-recommends \
      docker.io ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src

ENV PORT=4000
EXPOSE 4000
CMD ["node", "src/server.js"]
