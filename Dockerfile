
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Install production dependencies from the package manifest and lockfile
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force

# Copy application source
COPY --chown=node:node . .

# Prepare persistent SQLite and upload directories
RUN mkdir -p /app/data \
    && chown -R node:node /app

# Run without root privileges
USER node

EXPOSE 3000

CMD ["npm", "start"]
