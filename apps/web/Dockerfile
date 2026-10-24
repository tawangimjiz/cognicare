# Build context: repo root. docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=... .
# Unity builds are GitHub release assets listed by apps/web/public/games/<id>/version.json; game:fetch downloads them.
# Private repo: BuildKit secret, never an ARG/ENV (those end up in image history):
#   docker build --secret id=game_fetch_token,env=GAME_FETCH_TOKEN ...
FROM node:24-alpine AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api
ARG GAME_RELEASE_REPO=tawangimjiz/cognicare
ARG SKIP_GAME_FETCH=0
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
WORKDIR /app
COPY . .
RUN --mount=type=secret,id=game_fetch_token,required=false \
    if [ "$SKIP_GAME_FETCH" = "1" ]; then \
      echo "!!! WARNING: SKIP_GAME_FETCH=1, Unity games NOT fetched; the image will show 'coming soon' for them !!!"; \
    else \
      if [ -s /run/secrets/game_fetch_token ]; then export GAME_FETCH_TOKEN="$(cat /run/secrets/game_fetch_token)"; fi; \
      GAME_RELEASE_REPO="$GAME_RELEASE_REPO" node scripts/game-fetch.mjs; \
    fi
RUN npm ci && npm run build -w apps/web

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
