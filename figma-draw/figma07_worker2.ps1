$ad = "F:\new\agent-desktop-v1.1.0-x86_64-pc-windows-msvc\agent-desktop.exe"
$s = "run-1793853422648-43220-0"
$id = "figma-07"
$W = "w-1968004"
$root = "D:\ZYY Project\EduMind\figma-draw"
$lock = "$root\lock"
$runLog = "$root\logs\figma-07-rerun.log"
foreach ($d in @("done","failed","shots","logs")) {
    if (-not (Test-Path "$root\$d")) { New-Item -ItemType Directory -Path "$root\$d" | Out-Null }
}
function Wlog([string]$m) { Add-Content -Path $runLog -Value "[$(Get-Date -Format 'HH:mm:ss')] $m" }

function Get-AdJson([string[]]$A) {
    $raw = & $ad @A 2>&1 | Out-String
    try { return ($raw | ConvertFrom-Json) } catch { return $null }
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
            if ($code -eq "STALE_REF" -or $code -eq "TIMEOUT" -or $code -eq "ACTION_FAILED") { Start-Sleep -Milliseconds 400; continue }
            return $true
        }
        Wlog "  find $Field try${r}: no match"
        Start-Sleep -Milliseconds 400
    }
    return $false
}

Wlog "WORKER_START session=$s window=$W"
$processed = 0
$failedItems = @()

while ($true) {
    # 1. lock
    $mine = $false
    while (-not $mine) {
        if (-not (Test-Path $lock)) {
            try { New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null; $mine = $true } catch {}
        }
        if (-not $mine) { Start-Sleep -Milliseconds (Get-Random -Minimum 200 -Maximum 600) }
    }
    try {
        # 2. take item: queue_hold first, then queue
        $item = Get-ChildItem "$root\queue_hold" -Filter *.json -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -First 1
        if (-not $item) { $item = Get-ChildItem "$root\queue" -Filter *.json -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -First 1 }
        if (-not $item) { Wlog "QUEUE_EMPTY"; break }
        $j = Get-Content $item.FullName -Raw | ConvertFrom-Json
        $name = "$($j.name)"; $png = "$($j.png)"; $x = "$($j.x)"; $y = "$($j.y)"
        Wlog "START $name x=$x y=$y"

        $ok = $false; $failReason = ""
        for ($attempt = 1; $attempt -le 2 -and -not $ok; $attempt++) {
            # 3. paste
            $r = Get-AdJson @("clipboard-set","--session",$s,"--agent-id",$id,"--image",$png)
            if (-not $r -or -not $r.ok) { $failReason = "clipboard-set failed code=$($r.error.code)"; Wlog "  $failReason"; Start-Sleep -Milliseconds 500; continue }
            Start-Sleep -Milliseconds 700
            $r = Get-AdJson @("press","--session",$s,"--agent-id",$id,"--window-id",$W,"ctrl+v")
            if (-not $r -or -not $r.ok) { $failReason = "press ctrl+v failed code=$($r.error.code)"; Wlog "  $failReason"; continue }
            Start-Sleep -Milliseconds 2200

            # 4. position
            if (-not (Set-Pos "X-position" $x)) { $failReason = "X-position not found/set failed (attempt $attempt)"; Wlog "  $failReason"; continue }
            if (-not (Set-Pos "Y-position" $y)) { $failReason = "Y-position not found/set failed (attempt $attempt)"; Wlog "  $failReason"; continue }
            Start-Sleep -Milliseconds 500

            # 5. screenshot
            $shot = "$root\shots\$name.png"
            $r = Get-AdJson @("screenshot","--session",$s,"--agent-id",$id,"--window-id",$W,"$shot")
            if (-not $r -or -not $r.ok) { $failReason = "screenshot failed code=$($r.error.code)"; Wlog "  $failReason"; continue }
            $ok = $true
        }

        $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        if ($ok) {
            # 6. archive
            if (Test-Path $item.FullName) {
                Move-Item -LiteralPath $item.FullName -Destination "$root\done\$name.json" -Force
                Set-Content -Path "$root\logs\$name.log" -Value "agent-id=$id`ntime=$ts`nx=$x`ny=$y`nstatus=done`nshot=$root\shots\$name.png`nsession=$s"
                $processed++
                Wlog "DONE $name"
            } else {
                Wlog "SKIP $name (source file vanished - likely moved by lead)"
            }
        } else {
            if (Test-Path $item.FullName) {
                Move-Item -LiteralPath $item.FullName -Destination "$root\failed\$name.json" -Force
                Set-Content -Path "$root\logs\$name.log" -Value "agent-id=$id`ntime=$ts`nstatus=failed`nreason=$failReason"
                $failedItems += "$name : $failReason"
                Wlog "FAILED $name : $failReason"
            } else {
                Wlog "SKIP-FAIL $name (source vanished)"
            }
        }
    } finally {
        # 7. release lock
        if (Test-Path $lock) { Remove-Item $lock -Force -Recurse }
    }
}

Wlog "SUMMARY processed=$processed failed=$($failedItems.Count)"
Write-Output "PROCESSED=$processed"
Write-Output "FAILED=$($failedItems.Count)"
$failedItems | ForEach-Object { Write-Output "FAILDETAIL=$_" }
