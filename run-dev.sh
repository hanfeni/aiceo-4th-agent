#!/usr/bin/env bash
# 로컬 dev 서버 실행 — 함정 7(캐시 정리 + 포트 kill) 준수.
# fresh git clone 에서도 단독 실행 가능: 환경 점검 → 누락 시 자동 설치 → 기동 → 브라우저 오픈.
set -euo pipefail

cd "$(dirname "$0")"

PORT=3000
URL="http://localhost:${PORT}"

echo "▶ 1/7 포트 ${PORT} 점유 정리"
lsof -t -iTCP:${PORT} -sTCP:LISTEN 2>/dev/null | xargs -r kill -9 2>/dev/null || true

echo "▶ 2/7 .next 캐시 제거"
rm -rf .next

echo "▶ 3/7 pnpm 버전 확인 (10+ 요구)"
if ! command -v pnpm >/dev/null 2>&1; then
  echo "✗ pnpm 미설치. 'corepack enable && corepack prepare pnpm@latest --activate' 실행 후 재시도." >&2
  exit 1
fi
PNPM_MAJOR="$(pnpm -v | cut -d. -f1)"
if [ "${PNPM_MAJOR}" -lt 10 ]; then
  echo "✗ pnpm ${PNPM_MAJOR}.x — 10+ 필요. 'corepack enable && corepack prepare pnpm@latest --activate' 권장." >&2
  exit 1
fi

echo "▶ 4/7 의존성 점검 (clone 직후 자동 설치)"
NEED_INSTALL=0
if [ ! -d node_modules ]; then
  echo "  node_modules 없음 → 설치 필요"
  NEED_INSTALL=1
elif [ pnpm-lock.yaml -nt node_modules ] || [ package.json -nt node_modules ]; then
  echo "  lockfile/package.json 이 node_modules 보다 최신 → 재설치 필요"
  NEED_INSTALL=1
fi
if [ "${NEED_INSTALL}" -eq 1 ]; then
  echo "  pnpm install 실행 중 (네이티브 빌드 포함, 수 분 소요 가능)..."
  pnpm install
  # R1: @langchain/core 단일 트리 검증 (버전 갈리면 AIMessageChunk instanceof 깨짐)
  # pnpm 출력 포맷 = "@langchain/core@1.1.46" (@ 구분). 버전만 추출.
  # grep 비매칭(exit 1)이 set -e 로 스크립트를 죽이지 않게 || true.
  CORE_VERSIONS="$(pnpm why @langchain/core 2>/dev/null \
    | grep -oE '@langchain/core@[0-9]+\.[0-9]+\.[0-9]+' \
    | sed 's/.*@//' | sort -u || true)"
  CORE_COUNT="$(printf '%s\n' "${CORE_VERSIONS}" | grep -c . || true)"
  if [ "${CORE_COUNT}" -gt 1 ]; then
    echo "✗ R1 위반: @langchain/core 가 단일 버전이 아님 →" >&2
    printf '%s\n' "${CORE_VERSIONS}" >&2
    echo "  버전 갈림 = AIMessageChunk instanceof 깨짐. package.json 정렬 필요." >&2
    exit 1
  fi
  echo "  @langchain/core 단일 트리 ✓ (${CORE_VERSIONS})"
else
  echo "  node_modules 최신 → 설치 건너뜀"
fi

echo "▶ 5/7 active provider 키 확인"
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

# ── 검색 실습용 OpenSearch 기동 (검색 엔진만 — 색인은 메뉴 버튼) ──
# run-opensearch.sh = Docker 보장 + OS분기 + 컨테이너·Nori 까지만.
# 색인(GitHub fetch+임베딩)은 학생이 /search-lab "색인" 버튼으로
# 트리거. 실패해도 next dev 는 진행(검색 메뉴만 비활성, 타 메뉴
# 정상 — graceful degradation). DART 와 섞임 최소화: 호출 1블록만.
echo "▶ 5.5/7 OpenSearch 기동 (검색 실습용)"
if [ -x ./run-opensearch.sh ]; then
  if ./run-opensearch.sh; then
    echo "  ✓ OpenSearch 준비 (색인은 /search-lab 메뉴 버튼에서)"
  else
    echo "  ⚠ OpenSearch 기동 실패 — 검색 메뉴만 비활성. 다른 메뉴는 정상." >&2
  fi
else
  echo "  ⚠ run-opensearch.sh 없음/실행권한 없음 — 검색 메뉴 비활성." >&2
fi

echo "▶ 6/7 서버 Ready 대기 후 브라우저 자동 오픈 예약"
# exec 로 셸이 교체되므로 브라우저 오픈은 백그라운드 서브셸로 분리.
# 포트 LISTEN 을 폴링해 Turbopack 콜드 스타트 편차를 흡수한다.
(
  for _ in $(seq 1 60); do
    if lsof -iTCP:${PORT} -sTCP:LISTEN -n -P >/dev/null 2>&1; then
      sleep 1  # Ready 직후 첫 요청 컴파일 여유
      if command -v open >/dev/null 2>&1; then
        open "${URL}"        # macOS
      elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "${URL}"    # Linux fallback
      fi
      exit 0
    fi
    sleep 0.5
  done
) &

echo "▶ 7/7 next dev (포트 ${PORT}) — ${URL}"
exec pnpm dev
