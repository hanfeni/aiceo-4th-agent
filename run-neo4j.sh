#!/usr/bin/env bash
# Neo4j 온톨로지/GraphRAG 실습 인프라 — Docker 보장 + 컨테이너까지만.
# run-opensearch.sh 와 동형(검증된 ensure_docker 로직 복제). search-lab
# OpenSearch·DART run-dev.sh 와 완전 분리(신규 파일).
#
# 그래프 적재는 이 스크립트가 하지 않는다(search-lab 색인 정책과 동일).
# 학생이 /graph-lab 메뉴 "그래프 구축" 버튼을 누르면 앱이 GitHub
# public raw 에서 SEC EDGAR 서브셋을 fetch 해 Neo4j 에 적재한다.
# → 이 스크립트는 "그래프 DB 를 띄우는 것"까지만 책임진다.
#
# 절차: Docker 보장(OS분기) → 기존 컨테이너 정리 → 기동 →
#       Bolt 헬스 폴링(until). 멱등: 재실행 시 컨테이너 재구축.
#
# 사용: ./run-neo4j.sh   (Docker+Neo4j. 적재는 메뉴에서)

set -euo pipefail
cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose.neo4j.yml"
CONTAINER="aiceo-graph-lab-neo4j"
NEO4J_USER="neo4j"
NEO4J_PASS="aiceo-graph-lab"

# ── Docker 보장 (OS 분기) ─────────────────────────────
# run-opensearch.sh 와 동일 로직(검증됨). macOS brew 자동설치+기동,
# Linux 안내후종료, Windows .ps1 유도. child_process 컨텍스트에서
# open -a Docker 무력 가능성 → 60s 후 수동 안내.
ensure_docker() {
  local os
  os="$(uname -s)"

  case "$os" in
    MINGW* | MSYS* | CYGWIN*)
      echo "✗ Windows 에서는 PowerShell 스크립트를 쓰세요:" >&2
      echo "    powershell -ExecutionPolicy Bypass -File run-neo4j.ps1" >&2
      exit 1
      ;;
  esac

  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if command -v docker >/dev/null 2>&1; then
    if [ "$os" = "Darwin" ] && command -v open >/dev/null 2>&1; then
      echo "▶ Docker 데몬 꺼짐 → Docker Desktop 기동 시도 (open -a Docker)"
      open -a Docker 2>/dev/null || true
      local n=0
      until docker info >/dev/null 2>&1; do
        n=$((n + 1))
        if [ "$n" -ge 12 ]; then
          echo "✗ Docker 데몬이 60s 내 안 떴습니다." >&2
          echo "  → Finder→응용프로그램→Docker.app 을 직접 더블클릭해" >&2
          echo "    실행하고, 메뉴바 고래 아이콘이 'running' 이 되면" >&2
          echo "    '그래프 구축' 버튼을 다시 누르세요 (이 환경은 자동" >&2
          echo "    기동 무력 — 1회 수동 실행이 필요합니다)." >&2
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
          echo "    완료한 뒤 '그래프 구축' 버튼을 다시 누르세요." >&2
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

  echo "✗ Docker 미설치 (Linux). 자동 설치는 배포판·sudo 의존이라 생략합니다." >&2
  echo "  설치: https://docs.docker.com/engine/install/  후 재실행하세요." >&2
  exit 1
}

ensure_docker

echo "▶ 1/3 기존 컨테이너 정리"
$COMPOSE down 2>/dev/null || true

echo "▶ 2/3 Neo4j 기동"
$COMPOSE up -d

echo "▶ 3/3 Bolt 헬스 대기 (최대 180s — 첫 기동은 느림)"
ATTEMPT=0
until docker exec "$CONTAINER" cypher-shell -u "$NEO4J_USER" \
  -p "$NEO4J_PASS" 'RETURN 1' >/dev/null 2>&1; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ "$ATTEMPT" -ge 36 ]; then
    echo "✗ Neo4j Bolt 헬스 실패 (180s 초과). 'docker logs ${CONTAINER}' 확인." >&2
    exit 1
  fi
  echo "  · Neo4j 부팅 대기… (${ATTEMPT}/36, ~$((ATTEMPT * 5))s)"
  sleep 5
done
echo "  ✓ Neo4j up (bolt://localhost:7687, user=${NEO4J_USER})"

echo ""
echo "✓ Neo4j 준비 완료 (그래프 DB 만)."
echo "  적재는 /graph-lab 메뉴의 '그래프 구축' 버튼에서 — GitHub"
echo "  public SEC EDGAR 서브셋을 받아 Neo4j 에 넣습니다. 그 후"
echo "  RAG / Text-to-SQL / GraphRAG 3방식 비교가 가능합니다."
