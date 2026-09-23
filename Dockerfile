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

# Porta dashboard: in locale/compose e' DASHBOARD_PORT; su Render (Web Service)
# non si sceglie la porta, la assegna Render in $PORT, quindi il CMD sotto usa
# DASHBOARD_PORT se impostata a mano, altrimenti ricade su $PORT.
EXPOSE 3000

# ---- HEALTHCHECK (scelta documentata) ----
# Il bot (src/index.js) NON espone endpoint HTTP di suo: e' la dashboard
# (src/dashboard/index.js) ad aprire la porta. Il CMD sotto la avvia sempre
# in background accanto al bot, cosi' un Web Service (Render/Docker con porta
# pubblicata) vede sempre una porta aperta; se mancano le env OAuth
# (SESSION_SECRET/CLIENT_SECRET/BASE_URL) la dashboard esce subito e resta
# solo il bot, senza porta: healthcheck e Render in tal caso trattano il
# container come "solo bot" (vedi liveness sotto), ma su un Web Service resta
# il warning "no open ports" finche' quelle env non vengono impostate.
# Non richiede curl nell'immagine (usa node, che ha fetch globale da Node 18+):
#  - nessuna porta risolta (ne' DASHBOARD_PORT ne' PORT) -> exit 0 (liveness =
#    container in esecuzione; i crash sono coperti da `restart: unless-stopped`
#    nel compose / dal riavvio automatico di Render).
#  - porta risolta -> /healthz (o / come fallback) deve rispondere 2xx.
# NB: nel Dockerfile la forma shell e' `CMD <comando>`; `CMD-SHELL` esiste solo
# nel campo `test:` di docker-compose e fa fallire il build (es. su Render).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const p=process.env.DASHBOARD_PORT||process.env.PORT;if(!p)process.exit(0);const u='http://127.0.0.1:'+p;fetch(u+'/healthz').then(r=>{if(r.ok)process.exit(0);return fetch(u+'/')}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Avvio: prima registra gli slash command su Discord (serve DISCORD_TOKEN + CLIENT_ID;
# il `;` non `&&` fa partire comunque il bot se la registrazione fallisce, utile
# su hosting senza shell tipo Render free). Poi avvia la dashboard in background
# sulla porta DASHBOARD_PORT (se impostata a mano) o $PORT (assegnata da Render):
# se le env OAuth mancano esce da sola con log d'errore, senza fermare il bot.
# Infine il bot in foreground (exec = diventa PID 1, riceve i segnali di stop).
CMD ["sh", "-c", "node deploy-commands.js; DASHBOARD_PORT=${DASHBOARD_PORT:-$PORT} node src/dashboard/index.js & exec node src/index.js"]
