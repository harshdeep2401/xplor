# XPLOR API (Express + Prisma), run via tsx — no compile step for MVP.
# Node 20 to match the codebase's @types/node ^20 and docs/06 Phase 1.
FROM node:20-slim

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

# Matches PORT below and docs; overridable via env.
ENV PORT=5001
EXPOSE 5001

CMD ["npm", "start"]
