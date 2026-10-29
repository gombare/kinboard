# Kinboard as a Home Assistant app. The source is the tagged release matching
# the app version, so what runs is exactly what is published on GitHub.
FROM node:22-alpine

ARG BUILD_VERSION
ARG BUILD_ARCH
LABEL \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="amd64|aarch64" \
  org.opencontainers.image.source="https://github.com/gombare/kinboard"

ENV NODE_ENV=production
# A small heap keeps the server around 150 MB on a 2 GB board (the image renderer needs the rest).
ENV NODE_OPTIONS="--max-old-space-size=64 --max-semi-space-size=1"
WORKDIR /app
ADD https://github.com/gombare/kinboard/archive/refs/tags/v${BUILD_VERSION}.tar.gz /tmp/kinboard.tar.gz
RUN tar -xzf /tmp/kinboard.tar.gz --strip-components=1 \
  && rm /tmp/kinboard.tar.gz \
  && npm ci --omit=dev \
  && npm cache clean --force \
  && rm -rf docs test kindle apps-script homeassistant

CMD ["node", "scripts/ha-addon.js"]
