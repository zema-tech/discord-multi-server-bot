# discord-multi-server-bot — immagine production
# Base: node:20-slim (package.json: engines node>=18; start = "node src/index.js").
FROM node:20-slim

ENV NODE_ENV=production

WORKDIR /app

# Installa solo dipendenze di produzione (layer cachabile).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copia il codice (rispetta .dockerignore: niente .env, log, DB, node_modules).
COPY . ./

# Dir persistenti (montate come volumi in docker-compose.yml).
RUN mkdir -p /app/data /app/logs /app/backups && chown -R node:node /app

# Esegui come utente non-root (utente "node" incluso nell'immagine ufficiale).
USER node

# Porta dashboard (usata SOLO se DASHBOARD_PORT è impostato, vedi src/index.js).
EXPOSE 3000

# ---- HEALTHCHECK (scelta documentata) ----
# Il bot NON espone endpoint HTTP di default: la dashboard parte solo se
# DASHBOARD_PORT è impostato (src/index.js). Quando attiva, la dashboard
# espone GET /healthz pubblico (prima di auth/rate-limit, 200 + JSON
# {ok,uptimeSec,guilds,...}); il probe usa /healthz con fallback a /
# (coordinato con l'agente dashboard). Non richiede curl nell'immagine
# (usa node, che ha fetch globale da Node 18+):
#  - DASHBOARD_PORT non impostata -> exit 0 (liveness = container in esecuzione;
#    i crash sono coperti da `restart: unless-stopped` nel compose).
#  - DASHBOARD_PORT impostata     -> /healthz (o /) deve rispondere 2xx.
# NB: nel Dockerfile la forma shell è `CMD <comando>`; `CMD-SHELL` esiste solo
# nel campo `test:` di docker-compose e fa fallire il build (es. su Render).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const p=process.env.DASHBOARD_PORT;if(!p)process.exit(0);const u='http://127.0.0.1:'+p;fetch(u+'/healthz').then(r=>{if(r.ok)process.exit(0);return fetch(u+'/')}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Avvio: prima registra gli slash command su Discord (serve DISCORD_TOKEN + CLIENT_ID),
# poi avvia il bot. Il `;` (non `&&`) fa partire il bot anche se la registrazione
# fallisce. Utile su hosting senza shell (es. Render free).
CMD ["sh", "-c", "node deploy-commands.js; exec node src/index.js"]
