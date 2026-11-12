# XPLOR API (Express + Prisma), run via tsx — no compile step for MVP.
# Node 22 LTS, matching CI and @types/node.
FROM node:22-slim

# Prisma's query engine needs OpenSSL at runtime on slim images.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for layer caching. The Prisma schema must be present
# before `npm ci` because package.json's postinstall runs `prisma generate`,
# which reads prisma/schema.prisma. (generate needs the schema, not a live DB.)
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# App source (tsx runs the .ts entrypoint directly — see package.json "start").
COPY . .

# Shared JSON-Schema contracts, from the compose `contracts` build context.
# validate.ts resolves them three levels above services/converter → /contracts.
# Standalone: docker build --build-context contracts=./contracts server
COPY --from=contracts . /contracts

# The image is what gets deployed: production rules apply (strong secrets
# required, error details hidden, JSON logs). Local compose overrides this.
ENV NODE_ENV=production
# Matches PORT below and docs; overridable via env.
ENV PORT=5001
EXPOSE 5001

CMD ["npm", "start"]
