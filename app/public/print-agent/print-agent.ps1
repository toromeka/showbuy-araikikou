<#
  荒井機工 販売管理システム「印刷係」

  事務所のパソコンで動かし、販売管理システムで「印刷する」を押した帳票を、
  プリンターの決まったカセットから印刷します。
  システムに数秒おきに印刷の依頼を取りに行き、SumatraPDF（無料のPDFソフト）で
  カセットを指定して印刷します。社内のネットワークやプリンターを外部に公開する必要はありません。

  ■ 初めて設定するとき（PowerShellを「管理者として実行」して、このファイルのあるフォルダで）
      powershell -ExecutionPolicy Bypass -File .\print-agent.ps1 -Setup
    接続キー（システムの「印刷状況」画面で発行）、プリンター、カセットと給紙トレイの対応を順に設定し、
    パソコンにサインインしたときに自動で起動するよう登録します。

  ■ プリンターの給紙トレイの名前を確認するとき
      powershell -ExecutionPolicy Bypass -File .\print-agent.ps1 -ListTrays

  ■ 動作の記録は、このファイルと同じフォルダの print-agent.log に残ります。
#>
param(
  [switch]$Setup,
  [switch]$ListTrays,
  # 確認用: 印刷待ちの依頼を1回だけ処理して終了する
  [switch]$Once,
  [string]$ConfigPath = ""
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# Windows PowerShell 5.1 は既定で古い暗号化方式を使うことがあるため、TLS 1.2 を明示する
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$ScriptPath = $MyInvocation.MyCommand.Path
$ScriptDir = Split-Path -Parent $ScriptPath
if (-not $ConfigPath) { $ConfigPath = Join-Path $ScriptDir 'config.json' }
$LogPath = Join-Path $ScriptDir 'print-agent.log'
$TaskName = 'AraiKikou-PrintAgent'
$DefaultServerUrl = 'https://showbuy-araikikou-production.up.railway.app'
$OnWindows = ($env:OS -eq 'Windows_NT')

function Write-Log([string]$Message) {
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Write-Host $line
  try {
    if ((Test-Path $LogPath) -and ((Get-Item $LogPath).Length -gt 1MB)) {
      Move-Item -Force $LogPath ($LogPath + '.old')
    }
    Add-Content -Path $LogPath -Value $line -Encoding UTF8
  } catch { }
}

function Read-Config {
  if (-not (Test-Path $ConfigPath)) {
    throw "設定ファイル（$ConfigPath）がありません。先に -Setup で設定してください。"
  }
  return (Get-Content -Raw -Encoding UTF8 -Path $ConfigPath | ConvertFrom-Json)
}

function Save-Config($Config) {
  $json = $Config | ConvertTo-Json -Depth 5
  [IO.File]::WriteAllText($ConfigPath, $json, (New-Object System.Text.UTF8Encoding($false)))
}

function Invoke-Api($Config, [string]$Method, [string]$Path, $Body = $null) {
  $params = @{
    Method     = $Method
    Uri        = $Config.serverUrl.TrimEnd('/') + $Path
    Headers    = @{ Authorization = 'Bearer ' + $Config.agentKey }
    TimeoutSec = 60
  }
  if ($null -ne $Body) {
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Compress))
    $params.ContentType = 'application/json; charset=utf-8'
  }
  return Invoke-RestMethod @params
}

function Get-InstalledPrinters {
  Add-Type -AssemblyName System.Drawing
  return @([System.Drawing.Printing.PrinterSettings]::InstalledPrinters)
}

function Get-PaperSources([string]$PrinterName) {
  Add-Type -AssemblyName System.Drawing
  $ps = New-Object System.Drawing.Printing.PrinterSettings
  $ps.PrinterName = $PrinterName
  if (-not $ps.IsValid) { throw "プリンター「$PrinterName」が見つかりません。" }
  return @($ps.PaperSources | ForEach-Object { [pscustomobject]@{ Kind = $_.RawKind; Name = $_.SourceName } })
}

