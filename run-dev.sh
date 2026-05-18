#!/usr/bin/env bash
# 로컬 dev 서버 실행 — 함정 7(캐시 정리 + 포트 kill) 준수.
# 캐시 제거 + 포트 3000 kill + pnpm 버전 체크 + active provider 키 확인.
set -euo pipefail

cd "$(dirname "$0")"

echo "▶ 1/5 포트 3000 점유 정리"
lsof -t -iTCP:3000 -sTCP:LISTEN 2>/dev/null | xargs -r kill -9 2>/dev/null || true

echo "▶ 2/5 .next 캐시 제거"
rm -rf .next

echo "▶ 3/5 pnpm 버전 확인 (10+ 요구)"
PNPM_MAJOR="$(pnpm -v | cut -d. -f1)"
if [ "${PNPM_MAJOR}" -lt 10 ]; then
  echo "✗ pnpm ${PNPM_MAJOR}.x — 10+ 필요. 'corepack enable && corepack prepare pnpm@latest' 권장." >&2
  exit 1
fi

echo "▶ 4/5 active provider 키 확인"
ENV_FILE=""
[ -f .env.local ] && ENV_FILE=".env.local"
[ -z "${ENV_FILE}" ] && [ -f .env ] && ENV_FILE=".env"
if [ -z "${ENV_FILE}" ]; then
  echo "✗ .env.local 또는 .env 없음. 'cp .env.example .env.local' 후 키 입력." >&2
  exit 1
fi
PROVIDER="$(grep -E '^LLM_PROVIDER=' "${ENV_FILE}" | head -1 | cut -d= -f2 | tr -d '[:space:]')"
PROVIDER="${PROVIDER:-anthropic}"
if [ "${PROVIDER}" = "anthropic" ]; then
  KEY_LINE="$(grep -E '^ANTHROPIC_API_KEY=.+' "${ENV_FILE}" || true)"
  KEY_NAME="ANTHROPIC_API_KEY"
else
  KEY_LINE="$(grep -E '^OPENAI_API_KEY=.+' "${ENV_FILE}" || true)"
  KEY_NAME="OPENAI_API_KEY"
fi
if [ -z "${KEY_LINE}" ]; then
  echo "✗ LLM_PROVIDER=${PROVIDER} 인데 ${KEY_NAME} 가 ${ENV_FILE} 에 비어있음." >&2
  exit 1
fi
echo "  provider=${PROVIDER}, ${KEY_NAME} present ✓"

echo "▶ 5/5 next dev (포트 3000)"
exec pnpm dev
