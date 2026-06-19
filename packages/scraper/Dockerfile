FROM oven/bun:1.3-alpine

WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/scraper/package.json packages/scraper/package.json

RUN bun install --frozen-lockfile

COPY packages/core packages/core
COPY packages/scraper packages/scraper

WORKDIR /app/packages/scraper

CMD ["bun", "run", "start"]
