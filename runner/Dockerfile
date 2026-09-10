# FASTPASCAL sandbox image.
#
# Contains nothing but a minimal Debian base + the real Free Pascal
# Compiler. This is the ONLY image that ever touches user-submitted Pascal
# source code, and it is always run by the backend with:
#   --rm --network none --read-only --cap-drop ALL --pids-limit ...
# (see backend/src/sandbox.js)
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      fp-compiler \
    && rm -rf /var/lib/apt/lists/*

# Non-root user the sandbox always runs as (uid/gid 1000, matched in
# backend/src/sandbox.js's `--user 1000:1000`).
RUN useradd -u 1000 -m runner

WORKDIR /workspace
