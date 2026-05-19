<#
  run-opensearch.ps1 — Windows 용 OpenSearch 검색 실습 인프라.
  run-opensearch.sh 의 PowerShell 쌍 (동등 기능).

  2026-05-19 결정(사용자): 색인은 이 스크립트가 하지 않는다.
  학생이 /search-lab 메뉴 "색인" 버튼을 누르면 앱이 GitHub public
  raw 에서 문서를 fetch 해 색인한다. 이 스크립트는 검색 엔진을
  띄우는 것(Docker+컨테이너+Nori)까지만 책임진다.

  절차: Docker 보장(미설치 시 winget 설치) → 컨테이너 기동 →
        헬스 폴링 → Nori 플러그인.

  사용: powershell -ExecutionPolicy Bypass -File run-opensearch.ps1

  Windows Docker 자동 설치 한계: winget 으로 Docker Desktop 설치는
  되나 첫 실행·WSL2 백엔드 활성·권한 승인은 GUI 라 사람 필요
  (.sh 의 macOS brew 케이스와 동일 한계).
#>

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$Compose   = @("compose", "-f", "docker-compose.opensearch.yml")
$Container = "aiceo-search-lab-os"
$OsUrl     = "http://localhost:9200"

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
        Write-Error "Docker 데몬 미기동(180s). Docker Desktop 을 직접 실행 후 재시도."
        exit 1
      }
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
    Write-Host "  직접 완료해야 합니다. Docker Desktop 실행 후 이 스크립트를 재실행하세요."
    exit 1
  }

  Write-Error "Docker 미설치 + winget 없음. https://docker.com 에서 Docker Desktop 직접 설치 후 재실행."
  exit 1
}

Ensure-Docker

Write-Host "▶ 1/5 기존 컨테이너 정리"
docker @Compose down 2>$null

Write-Host "▶ 2/5 OpenSearch 기동"
docker @Compose up -d

Write-Host "▶ 3/5 헬스 대기 (최대 120s)"
$n = 0
while ($true) {
  try {
    Invoke-WebRequest -UseBasicParsing "$OsUrl/_cluster/health" *> $null
    break
  } catch {
    $n++
    if ($n -ge 24) {
      Write-Error "OpenSearch 헬스 실패(120s). 'docker logs $Container' 확인."
      exit 1
    }
    Start-Sleep -Seconds 5
  }
}
Write-Host "  ✓ OpenSearch up ($OsUrl)"

Write-Host "▶ 4/5 Nori 플러그인 확인/설치"
$noriListed = docker exec $Container sh -c "opensearch-plugin list 2>/dev/null | grep -q analysis-nori; echo `$?"
if ($noriListed -eq "0") {
  Write-Host "  ✓ analysis-nori 이미 설치됨"
} else {
  Write-Host "  · analysis-nori 설치 (1회, 수십초)"
  docker exec $Container sh -c "opensearch-plugin install --batch analysis-nori" *> $null
  Write-Host "  · 플러그인 적용 위해 재시작"
  docker @Compose restart
  $n = 0
  while ($true) {
    try { Invoke-WebRequest -UseBasicParsing "$OsUrl/_cluster/health" *> $null; break }
    catch {
      $n++
      if ($n -ge 24) { Write-Error "재시작 후 헬스 실패."; exit 1 }
      Start-Sleep -Seconds 5
    }
  }
  Write-Host "  ✓ Nori 적용 완료"
}

Write-Host ""
Write-Host "✓ OpenSearch 준비 완료 (검색 엔진만)."
Write-Host "  색인은 /search-lab 메뉴의 '색인' 버튼에서 — GitHub public"
Write-Host "  문서를 받아 OpenSearch 에 넣습니다. 그 후 검색 가능."
