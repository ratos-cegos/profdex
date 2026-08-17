# Build multi-stage: Vue/Vite compila para arquivos estáticos, servidos por
# Nginx (sem processo Node permanente). VITE_API_URL e VITE_WS_URL ficam de
# propósito fixos em relativo/vazio: em produção o front sempre fala com o
# mesmo domínio (ver src/services/api-base-url.js) — não há mais backend em
# outro domínio (Vercel+AWS foi substituído por um único host atrás do nginx
# de borda, ver ../nginx/).
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV VITE_API_URL=/api
ENV VITE_WS_URL=
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
