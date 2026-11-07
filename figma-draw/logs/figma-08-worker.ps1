$ad = "F:\new\agent-desktop-v1.1.0-x86_64-pc-windows-msvc\agent-desktop.exe"
$s  = "run-1793849257572-7224-0"
$id = "figma-08"
$W  = "w-1968004"
$root = "D:\ZYY Project\EduMind\figma-draw"
$lock = "$root\lock"
$queue = "$root\queue"
$doneDir = "$root\done"
$failedDir = "$root\failed"
$shots = "$root\shots"
$logs = "$root\logs"

foreach ($d in @($doneDir, $failedDir, $shots, $logs)) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

$report = New-Object System.Collections.Generic.List[string]

function Invoke-Ad {
    param([string[]]$AdArgs)
    $out = & $ad @AdArgs 2>&1 | Out-String
    try { return ($out | ConvertFrom-Json) }
    catch { return [pscustomobject]@{ ok = $false; error = [pscustomobject]@{ code = "PARSE_ERROR"; message = $out } } }
}

while ($true) {
    # 1. 持锁（目录锁，串行 lease）
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
        if (-not $item) { break }
        $j = Get-Content -LiteralPath $item.FullName -Raw | ConvertFrom-Json
        $name = "$($j.name)"; $png = "$($j.png)"; $x = "$($j.x)"; $y = "$($j.y)"

        $ok = $false
        for ($attempt = 1; $attempt -le 2 -and -not $ok; $attempt++) {
            # 3. 贴图
            $null = Invoke-Ad @("clipboard-set","--session",$s,"--agent-id",$id,"--image",$png)
            Start-Sleep -Milliseconds 700
            $null = Invoke-Ad @("press","--session",$s,"--agent-id",$id,"--window-id",$W,"ctrl+v")
            Start-Sleep -Milliseconds 2200

            # 4. 定位 X（STALE_REF/TIMEOUT 最多重试 3 次，每次重新 find）
            $xref = $null
            for ($r = 1; $r -le 3 -and -not $xref; $r++) {
                $f = Invoke-Ad @("find","--session",$s,"--agent-id",$id,"--window-id",$W,"--role","spinbutton","--name","X-position")
                if ($f.ok -and $f.data.matches -and $f.data.matches.Count -gt 0) { $xref = "$($f.data.matches[0].ref_id)" }
                else { Start-Sleep -Milliseconds 500 }
            }
            if (-not $xref) { continue }

            # 定位 Y
            $yref = $null
            for ($r = 1; $r -le 3 -and -not $yref; $r++) {
                $f = Invoke-Ad @("find","--session",$s,"--agent-id",$id,"--window-id",$W,"--role","spinbutton","--name","Y-position")
                if ($f.ok -and $f.data.matches -and $f.data.matches.Count -gt 0) { $yref = "$($f.data.matches[0].ref_id)" }
                else { Start-Sleep -Milliseconds 500 }
            }
            if (-not $yref) { continue }

            $sv  = Invoke-Ad @("set-value","--session",$s,"--agent-id",$id,$xref,$x)
            Start-Sleep -Milliseconds 200
            $sv2 = Invoke-Ad @("set-value","--session",$s,"--agent-id",$id,$yref,$y)
            if ($sv.ok -and $sv2.ok) { $ok = $true } else { Start-Sleep -Milliseconds 500 }
        }

        $ts = (Get-Date).ToString("o")
        if ($ok) {
            Start-Sleep -Milliseconds 500
            # 5. 验收截图
            $shotOk = $false
            for ($r = 1; $r -le 3 -and -not $shotOk; $r++) {
                $sc = Invoke-Ad @("screenshot","--session",$s,"--agent-id",$id,"--window-id",$W,"$shots\$name.png")
                if ($sc.ok) { $shotOk = $true } else { Start-Sleep -Milliseconds 500 }
            }
            # 6. 归档
            Move-Item -LiteralPath $item.FullName -Destination "$doneDir\$name.json" -Force
            Set-Content -LiteralPath "$logs\$name.log" -Value "agent-id=figma-08`ntime=$ts`nstatus=done`nx=$x`ny=$y`nscreenshot_ok=$shotOk"
            $report.Add("DONE  $name (x=$x y=$y screenshot_ok=$shotOk)")
        } else {
            Move-Item -LiteralPath $item.FullName -Destination "$failedDir\$name.json" -Force
            Set-Content -LiteralPath "$logs\$name.log" -Value "agent-id=figma-08`ntime=$ts`nstatus=failed`nreason=X-position spinbutton not found after 2 paste attempts"
            $report.Add("FAIL  $name (X-position spinbutton not found after 2 paste attempts)")
        }
    } finally {
        # 7. 释放锁
        Remove-Item -LiteralPath $lock -Force -Recurse -ErrorAction SilentlyContinue
    }
}

"REPORT_START"
$report | ForEach-Object { $_ }
"REPORT_END"
