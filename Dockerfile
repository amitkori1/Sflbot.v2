FROM node:22-bookworm-slim

# ffmpeg: stickers & audio/video tools | python3 + yt-dlp: downloaders | fonts: text stickers
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg python3 ca-certificates curl fonts-dejavu-core tini \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY . .

ENV NODE_ENV=production DATA_DIR=/data TZ=UTC
VOLUME /data
EXPOSE 3000

# yt-dlp breaks when YouTube changes; refresh it on every start (ignored if offline)
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "yt-dlp -U >/dev/null 2>&1 || true; exec node src/index.js"]
