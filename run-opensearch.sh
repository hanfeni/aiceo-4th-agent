#!/usr/bin/env bash
# OpenSearch 검색 실습 인프라 — Docker 보장 + 컨테이너 + Nori 까지만.
# DART 작업의 run-dev.sh 와 완전 분리(신규 파일).
#
# 2026-05-19 결정(사용자): 색인은 이 스크립트가 하지 않는다.
# 학생이 /search-lab 메뉴 "색인" 버튼을 누르면 앱이 GitHub public
# raw 에서 문서를 fetch 해 OpenSearch 에 색인한다(진행 SSE 표시).
# → 이 스크립트는 "검색 엔진을 띄우는 것"까지만 책임진다.
#
# 절차: Docker 보장(OS분기) → 기존 컨테이너 정리 → 기동 →
#       헬스 폴링(until) → Nori 플러그인 설치(미설치 시).
# 멱등: 재실행 시 컨테이너 재구축.
#
# 사용: ./run-opensearch.sh   (Docker+컨테이너+Nori. 색인은 메뉴에서)
#       run-dev.sh 가 이 스크립트를 자동 호출한다.

set -euo pipefail
cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose.opensearch.yml"
CONTAINER="aiceo-search-lab-os"
OS_URL="http://localhost:9200"

# ── Docker 보장 (OS 분기) ─────────────────────────────
# macOS  : 미설치 시 brew 자동 설치 + 데몬(open -a Docker) 기동 시도.
#          단 첫 실행 권한 승인은 GUI라 사람 필요(완전 자동 불가).
# Linux  : 자동 설치 안 함(배포판별·sudo·재로그인 필요) — 안내 후 종료.
# Windows: 이 .sh 미지원 → run-opensearch.ps1 사용 안내 후 종료.
ensure_docker() {
  local os
  os="$(uname -s)"

  # Windows(MSYS/Cygwin/MINGW)에서 bash 실행 시 — .ps1 로 유도
  case "$os" in
    MINGW* | MSYS* | CYGWIN*)
      echo "✗ Windows 에서는 PowerShell 스크립트를 쓰세요:" >&2
      echo "    powershell -ExecutionPolicy Bypass -File run-opensearch.ps1" >&2
      exit 1
      ;;
  esac

  if docker info >/dev/null 2>&1; then
    return 0 # 데몬 정상 — 통과
  fi

  # docker 명령은 있는데 데몬만 꺼진 경우
  if command -v docker >/dev/null 2>&1; then
    if [ "$os" = "Darwin" ] && command -v open >/dev/null 2>&1; then
      echo "▶ Docker 데몬 꺼짐 → Docker Desktop 기동 시도 (open -a Docker)"
      open -a Docker 2>/dev/null || true
      # child_process 컨텍스트에선 open 이 GUI 세션에 도달 못 해
      # 무력일 수 있다(실측). 60s 안에 안 뜨면 헛대기 말고 빠르게
      # 수동 실행을 안내한다. 폴링마다 진행 echo(멈춘 듯 보임 해소).
      local n=0
      until docker info >/dev/null 2>&1; do
        n=$((n + 1))
        if [ "$n" -ge 12 ]; then
          echo "✗ Docker 데몬이 60s 내 안 떴습니다." >&2
          echo "  → Finder→응용프로그램→Docker.app 을 직접 더블클릭해" >&2
          echo "    실행하고, 메뉴바 고래 아이콘이 'running' 이 되면" >&2
          echo "    색인 버튼을 다시 누르세요 (이 환경은 자동 기동" >&2
          echo "    무력 — 1회 수동 실행이 필요합니다)." >&2
          exit 1
        fi
        echo "  · Docker 데몬 부팅 대기… (${n}/12, ~$((n * 5))s)"
        sleep 5
      done
      echo "  ✓ Docker 데몬 기동됨"
      return 0
    fi
    echo "✗ Docker 데몬이 꺼져 있습니다. Docker 를 실행한 뒤 재시도하세요." >&2
    exit 1
  fi

  # docker 자체가 없음 — OS 분기 설치
  if [ "$os" = "Darwin" ]; then
    if command -v brew >/dev/null 2>&1; then
      echo "▶ Docker 미설치 → brew 로 Docker Desktop 설치 (수분 소요)"
      brew install --cask docker
      echo "▶ Docker Desktop 첫 기동 시도 (권한 승인 창은 직접 눌러주세요)"
      open -a Docker 2>/dev/null || true
      local n=0
      until docker info >/dev/null 2>&1; do
        n=$((n + 1))
        if [ "$n" -ge 36 ]; then
          echo "✗ 설치는 됐으나 데몬 미기동(180s)." >&2
          echo "  → Docker Desktop 을 직접 실행하고 최초 권한 승인을" >&2
          echo "    완료한 뒤 색인 버튼을 다시 누르세요." >&2
          exit 1
        fi
        echo "  · Docker 설치 후 첫 부팅 대기… (${n}/36, ~$((n * 5))s)"
        sleep 5
      done
      echo "  ✓ Docker 설치·기동 완료"
      return 0
    fi
    echo "✗ Docker 미설치 + Homebrew 없음. 다음 중 하나:" >&2
    echo "  1) Homebrew 설치 후 재실행  2) https://docker.com 에서 Docker Desktop 직접 설치" >&2
    exit 1
  fi

  # Linux
  echo "✗ Docker 미설치 (Linux). 자동 설치는 배포판·sudo 의존이라 생략합니다." >&2
  echo "  설치: https://docs.docker.com/engine/install/  후 재실행하세요." >&2
  exit 1
}

ensure_docker

echo "▶ 1/5 기존 컨테이너 정리"
$COMPOSE down 2>/dev/null || true

echo "▶ 2/5 OpenSearch 기동"
$COMPOSE up -d

echo "▶ 3/5 헬스 대기 (최대 120s)"
ATTEMPT=0
until curl -fs "${OS_URL}/_cluster/health" >/dev/null 2>&1; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -ge 24 ]; then
    echo "✗ OpenSearch 헬스 실패 (120s 초과). 'docker logs ${CONTAINER}' 확인." >&2
    exit 1
  fi
  sleep 5
done
echo "  ✓ OpenSearch up (${OS_URL})"

echo "▶ 4/5 Nori 플러그인 확인/설치"
if docker exec "$CONTAINER" sh -c \
  'opensearch-plugin list 2>/dev/null | grep -q analysis-nori'; then
  echo "  ✓ analysis-nori 이미 설치됨"
else
  echo "  · analysis-nori 설치 (1회, 수십초)"
  docker exec "$CONTAINER" sh -c \
    'opensearch-plugin install --batch analysis-nori' >/dev/null
  echo "  · 플러그인 적용 위해 재시작"
  $COMPOSE restart
  ATTEMPT=0
  until curl -fs "${OS_URL}/_cluster/health" >/dev/null 2>&1; do
    ATTEMPT=$((ATTEMPT + 1))
    if [ "$ATTEMPT" -ge 24 ]; then
      echo "✗ 재시작 후 헬스 실패." >&2
      exit 1
    fi
    sleep 5
  done
  echo "  ✓ Nori 적용 완료"
fi

echo ""
echo "✓ OpenSearch 준비 완료 (검색 엔진만)."
echo "  색인은 /search-lab 메뉴의 '색인' 버튼에서 — GitHub public"
echo "  문서를 받아 OpenSearch 에 넣습니다. 그 후 검색 가능."
