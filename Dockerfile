# Sigillo: app statica servita da nginx, senza root e senza log degli accessi.
# docker run --rm -p 8080:8080 ghcr.io/francofarnedi/sigillo
FROM nginxinc/nginx-unprivileged:1.29-alpine

LABEL org.opencontainers.image.title="Sigillo" \
      org.opencontainers.image.description="Filigrana per copie di documenti d'identità, tutto nel browser, nessun upload" \
      org.opencontainers.image.source="https://github.com/francofarnedi/sigillo" \
      org.opencontainers.image.url="https://francofarnedi.github.io/sigillo/" \
      org.opencontainers.image.licenses="MIT"

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx index.html app.js style.css LICENSE /usr/share/nginx/html/
COPY --chown=nginx:nginx vendor/ /usr/share/nginx/html/vendor/

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
