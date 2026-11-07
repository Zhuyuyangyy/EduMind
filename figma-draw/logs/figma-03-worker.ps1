param([int]$MaxItems = 100)

$ad = "F:\new\agent-desktop-v1.1.0-x86_64-pc-windows-msvc\agent-desktop.exe"
$s = "run-1793849257572-7224-0"
$aid = "figma-03"
$W = "w-1968004"
$root = "D:\ZYY Project\EduMind\figma-draw"
$queue = Join-Path $root "queue"
$done = Join-Path $root "done"
$failed = Join-Path $root "failed"
$logs = Join-Path $root "logs"
$shots = Join-Path $root "shots"
$lock = Join-Path $root "lock"

foreach ($d in @($done, $failed, $logs, $shots)) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

function Invoke-Ad {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
    $out = & $ad @Args 2>&1 | Out-String
    $out = $out.Trim()
    if ($out -like '*{*') {
        try { return ($out | ConvertFrom-Json) } catch { return $null }
    }
    return $null
}

$okCount = 0
$failCount = 0

for ($i = 0; $i -lt $MaxItems; $i++) {
    # 1. 持锁
    $mine = $false
    while (-not $mine) {
        if (-not (Test-Path $lock)) {
            try { New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null; $mine = $true } catch {}
        }
        if (-not $mine) { Start-Sleep -Milliseconds (Get-Random -Minimum 200 -Maximum 600) }
    }
    try {
        # 2. 取件
        $item = Get-ChildItem -Path $queue -Filter *.json | Sort-Object Name | Select-Object -First 1
        if (-not $item) { Write-Output "QUEUE_EMPTY"; break }
        $j = Get-Content $item.FullName -Raw | ConvertFrom-Json
        $name = $j.name; $png = $j.png; $x = $j.x; $y = $j.y
        Write-Output "PROCESS $name x=$x y=$y"

        # 3+4. 贴图 + 定位（最多两次贴图尝试）
        $pasteOk = $false
        $xref = $null
        for ($attempt = 1; $attempt -le 2 -and -not $pasteOk; $attempt++) {
            $r = Invoke-Ad clipboard-set --session $s --agent-id $aid --image $png
            if (-not $r -or -not $r.ok) { Write-Output "  clipboard-set FAIL attempt=$attempt"; Start-Sleep -Milliseconds 500; continue }
            Start-Sleep -Milliseconds 700
            $pressOk = $false
            for ($t = 1; $t -le 3; $t++) {
                $fw = Invoke-Ad focus-window --session $s --agent-id $aid --window-id $W
                if (-not $fw -or -not $fw.ok) { Start-Sleep -Milliseconds 300; continue }
                $r = Invoke-Ad press --session $s --agent-id $aid --window-id $W ctrl+v
                if ($r -and $r.ok) { $pressOk = $true; break }
                if ($r -and $r.error.code -in @("STALE_REF", "TIMEOUT")) { Start-Sleep -Milliseconds 400; continue }
                break
            }
            if (-not $pressOk) { Write-Output "  press FAIL attempt=$attempt"; continue }
            Start-Sleep -Milliseconds 2200
            for ($t = 1; $t -le 3; $t++) {
                $f = Invoke-Ad find --session $s --agent-id $aid --window-id $W --role spinbutton --name "X-position"
                if ($f -and $f.ok -and $f.data.matches.Count -ge 1) { $xref = $f.data.matches[0].ref_id; break }
                Start-Sleep -Milliseconds 400
            }
            if ($xref) { $pasteOk = $true }
            else { Write-Output "  X-position NOT FOUND attempt=$attempt" }
        }
        if (-not $pasteOk) {
            Move-Item -Path $item.FullName -Destination (Join-Path $failed "$name.json") -Force
            $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            Set-Content -Path (Join-Path $logs "$name.log") -Value "agent=$aid`ntime=$ts`nstatus=failed`nreason=X-position spinbutton not found after 2 paste attempts (image did not land)"
            $failCount++
            Write-Output "  -> failed\$name.json"
            continue
        }

        # 4b. Y-position
        $yref = $null
        for ($t = 1; $t -le 3; $t++) {
            $f = Invoke-Ad find --session $s --agent-id $aid --window-id $W --role spinbutton --name "Y-position"
            if ($f -and $f.ok -and $f.data.matches.Count -ge 1) { $yref = $f.data.matches[0].ref_id; break }
            Start-Sleep -Milliseconds 400
        }
        if (-not $yref) {
            Move-Item -Path $item.FullName -Destination (Join-Path $failed "$name.json") -Force
            $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            Set-Content -Path (Join-Path $logs "$name.log") -Value "agent=$aid`ntime=$ts`nstatus=failed`nreason=Y-position spinbutton not found"
            $failCount++
            Write-Output "  -> failed\$name.json"
            continue
        }

        # 4c. set-value X / Y（STALE_REF/TIMEOUT 重新 find 重试，最多 3 次）
        for ($t = 1; $t -le 3; $t++) {
            $r = Invoke-Ad set-value --session $s --agent-id $aid $xref ([string]$x)
            if ($r -and $r.ok) { break }
            if ($r -and $r.error.code -in @("STALE_REF", "TIMEOUT")) {
                $f = Invoke-Ad find --session $s --agent-id $aid --window-id $W --role spinbutton --name "X-position"
                if ($f -and $f.ok -and $f.data.matches.Count -ge 1) { $xref = $f.data.matches[0].ref_id }
                continue
            }
            break
        }
        for ($t = 1; $t -le 3; $t++) {
            $r = Invoke-Ad set-value --session $s --agent-id $aid $yref ([string]$y)
            if ($r -and $r.ok) { break }
            if ($r -and $r.error.code -in @("STALE_REF", "TIMEOUT")) {
                $f = Invoke-Ad find --session $s --agent-id $aid --window-id $W --role spinbutton --name "Y-position"
                if ($f -and $f.ok -and $f.data.matches.Count -ge 1) { $yref = $f.data.matches[0].ref_id }
                continue
            }
            break
        }
        Start-Sleep -Milliseconds 500

        # 5. 验收截图
        $shot = Join-Path $shots "$name.png"
        for ($t = 1; $t -le 3; $t++) {
            $r = Invoke-Ad screenshot --session $s --agent-id $aid --window-id $W $shot
            if ($r -and $r.ok) { break }
            Start-Sleep -Milliseconds 400
        }

        # 6. 归档 + 日志
        Move-Item -Path $item.FullName -Destination (Join-Path $done "$name.json") -Force
        $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Set-Content -Path (Join-Path $logs "$name.log") -Value "agent=$aid`ntime=$ts`nx=$x`ny=$y`nstatus=ok"
        $okCount++
        Write-Output "  -> done\$name.json (ok)"
    }
    finally {
        # 7. 释放锁
        if (Test-Path $lock) { Remove-Item $lock -Force -Recurse }
    }
}
Write-Output "SUMMARY ok=$okCount failed=$failCount"
