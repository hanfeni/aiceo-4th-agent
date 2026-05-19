<#
  run-dev.ps1 — Windows 용 dev 서버 실행. run-dev.sh 의 PowerShell 쌍.

  단계: 포트 정리 → .next 캐시 제거 → pnpm 점검 → OpenSearch 기동
        (--NoIndex, 색인은 메뉴 버튼) → next dev.

  사용: powershell -ExecutionPolicy Bypass -File run-dev.ps1

  bash 판(run-dev.sh)과 기능 동등. 검색 실습 OpenSearch 는
  run-opensearch.ps1 -NoIndex 로 컨테이너만 띄우고, 색인은 학생이
  /search-lab 메뉴 버튼으로 트리거(임베딩 API 호출 분리).
#>

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$Port = 3000
$Url  = "http://localhost:$Port"

Write-Host "▶ 1/6 포트 $Port 점유 정리"
$pids = (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).OwningProcess
foreach ($procId in ($pids | Select-Object -Unique)) {
  if ($procId) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }
}

Write-Host "▶ 2/6 .next 캐시 제거"
if (Test-Path .next) { Remove-Item -Recurse -Force .next }

Write-Host "▶ 3/6 pnpm 버전 확인 (10+ 요구)"
$hasPnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $hasPnpm) {
  Write-Error "pnpm 미설치. 'corepack enable; corepack prepare pnpm@latest --activate' 후 재시도."
  exit 1
}
$pnpmMajor = [int]((pnpm -v).Split(".")[0])
if ($pnpmMajor -lt 10) {
  Write-Error "pnpm $pnpmMajor.x — 10+ 필요. 'corepack prepare pnpm@latest --activate' 권장."
  exit 1
}

Write-Host "▶ 4/6 의존성 점검"
if (-not (Test-Path node_modules)) {
  Write-Host "  node_modules 없음 → pnpm install (수 분 소요 가능)"
  pnpm install
}

Write-Host "▶ 5/6 OpenSearch 기동 (검색 실습용, -NoIndex)"
# 색인은 /search-lab 메뉴 버튼에서. 실패해도 next dev 진행
# (검색 메뉴만 비활성, 타 메뉴 정상 — graceful degradation).
if (Test-Path ./run-opensearch.ps1) {
  try {
    & powershell -ExecutionPolicy Bypass -File ./run-opensearch.ps1 -NoIndex
    Write-Host "  ✓ OpenSearch 준비 (색인은 /search-lab 메뉴 버튼에서)"
  } catch {
    Write-Warning "OpenSearch 기동 실패 — 검색 메뉴만 비활성. 다른 메뉴는 정상."
  }
} else {
  Write-Warning "run-opensearch.ps1 없음 — 검색 메뉴 비활성."
}

# 서버 Ready 후 브라우저 자동 오픈 (백그라운드 job)
Start-Job -ScriptBlock {
  param($p, $u)
  for ($i = 0; $i -lt 60; $i++) {
    if (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) {
      Start-Sleep -Seconds 1
      Start-Process $u
      break
    }
    Start-Sleep -Milliseconds 500
  }
} -ArgumentList $Port, $Url | Out-Null

Write-Host "▶ 6/6 next dev (포트 $Port) — $Url"
pnpm dev
