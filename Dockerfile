# syntax=docker/dockerfile:1.7
# App image: compile this repo on top of the environment image.
ARG BASE_IMAGE=docker.io/local/test003-base:3
FROM ${BASE_IMAGE}

USER root
WORKDIR /app

COPY tsconfig.base.json tsconfig.server.json ./
COPY packages/ ./packages/

# The olares-* skills are not in git: they belong to the olares-cli in the base
# image, and a hand-copied snapshot describes verbs some other release has.
RUN olares-cli skills export packages/skills

RUN npm run build \
  && date -u +%Y%m%d%H%M%S > .dsh-image-id \
  && chown -R node:node /app

USER node
