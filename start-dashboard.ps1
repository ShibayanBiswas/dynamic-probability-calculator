# Dynamic Probability Calculator — local development (Windows)
# Usage:
#   .\start-dashboard.ps1          Start optional Mongo + Next.js on :3001
#   .\start-dashboard.ps1 -Stop    Free port 3001

param(
  [switch]$Stop
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

function Find-Node {
  $candidates = @(
    "node",
    "$env:ProgramFiles\nodejs\node.exe",
    "${env:ProgramFiles(x86)}\nodejs\node.exe",
    "$env:LOCALAPPDATA\Programs\node\node.exe"
  )
  foreach ($candidate in $candidates) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) {
      return (Get-Command $candidate).Source
    }
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  $portableDirs = Get-ChildItem (Join-Path $projectRoot ".tools") -Directory -Filter "node-v*" -ErrorAction SilentlyContinue
  if ($portableDirs) {
    $portableNode = Join-Path $portableDirs[0].FullName "node.exe"
    if (Test-Path $portableNode) {
      return $portableNode
    }
  }

  return $null
}

function Get-PidsOnPort([int]$Port) {
  $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
  if (-not $connections) { return @() }
  return $connections | Select-Object -ExpandProperty OwningProcess -Unique
}

function Free-Port([int]$Port) {
  $pids = Get-PidsOnPort $Port
  if (-not $pids -or $pids.Count -eq 0) { return $true }

  Write-Host "Freeing port $Port (pids: $($pids -join ', '))..."
  foreach ($procId in $pids) {
    try { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } catch {}
  }
  Start-Sleep -Seconds 1

  $remaining = Get-PidsOnPort $Port
  if ($remaining -and $remaining.Count -gt 0) {
    Write-Host "WARNING: port $Port still busy (pids: $($remaining -join ', '))."
    return $false
  }
  return $true
}

function Load-EnvLocal {
  $envFile = Join-Path $projectRoot ".env.local"
  if (-not (Test-Path $envFile)) {
    $example = Join-Path $projectRoot ".env.example"
    if (Test-Path $example) {
      Copy-Item $example $envFile
      Write-Host "Created .env.local from .env.example"
    }
    return
  }

  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()
    if ($key -and -not [string]::IsNullOrWhiteSpace($key)) {
      Set-Item -Path "env:$key" -Value $value
    }
  }
}

function Start-Mongo {
  if (-not $env:MONGODB_URI) { return }

  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker not found — skip Mongo container (app uses baked master-seed.json)."
    return
  }

  try {
    docker info *> $null
  } catch {
    Write-Host "Docker not running — skip Mongo container."
    return
  }

  $composeFile = Join-Path $projectRoot "docker-compose.yml"
  $running = docker compose -f $composeFile ps --status running 2>$null | Select-String "sp-dashboard-mongo"
  if ($running) {
    Write-Host "MongoDB already running (sp-dashboard-mongo)"
    return
  }

  Write-Host "Starting MongoDB (docker compose) on mongodb://127.0.0.1:27017 ..."
  docker compose -f $composeFile up -d | Out-Null
}

if ($Stop) {
  Free-Port 3001 | Out-Null
  Write-Host "Stopped Dynamic Probability Calculator local services."
  exit 0
}

$nodePath = Find-Node
if (-not $nodePath) {
  Write-Host "Node.js is not installed or not on PATH."
  Write-Host "Install Node.js 20+ LTS, reopen the terminal, then run this script again."
  exit 1
}

$npmPath = Join-Path (Split-Path $nodePath) "npm.cmd"
if (-not (Test-Path $npmPath)) { $npmPath = "npm" }

if (-not (Test-Path ".\node_modules")) {
  Write-Host "Installing Node dependencies..."
  & $npmPath install
}

Load-EnvLocal

if (-not (Free-Port 3001)) {
  Write-Host "Cannot start Next.js — port 3001 is occupied."
  exit 1
}

Start-Mongo

Write-Host ""
Write-Host "Dynamic Probability Calculator — local only"
Write-Host "  App:  http://localhost:3001"
Write-Host "  API:  http://localhost:3001/api/*"
if ($env:MONGODB_URI) { Write-Host "  Mongo: $env:MONGODB_URI" }
Write-Host "  Pivot: Node engine (no Python required)"
Write-Host ""
Write-Host "Press Ctrl+C to stop Next.js."
Write-Host ""

& $npmPath run dev
