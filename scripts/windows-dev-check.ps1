# AIOSCreator local-max check. No build. Run in a new terminal after PATH refresh.
$ErrorActionPreference = 'Continue'
function Ok($n,$v){ Write-Host ("  OK   {0,-12} {1}" -f $n,$v) -ForegroundColor Green }
function Bad($n,$m){ Write-Host ("  MISS {0,-12} {1}" -f $n,$m) -ForegroundColor Yellow }

Write-Host "`nAIOSCreator Windows check`n"
$cmds = @{
  git = 'git --version'
  node = 'node -v'
  npm = 'npm -v'
  pnpm = 'pnpm -v'
  python = 'python --version'
  uv = 'uv --version'
  ffmpeg = 'ffmpeg -version'
  nvidia = 'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader'
}
foreach ($k in $cmds.Keys) {
  try {
    $out = Invoke-Expression $cmds[$k] 2>&1 | Select-Object -First 1
    if ($LASTEXITCODE -eq 0 -or $out) { Ok $k $out } else { Bad $k 'not on PATH' }
  } catch { Bad $k $_.Exception.Message }
}

Write-Host "`nWindows flags (need Run as Administrator once):"
$lp = (Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -ErrorAction SilentlyContinue).LongPathsEnabled
if ($lp -eq 1) { Ok 'longpaths' 'enabled' } else { Bad 'longpaths' '0 — run scripts/admin-once.ps1 as Admin' }
$vs = Test-Path "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if ($vs) { Ok 'VS Build' 'installed' } else { Bad 'VS Build' 'optional until native addons fail (better-sqlite3)' }

Write-Host "`nDo NOT: Docker Desktop, ComfyUI models, npm install in this folder until M00.`n"
