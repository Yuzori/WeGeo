# Image de déploiement de Prospy : Node 24 (requis par le module SQLite natif)
# plus Chromium et ses dépendances système, indispensables au scraping.
FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# Les dépendances d'abord : cette couche est réutilisée tant que
# package-lock.json ne change pas.
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# `tsx`, `vite` et `typescript` sont des dépendances de développement, mais la
# compilation de l'interface et l'exécution du serveur en ont besoin.
RUN npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

COPY . .
RUN npm run build

# Render fournit le port à écouter par la variable PORT.
EXPOSE 10000
CMD ["npm", "start"]
