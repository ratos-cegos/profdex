# Nginx de borda: único serviço exposto à internet. TLS (certificado de
# Origem do Cloudflare) + reverse proxy para frontend/app/adminer.
#
# openssl é usado só para gerar o .htpasswd do Adminer em runtime (ver
# docker-entrypoint.d/10-generate-htpasswd.sh) — evita puxar apache2-utils
# só pelo binário `htpasswd`.
FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

COPY docker-entrypoint.d/10-generate-htpasswd.sh /docker-entrypoint.d/10-generate-htpasswd.sh
RUN chmod +x /docker-entrypoint.d/10-generate-htpasswd.sh

EXPOSE 80 443
