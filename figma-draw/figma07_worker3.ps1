param([int]$WatchMinutes = 9)
# figma-07 adaptive watch-worker: waits for lead restock, auto-heals session, processes per protocol.
$ad = "F:\new\agent-desktop-v1.1.0-x86_64-pc-windows-msvc\agent-desktop.exe"
$s = "run-1793853422648-43220-0"   # last known session; auto-healed if dead
$id = "figma-07"
$W = "w-1968004"
$root = "D:\ZYY Project\EduMind\figma-draw"
$lock = "$root\lock"
$runLog = "$root\logs\figma-07-watch.log"
$deadline = (Get-Date).AddMinutes($WatchMinutes)
foreach ($d in @("done","failed","shots","logs")) {
    if (-not (Test-Path "$root\$d")) { New-Item -ItemType Directory -Path "$root\$d" | Out-Null }
}
function Wlog([string]$m) { Add-Content -Path $runLog -Value "[$(Get-Date -Format 'HH:mm:ss')] $m" }

function Get-AdJson([string[]]$A) {
    $raw = & $ad @A 2>&1 | Out-String
    try { return ($raw | ConvertFrom-Json) } catch { return $null }
}

function Test-Session([string]$Sid) {
    $r = Get-AdJson @("list-windows","--session",$Sid,"--agent-id",$id)
    return ($r -and $r.ok)
}

function Heal-Session {
    # current session dead? start a fresh one and re-enable cursor overlay
    if (Test-Session $s) { return $true }
    Wlog "session $s dead -> starting fresh session"
    $r = Get-AdJson @("session","start","--name","figma-draw-07-wave3","--cursor","--multi-agent")
    if ($r -and $r.ok) {
        $script:s = $r.data.session_id
        & $ad cursor-overlay enable --session $script:s --agent-id $id --accent "#5F27CD" | Out-Null
        Wlog "new session $($script:s) ready"
        return $true
    }
    Wlog "session start FAILED"
    return $false
}

function Set-Pos([string]$Field, [string]$Value) {
    for ($r = 1; $r -le 3; $r++) {
        $f = Get-AdJson @("find","--session",$s,"--agent-id",$id,"--window-id",$W,"--role","spinbutton","--name",$Field)
        if ($f -and $f.ok -and $f.data.matches.Count -gt 0) {
            $ref = "$($f.data.matches[0].ref_id)"
            $sv = Get-AdJson @("set-value","--session",$s,"--agent-id",$id,"$ref","$Value")
            if ($sv -and $sv.ok) { return $true }
            $code = $sv.error.code
            Wlog "  set-value $Field try${r}: code=$code"
            if ($code -in @("STALE_REF","TIMEOUT","ACTION_FAILED")) { Start-Sleep -Milliseconds 400; continue }
            return $true
        }
        Wlog "  find $Field try${r}: no match (code=$($f.error.code))"
        if ($f -and $f.error.code -eq "INVALID_ARGS") { return $false }
        Start-Sleep -Milliseconds 400
    }
    return $false
}

function Process-Item($item) {
    $j = Get-Content $item.FullName -Raw | ConvertFrom-Json
    $name = "$($j.name)"; $png = "$($j.png)"; $x = "$($j.x)"; $y = "$($j.y)"
    Wlog "START $name x=$x y=$y (from $($item.Directory.Name))"
    $ok = $false; $failReason = ""
    for ($attempt = 1; $attempt -le 2 -and -not $ok; $attempt++) {
        $r = Get-AdJson @("clipboard-set","--session",$s,"--agent-id",$id,"--image",$png)
        if (-not $r -or -not $r.ok) { $failReason = "clipboard-set code=$($r.error.code)"; Wlog "  $failReason"; if (-not (Heal-Session)) { return $null }; Start-Sleep -Milliseconds 500; continue }
        Start-Sleep -Milliseconds 700
        $r = Get-AdJson @("press","--session",$s,"--agent-id",$id,"--window-id",$W,"ctrl+v")
        if (-not $r -or -not $r.ok) { $failReason = "press code=$($r.error.code)"; Wlog "  $failReason"; continue }
        Start-Sleep -Milliseconds 2200
        if (-not (Set-Pos "X-position" $x)) { $failReason = "X fail (a$attempt)"; Wlog "  $failReason"; continue }
        if (-not (Set-Pos "Y-position" $y)) { $failReason = "Y fail (a$attempt)"; Wlog "  $failReason"; continue }
        Start-Sleep -Milliseconds 500
        $shot = "$root\shots\$name.png"
        $r = Get-AdJson @("screenshot","--session",$s,"--agent-id",$id,"--window-id",$W,"$shot")
        if (-not $r -or -not $r.ok) { $failReason = "screenshot code=$($r.error.code)"; Wlog "  $failReason"; continue }
        $ok = $true
    }
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    if ($ok) {
        if (Test-Path $item.FullName) {
            Move-Item -LiteralPath $item.FullName -Destination "$root\done\$name.json" -Force
            Set-Content -Path "$root\logs\$name.log" -Value "agent-id=$id`ntime=$ts`nx=$x`ny=$y`nstatus=done`nshot=$root\shots\$name.png`nsession=$s"
            Wlog "DONE $name"
            return "done"
        } else { Wlog "VANISHED $name"; return "vanish" }
    } else {
        if (Test-Path $item.FullName) {
            Move-Item -LiteralPath $item.FullName -Destination "$root\failed\$name.json" -Force
            Set-Content -Path "$root\logs\$name.log" -Value "agent-id=$id`ntime=$ts`nstatus=failed`nreason=$failReason"
            Wlog "FAILED $name : $failReason"
            return "failed"
        } else { Wlog "VANISHED-FAIL $name"; return "vanish" }
    }
}

Wlog "WATCH_START deadline=$($deadline.ToString('HH:mm:ss')) session=$s"
$processed = 0; $failedN = 0
while ((Get-Date) -lt $deadline) {
    $item = $null
    # lock
    $mine = $false
    while (-not $mine) {
        if (-not (Test-Path $lock)) {
            try { New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null; $mine = $true } catch {}
        }
        if (-not $mine) { Start-Sleep -Milliseconds (Get-Random -Minimum 200 -Maximum 600) }
    }
    try {
        $item = Get-ChildItem "$root\queue" -Filter *.json -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -First 1
        if (-not $item) { $item = Get-ChildItem "$root\queue_hold" -Filter *.json -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -First 1 }
        if (-not $item) {
            Remove-Item $lock -Force -Recurse
            Start-Sleep -Seconds 10
            continue
        }
        if (-not (Test-Session $s)) { Heal-Session | Out-Null }
        $res = Process-Item $item
        if ($res -eq "done") { $processed++ }
        elseif ($res -eq "failed") { $failedN++ }
    } finally {
        if (Test-Path $lock) { Remove-Item $lock -Force -Recurse }
    }
    Start-Sleep -Milliseconds 300
}
Wlog "WATCH_END processed=$processed failed=$failedN"
Write-Output "WATCHRESULT processed=$processed failed=$failedN"
