FROM node:24-bookworm-slim

ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 EMBERFALL_DATA_DIR=/data
WORKDIR /app
COPY --chown=node:node package.json index.html server.mjs ./
COPY --chown=node:node server ./server
COPY --chown=node:node src ./src
COPY --chown=node:node assets ./assets
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dedicated.mjs"]
