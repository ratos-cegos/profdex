#!/usr/bin/env bash
# Deploy do backend na instância AWS: git pull + docker compose up --build.
# Rode a partir da sua máquina: ./scripts/deploy-aws.sh
#
# Preencha as variáveis abaixo uma vez (ou exporte DEPLOY_SSH_HOST /
# DEPLOY_SSH_KEY / DEPLOY_REPO_PATH antes de chamar o script).
set -euo pipefail

SSH_USER="${DEPLOY_SSH_USER:-ubuntu}"
SSH_HOST="${DEPLOY_SSH_HOST:-}"          # ex: 54.210.12.34
SSH_KEY="${DEPLOY_SSH_KEY:-}"            # ex: ~/.ssh/profdex-aws.pem
REMOTE_REPO_PATH="${DEPLOY_REPO_PATH:-}" # ex: /home/ubuntu/profdex

if [[ -z "$SSH_HOST" || -z "$SSH_KEY" || -z "$REMOTE_REPO_PATH" ]]; then
  echo "Preencha SSH_HOST, SSH_KEY e REMOTE_REPO_PATH no topo deste script" >&2
  echo "(ou exporte DEPLOY_SSH_HOST / DEPLOY_SSH_KEY / DEPLOY_REPO_PATH)." >&2
  exit 1
fi

SSH_TARGET="${SSH_USER}@${SSH_HOST}"

echo "==> ${SSH_TARGET}: git pull em ${REMOTE_REPO_PATH}"

# O docker-compose.yml (stack completa: frontend + backend + Postgres +
# Adminer + nginx) vive na raiz do repo desde a migração para domínio único —
# ver docker-compose.yml. O `.env` também fica na raiz e NÃO é tocado pelo
# `git pull` (está fora do controle de versão).
ssh -i "$SSH_KEY" "$SSH_TARGET" bash -s <<EOF
set -euo pipefail
cd "$REMOTE_REPO_PATH"
git pull --ff-only

echo "--> subindo containers (build + up -d)"
docker compose up -d --build

echo "--> status"
docker compose ps
EOF

echo "==> Deploy concluído."
