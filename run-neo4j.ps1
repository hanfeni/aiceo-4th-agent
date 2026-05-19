<#
  run-neo4j.ps1 — Windows 용 Neo4j 온톨로지/GraphRAG 실습 인프라.
  run-neo4j.sh 의 PowerShell 쌍 (동등 기능). run-opensearch.ps1 의
  검증된 구조 + run-neo4j.sh 의 Neo4j 고유 로직(cypher-shell 헬스).

  ensure-infra.ts 가 Windows 에서 이 파일을 spawn 한다
  (powershell -ExecutionPolicy Bypass -File run-neo4j.ps1).
  → stdout 으로 진행 로그를 흘리고, 실패 시 비-0 exit code 로 종료
    해야 ensureNeo4j 의 exitCode 분기가 작동한다.

  그래프 적재는 이 스크립트가 하지 않는다(run-neo4j.sh 와 동일 정책).
  학생이 /graph-lab 메뉴 "그래프 구축" 버튼을 누르면 앱이 GitHub
  public raw 에서 SEC EDGAR 서브셋을 fetch 해 Neo4j 에 적재한다.
  → 이 스크립트는 "그래프 DB 를 띄우는 것"까지만 책임진다.

  사용: powershell -ExecutionPolicy Bypass -File run-neo4j.ps1

  Windows Docker 자동 설치 한계: winget 으로 Docker Desktop 설치는
  되나 첫 실행·WSL2 백엔드 활성·권한 승인은 GUI 라 사람 필요
  (.sh 의 macOS brew 케이스와 동일 한계).
#>

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$Compose   = @("compose", "-f", "docker-compose.neo4j.yml")
$Container = "aiceo-graph-lab-neo4j"
$Neo4jUser = "neo4j"
$Neo4jPass = "aiceo-graph-lab"

function Test-DockerReady {
  try { docker info *> $null; return $LASTEXITCODE -eq 0 }
  catch { return $false }
}

function Ensure-Docker {
  if (Test-DockerReady) { return }

  $hasDocker = Get-Command docker -ErrorAction SilentlyContinue
  if ($hasDocker) {
    Write-Host "▶ Docker 데몬 꺼짐 → Docker Desktop 기동 시도"
    Start-Process "Docker Desktop" -ErrorAction SilentlyContinue
    $n = 0
    while (-not (Test-DockerReady)) {
      $n++
      if ($n -ge 36) {
        Write-Error "Docker 데몬 미기동(180s). Docker Desktop 을 직접 실행 후 '그래프 구축' 버튼을 다시 누르세요."
        exit 1
      }
      Write-Host "  · Docker 데몬 부팅 대기… ($n/36, ~$($n * 5)s)"
      Start-Sleep -Seconds 5
    }
    Write-Host "  ✓ Docker 데몬 기동됨"
    return
  }

  # docker 미설치 → winget 설치 시도
  $hasWinget = Get-Command winget -ErrorAction SilentlyContinue
  if ($hasWinget) {
    Write-Host "▶ Docker 미설치 → winget 로 Docker Desktop 설치 (수분, 재부팅 요구 가능)"
    winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
    Write-Host "✗ 설치 후 Docker Desktop 첫 실행·WSL2 백엔드 활성·권한 승인은"
    Write-Host "  직접 완료해야 합니다. Docker Desktop 실행 후 '그래프 구축' 버튼을 다시 누르세요."
    exit 1
  }

  Write-Error "Docker 미설치 + winget 없음. https://docker.com 에서 Docker Desktop 직접 설치 후 재시도."
  exit 1
}

Ensure-Docker

Write-Host "▶ 1/3 기존 컨테이너 정리"
docker @Compose down 2>$null

Write-Host "▶ 2/3 Neo4j 기동"
docker @Compose up -d
if ($LASTEXITCODE -ne 0) {
  Write-Error "docker compose up 실패. 'docker @Compose logs' 로 원인 확인."
  exit 1
}

Write-Host "▶ 3/3 Bolt 헬스 대기 (최대 180s — 첫 기동은 느림)"
$n = 0
while ($true) {
  # docker-compose.neo4j.yml healthcheck 와 동일 — Bolt(7687) 가
  # 실제 떴는지 cypher-shell 1쿼리로 확인(HTTP 7474 보다 정확).
  docker exec $Container cypher-shell -u $Neo4jUser -p $Neo4jPass "RETURN 1" *> $null
  if ($LASTEXITCODE -eq 0) { break }
  $n++
  if ($n -ge 36) {
    Write-Error "Neo4j Bolt 헬스 실패 (180s 초과). 'docker logs $Container' 확인."
    exit 1
  }
  Write-Host "  · Neo4j 부팅 대기… ($n/36, ~$($n * 5)s)"
  Start-Sleep -Seconds 5
}
Write-Host "  ✓ Neo4j up (bolt://localhost:7687, user=$Neo4jUser)"

Write-Host ""
Write-Host "✓ Neo4j 준비 완료 (그래프 DB 만)."
Write-Host "  적재는 /graph-lab 메뉴의 '그래프 구축' 버튼에서 — GitHub"
Write-Host "  public SEC EDGAR 서브셋을 받아 Neo4j 에 넣습니다. 그 후"
Write-Host "  RAG / Text-to-SQL / GraphRAG 3방식 비교가 가능합니다."
