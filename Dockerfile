FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Variables publiques — baked into the client bundle
ARG PUBLIC_SUPABASE_URL
ARG PUBLIC_SUPABASE_ANON_KEY
ARG PUBLIC_POSTHOG_KEY
ARG PUBLIC_POSTHOG_HOST
ENV PUBLIC_SUPABASE_URL=$PUBLIC_SUPABASE_URL
ENV PUBLIC_SUPABASE_ANON_KEY=$PUBLIC_SUPABASE_ANON_KEY
ENV PUBLIC_POSTHOG_KEY=$PUBLIC_POSTHOG_KEY
ENV PUBLIC_POSTHOG_HOST=$PUBLIC_POSTHOG_HOST

# Variables privées — placeholder uniquement pour que le build ne plante pas.
# postgres-js est lazy : aucune vraie connexion n'est établie pendant le build.
# Les vraies valeurs sont injectées par Fly.io au démarrage du conteneur.
ARG DATABASE_URL=postgresql://placeholder:placeholder@localhost/placeholder
ARG SUPABASE_SERVICE_ROLE_KEY=placeholder
ENV DATABASE_URL=$DATABASE_URL
ENV SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY

RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/build build/
COPY --from=builder /app/node_modules node_modules/
COPY package.json .
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "build"]
