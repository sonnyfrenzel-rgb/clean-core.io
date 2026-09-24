# The isolated test runner (roadmap 8.9). Built from the repository root:
#   docker build -f runner/Dockerfile .
# `runner/Dockerfile.dockerignore` admits exactly the files copied below, so the
# build context holds no app code, no .env and no secrets to begin with.

FROM node:22-slim AS build
WORKDIR /build/runner
COPY runner/package.json runner/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
WORKDIR /build
COPY runner/server.ts runner/relay.ts runner/
COPY lib/test-sandbox/ lib/test-sandbox/
COPY lib/sandbox-module-guard.ts lib/test-verdicts.ts lib/google-id-token.ts lib/
# One file: the server, the relay and the shared execution core. esbuild stays
# external — the core loads it at run time to bundle the generated code.
RUN runner/node_modules/.bin/esbuild runner/server.ts --bundle --platform=node --format=cjs \
      --target=node22 --external:esbuild --outfile=/out/server.cjs

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /srv
COPY --from=build /build/runner/node_modules ./node_modules
COPY --from=build /out/server.cjs ./server.cjs
# Not root. The runs write only below the system temp directory.
USER node
EXPOSE 8080
CMD ["node", "server.cjs"]
