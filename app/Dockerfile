# ---- 부서장 페르소나 에이전트 (Next.js standalone + Python data tool) ----
FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 스키마/마이그레이션 포함하여 standalone 빌드
RUN npm run build

FROM node:22-alpine AS runner
# 파이썬 데이터 처리 도구(pandas/openpyxl) 지원
RUN apk add --no-cache python3 py3-pip py3-pandas py3-openpyxl && \
    python3 --version && \
    mkdir -p /app/data
# (apk py3-pandas 부재 시 대비) 필요한 패키지 보충 — openpyxl이 없으면 설치
RUN python3 -c "import pandas, openpyxl" 2>/dev/null || pip3 install --no-cache-dir pandas openpyxl

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATA_DIR=/app/data
ENV PYTHON_BIN=/usr/bin/python3

WORKDIR /app
# standalone 서버 + migrations + static + public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# drizzle 마이그레이션 폴더 복사 (자동 테이블 생성용)
COPY --from=build /app/drizzle ./drizzle

USER node
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.js"]
