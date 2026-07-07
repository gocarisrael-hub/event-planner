# Event Planner — production image for Railway.
# Uses Puppeteer's OWN bundled Chrome (downloaded at build time) rather than the
# Debian system Chromium, which would not launch in this container (killed at
# startup: "Failed to launch the browser process: Code: null"). The apt packages
# below provide Chrome's shared-library dependencies plus Hebrew-capable fonts so
# the Hebrew proposal PDFs render correctly.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PUPPETEER_CACHE_DIR=/root/.cache/puppeteer

# Chrome runtime libraries + fonts. We install the `chromium` package purely to
# pull in the full set of shared libraries Chrome needs (we don't run this binary
# — Puppeteer runs its own bundled Chrome). fonts-freefont-ttf provides Hebrew
# glyphs (FreeSans/FreeSerif); fonts-noto-core adds broad Unicode coverage.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-freefont-ttf \
    fonts-noto-core \
    fonts-liberation \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
  && fc-cache -f \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install all workspace deps. NODE_ENV=production would skip the client's build
# tooling (vite lives in devDependencies), so install with dev deps included.
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm install --include=dev \
 && npx puppeteer browsers install chrome

# Copy the rest of the repo and build the client.
COPY . .
RUN npm run build

EXPOSE 4001

# Root "start" runs the server (npm run start -w server), which also serves
# the built client from client/dist.
CMD ["npm", "start"]
