# Landing page (vitrine) — Vue/Vite compilado para estático e servido por um
# nginx interno, igual ao profdex-front. Este container NÃO é exposto: quem
# fala com a internet é o nginx de borda em ../nginx/, que encaminha /landing/
# para cá.
#
# Por que é um serviço separado do `frontend`, e não uma rota do app:
# o app é uma casca mobile de 480px com `overflow: hidden` no body — ele não
# rola, não tem layout de desktop e carrega o bundle inteiro do jogo. A landing
# é uma página de leitura, longa, com 3D sob demanda (three + TresJS). Juntar
# as duas significaria brigar com o CSS global do app e somar ~2 MB de
# dependências de vitrine ao bundle de quem só quer jogar.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Sem variáveis de build: o prefixo `/landing/` vive em vite.config.mjs e a
# mesma-origem do CTA, em src/config/links.js — os dois valendo também em dev,
# que é justamente o que impede o par "funciona no localhost, quebra no deploy".
RUN npm run build

FROM nginx:1.27-alpine
# O build já emite os caminhos com o prefixo /landing/, então os arquivos
# precisam viver sob esse mesmo prefixo no disco: o nginx de borda repassa a
# URL inteira (proxy_pass sem barra final), não o resto depois do prefixo.
COPY --from=build /app/dist /usr/share/nginx/html/landing
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
