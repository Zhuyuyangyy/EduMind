$ad = "F:\new\agent-desktop-v1.1.0-x86_64-pc-windows-msvc\agent-desktop.exe"
$s = "run-1793849257572-7224-0"
$id = "figma-07"
$W = "w-1968004"
$root = "D:\ZYY Project\EduMind\figma-draw"
$lock = "$root\lock"
foreach ($d in @("done","failed","shots","logs")) {
    if (-not (Test-Path "$root\$d")) { New-Item -ItemType Directory -Path "$root\$d" | Out-Null }
}

$processed = 0
$failedList = @()

function Set-Pos {
    param([string]$Field, [string]$Value)
    for ($r = 1; $r -le 3; $r++) {
        $findOut = (& $ad find --session $s --agent-id $id --window-id $W --role spinbutton --name $Field) | Out-String
        try { $fj = $findOut | ConvertFrom-Json } catch { $fj = $null }
        if ($fj -and $fj.ok -and $fj.data.matches.Count -gt 0) {
            $ref = $fj.data.matches[0].ref_id
            $setOut = (& $ad set-value --session $s --agent-id $id "$ref" "$Value") | Out-String
            try { $sj = $setOut | ConvertFrom-Json } catch { $sj = $null }
            if ($sj -and $sj.ok) { return $true }
            if ($sj -and $sj.error.code -eq "STALE_REF" -or $sj.error.code -eq "TIMEOUT") {
                Start-Sleep -Milliseconds 400
                continue
            }
            return $true
        }
        Start-Sleep -Milliseconds 400
    }
    return $false
}

while ($true) {
    # 1. acquire lock
    $mine = $false
    while (-not $mine) {
        if (-not (Test-Path $lock)) {
            try { New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null; $mine = $true } catch {}
        }
        if (-not $mine) { Start-Sleep -Milliseconds (Get-Random -Minimum 200 -Maximum 600) }
    }

    try {
        # 2. take first item
        $item = Get-ChildItem "$root\queue\" -Filter *.json | Sort-Object Name | Select-Object -First 1
        if (-not $item) { break }
        $data = Get-Content $item.FullName -Raw | ConvertFrom-Json
        $name = $data.name
        $png = $data.png
        $x = "$($data.x)"
        $y = "$($data.y)"
        $ok = $false
        $failReason = ""

        # 3+4 with one re-paste retry
        for ($attempt = 1; $attempt -le 2 -and -not $ok; $attempt++) {
            & $ad clipboard-set --session $s --agent-id $id --image "$png" | Out-Null
            Start-Sleep -Milliseconds 700
            & $ad press --session $s --agent-id $id --window-id $W ctrl+v | Out-Null
            Start-Sleep -Milliseconds 2200

            $xok = Set-Pos -Field "X-position" -Value $x
            if (-not $xok) {
                $failReason = "X-position spinbutton not found after paste (attempt $attempt)"
                continue
            }
            $yok = Set-Pos -Field "Y-position" -Value $y
            if (-not $yok) {
                $failReason = "Y-position spinbutton not found (attempt $attempt)"
                continue
            }
            Start-Sleep -Milliseconds 500
            $ok = $true
        }

        $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        if ($ok) {
            # 5. screenshot
            & $ad screenshot --session $s --agent-id $id --window-id $W "$root\shots\$name.png" | Out-Null
            # 6. archive
            Move-Item $item.FullName "$root\done\$name.json" -Force
            Set-Content "$root\logs\$name.log" "agent-id=$id`ntime=$ts`nx=$x`ny=$y`nstatus=done"
            $processed++
            Write-Output "DONE $name x=$x y=$y"
        } else {
            Move-Item $item.FullName "$root\failed\$name.json" -Force
            Set-Content "$root\logs\$name.log" "agent-id=$id`ntime=$ts`nstatus=failed`nreason=$failReason"
            $failedList += "$name : $failReason"
            Write-Output "FAILED $name : $failReason"
        }
    } finally {
        # 7. release lock
        if (Test-Path $lock) { Remove-Item $lock -Force -Recurse }
    }
}

Write-Output "=== SUMMARY processed=$processed failed=$($failedList.Count) ==="
$failedList | ForEach-Object { Write-Output $_ }