# 「カセット 3」「Cassette3」「カセット３」などの表記の違いを吸収して、カセット番号の給紙トレイを探す
function Find-CassetteSource($Sources, [int]$No) {
  foreach ($s in $Sources) {
    $n = $s.Name -replace '\s', ''
    foreach ($d in 0..9) { $n = $n.Replace([string][char](0xFF10 + $d), [string]$d) }
    if ($n -match "^(カセット|Cassette|Drawer)$No$") { return $s.Name }
  }
  return $null
}

function Find-Sumatra {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'SumatraPDF\SumatraPDF.exe'),
    (Join-Path $env:ProgramFiles 'SumatraPDF\SumatraPDF.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'SumatraPDF\SumatraPDF.exe'),
    (Join-Path $ScriptDir 'SumatraPDF.exe')
  )
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
  return $null
}

# SumatraPDF で、拡大縮小なし（実寸）・A4・指定の給紙トレイで印刷する
function Invoke-Print($Config, [string]$File, [string]$Bin) {
  $settings = "noscale,paper=A4,bin=$Bin"
  $arguments = '-print-to "{0}" -print-settings "{1}" -silent "{2}"' -f $Config.printerName, $settings, $File
  $startParams = @{ FilePath = $Config.sumatraPath; ArgumentList = $arguments; PassThru = $true }
  if ($OnWindows) { $startParams.WindowStyle = 'Hidden' }
  $p = Start-Process @startParams
  if (-not $p.WaitForExit(180000)) {
    try { $p.Kill() } catch { }
    throw 'SumatraPDF の印刷が3分以内に終わりませんでした。'
  }
  if ($p.ExitCode -ne 0) { throw "SumatraPDF が印刷に失敗しました（終了コード $($p.ExitCode)）。" }
}

function Invoke-Job($Config, $Job) {
  $file = Join-Path ([IO.Path]::GetTempPath()) ('araikikou-print-{0}.pdf' -f $Job.id)
  Write-Log ('印刷します: {0}（カセット{1}）' -f $Job.title, $Job.cassette)
  try {
    $bin = $Config.cassettes."$($Job.cassette)"
    if (-not $bin) { throw "カセット$($Job.cassette) に対応する給紙トレイが設定されていません（-Setup で設定してください）。" }
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 120 -OutFile $file `
      -Uri ($Config.serverUrl.TrimEnd('/') + "/api/print-agent/jobs/$($Job.id)/pdf") `
      -Headers @{ Authorization = 'Bearer ' + $Config.agentKey }
    Invoke-Print $Config $file $bin
    Invoke-Api $Config 'POST' "/api/print-agent/jobs/$($Job.id)/result" @{ ok = $true } | Out-Null
    Write-Log '  → 印刷しました'
  } catch {
    $msg = $_.Exception.Message
    Write-Log "  → 失敗しました: $msg"
    try { Invoke-Api $Config 'POST' "/api/print-agent/jobs/$($Job.id)/result" @{ ok = $false; error = $msg } | Out-Null } catch { }
  } finally {
    Remove-Item -Force -ErrorAction SilentlyContinue $file
  }
}

function Start-Agent {
  $config = Read-Config
  Write-Log "印刷係を開始しました（プリンター: $($config.printerName)）"
  $offline = $false
  while ($true) {
    try {
      $res = Invoke-Api $config 'POST' '/api/print-agent/next'
      if ($offline) { Write-Log 'システムに再接続しました'; $offline = $false }
      if ($res.job) {
        Invoke-Job $config $res.job
        continue
      }
      if ($Once) { return }
    } catch {
      if (-not $offline) { Write-Log "システムに接続できません（接続できるまで待ちます）: $($_.Exception.Message)"; $offline = $true }
      if ($Once) { return }
      Start-Sleep -Seconds 30
      continue
    }
    Start-Sleep -Seconds ([int]$config.pollSeconds)
  }
}

function Show-Trays {
  $printers = Get-InstalledPrinters
  foreach ($p in $printers) {
    Write-Host ''
    Write-Host "■ $p"
    try {
      foreach ($s in (Get-PaperSources $p)) { Write-Host ('    {0,5}  {1}' -f $s.Kind, $s.Name) }
    } catch { Write-Host "    （給紙トレイを取得できませんでした: $($_.Exception.Message)）" }
  }
}

