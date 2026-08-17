#!/bin/sh
# Roda automaticamente no start (mecanismo padrão da imagem oficial do nginx:
# todo *.sh executável em /docker-entrypoint.d/ é executado antes do nginx
# subir). Gera /etc/nginx/.htpasswd a partir de ADMINER_AUTH_USER/
# ADMINER_AUTH_PASSWORD — assim a senha nunca precisa ser versionada como
# hash no Git, só como variável de ambiente no .env do servidor.
set -eu

if [ -z "${ADMINER_AUTH_USER:-}" ] || [ -z "${ADMINER_AUTH_PASSWORD:-}" ]; then
  echo "[nginx] ADMINER_AUTH_USER/ADMINER_AUTH_PASSWORD não definidos: /minha-base-de-dados ficará sempre 401." >&2
  : >/etc/nginx/.htpasswd
  exit 0
fi

printf '%s:%s\n' "$ADMINER_AUTH_USER" "$(openssl passwd -apr1 "$ADMINER_AUTH_PASSWORD")" >/etc/nginx/.htpasswd