function Read-Answer([string]$Prompt, [string]$Default = '') {
  $label = if ($Default) { "$Prompt [$Default]" } else { $Prompt }
  $a = Read-Host $label
  if ([string]::IsNullOrWhiteSpace($a)) { return $Default }
  return $a.Trim()
}

function Invoke-Setup {
  Write-Host '=== 荒井機工 販売管理システム 印刷係の設定 ==='
  $old = $null
  if (Test-Path $ConfigPath) { $old = Read-Config }

  # 1. 接続先と接続キー
  $serverUrl = Read-Answer 'システムのURL' $(if ($old) { $old.serverUrl } else { $DefaultServerUrl })
  $agentKey = Read-Answer '接続キー（「印刷状況」画面で発行したもの）' $(if ($old) { $old.agentKey } else { '' })
  $config = [pscustomobject]@{ serverUrl = $serverUrl; agentKey = $agentKey; printerName = ''; sumatraPath = ''; pollSeconds = 5; cassettes = [pscustomobject]@{} }
  try {
    $ping = Invoke-Api $config 'GET' '/api/print-agent/ping'
    Write-Host "  → 接続できました（登録名: $($ping.name)）"
  } catch {
    throw "システムに接続できませんでした。URLと接続キーを確認してください: $($_.Exception.Message)"
  }

  # 2. SumatraPDF
  $sumatra = Find-Sumatra
  if (-not $sumatra) { $sumatra = Read-Answer 'SumatraPDF.exe の場所' '' }
  if (-not (Test-Path $sumatra)) { throw 'SumatraPDF が見つかりません。先に SumatraPDF をインストールしてください。' }
  Write-Host "  → SumatraPDF: $sumatra"
  $config.sumatraPath = $sumatra

  # 3. プリンター
  $printers = Get-InstalledPrinters
  Write-Host ''
  for ($i = 0; $i -lt $printers.Count; $i++) { Write-Host ('  {0}. {1}' -f ($i + 1), $printers[$i]) }
  $defaultIndex = 1
  for ($i = 0; $i -lt $printers.Count; $i++) { if ($printers[$i] -match 'C3520') { $defaultIndex = $i + 1; break } }
  $n = [int](Read-Answer '使うプリンターの番号' "$defaultIndex")
  $config.printerName = $printers[$n - 1]
  Write-Host "  → プリンター: $($config.printerName)"

  # 4. カセットと給紙トレイの対応
  $sources = Get-PaperSources $config.printerName
  Write-Host ''
  Write-Host '  このプリンターの給紙トレイ:'
  foreach ($s in $sources) { Write-Host ('    {0}' -f $s.Name) }
  $cassettes = [ordered]@{}
  foreach ($no in 1..4) {
    $guess = Find-CassetteSource $sources $no
    $cassettes["$no"] = Read-Answer "カセット$no の給紙トレイの名前" $(if ($guess) { $guess } else { '' })
  }
  $config.cassettes = [pscustomobject]$cassettes
  Save-Config $config
  Write-Host "  → 設定を保存しました（$ConfigPath）"

  # 5. サインイン時に自動で起動するよう登録
  if ($OnWindows) {
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
      -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $ScriptPath) `
      -WorkingDirectory $ScriptDir
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User ('{0}\{1}' -f $env:USERDOMAIN, $env:USERNAME)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
      -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
      -Description '荒井機工 販売管理システムの帳票を、プリンターの決まったカセットから印刷します。' -Force | Out-Null
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "  → サインイン時に自動で起動するよう登録し、起動しました（タスク名: $TaskName）"
  }
  Write-Host ''
  Write-Host '設定が終わりました。システムの「印刷状況」画面で「接続中」になっていることを確認し、'
  Write-Host '売上伝票などの「印刷する」で試し印刷をしてください。'
}

if ($ListTrays) { Show-Trays; return }
if ($Setup) { Invoke-Setup; return }
Start-Agent
