$ad = "F:\new\agent-desktop-v1.1.0-x86_64-pc-windows-msvc\agent-desktop.exe"
$s = "run-1793849257572-7224-0"
$aid = "figma-06"
$w = "w-1968004"
$root = "D:\ZYY Project\EduMind\figma-draw"
$lock = "$root\lock"
$doneList = @()
$failList = @()

function Find-SpinRef {
    param([string]$Name)
    $out = & $ad find --session $s --agent-id $aid --window-id $w --role spinbutton --name $Name 2>&1 | Out-String
    try { $j = $out | ConvertFrom-Json } catch { return $null }
    if ($j.ok -eq $true -and $j.data.matches -and $j.data.matches.Count -gt 0) {
        return $j.data.matches[0].ref_id
    }
    return $null
}

function Set-SpinValue {
    param([string]$Ref, [string]$Val)
    $out = & $ad set-value --session $s --agent-id $aid --window-id $w $Ref $Val 2>&1 | Out-String
    try { $j = $out | ConvertFrom-Json; return ($j.ok -eq $true) } catch { return $false }
}

while ($true) {
    # 1. acquire lock (try-create and detect truly created by me)
    $mine = $false
    while (-not $mine) {
        if (-not (Test-Path $lock)) {
            try { New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null; $mine = $true } catch {}
        }
        if (-not $mine) { Start-Sleep -Milliseconds (Get-Random -Minimum 200 -Maximum 600) }
    }

    try {
        # 2. take first queue item
        $item = Get-ChildItem -Path "$root\queue" -Filter *.json | Sort-Object Name | Select-Object -First 1
        if (-not $item) { Write-Output "[figma-06] queue empty, exit"; break }

        try {
            $j = Get-Content $item.FullName -Raw | ConvertFrom-Json
            $name = $j.name; $png = $j.png; $x = [string]$j.x; $y = [string]$j.y
            Write-Output "[figma-06] processing $name (x=$x y=$y)"

            # 3. paste image (attempt 1, retry once = up to 2 pastes)
            $xref = $null
            for ($attempt = 1; $attempt -le 2 -and -not $xref; $attempt++) {
                & $ad clipboard-set --session $s --agent-id $aid --image $png | Out-Null
                Start-Sleep -Milliseconds 700
                & $ad press --session $s --agent-id $aid --window-id $w ctrl+v | Out-Null
                Start-Sleep -Milliseconds 2200
                $xref = Find-SpinRef "X-position"
                if (-not $xref) { Write-Output "[figma-06] $name paste attempt ${attempt}: X-position not found" }
            }

            if (-not $xref) {
                Move-Item $item.FullName "$root\failed\$name.json" -Force
                $logText = "agent-id=figma-06`ntime=$(Get-Date -Format o)`nname=$name`nstatus=failed`nreason=X-position spinbutton not found after 2 paste attempts (image did not land on canvas)"
                Set-Content -Path "$root\logs\$name.log" -Value $logText
                $failList += $name
                Write-Output "[figma-06] $name FAILED (no X-position)"
                continue
            }

            # 4. position X (retry stale ref up to 3)
            $okx = $false
            for ($r = 1; $r -le 3 -and -not $okx; $r++) {
                if ($r -gt 1) { $xref = Find-SpinRef "X-position" }
                if ($xref) { $okx = Set-SpinValue $xref $x } else { Start-Sleep -Milliseconds 400 }
            }
            # position Y
            $yref = $null
            for ($r = 1; $r -le 3 -and -not $yref; $r++) {
                $yref = Find-SpinRef "Y-position"
                if (-not $yref) { Start-Sleep -Milliseconds 400 }
            }
            $oky = $false
            for ($r = 1; $r -le 3 -and -not $oky; $r++) {
                if ($r -gt 1) { $yref = Find-SpinRef "Y-position" }
                if ($yref) { $oky = Set-SpinValue $yref $y } else { Start-Sleep -Milliseconds 400 }
            }
            Start-Sleep -Milliseconds 500

            if (-not ($okx -and $oky)) {
                Move-Item $item.FullName "$root\failed\$name.json" -Force
                $logText = "agent-id=figma-06`ntime=$(Get-Date -Format o)`nname=$name`nstatus=failed`nreason=set-value failed okx=$okx oky=$oky after retries"
                Set-Content -Path "$root\logs\$name.log" -Value $logText
                $failList += $name
                Write-Output "[figma-06] $name FAILED (set-value)"
                continue
            }

            # 5. screenshot
            & $ad screenshot --session $s --agent-id $aid --window-id $w "$root\shots\$name.png" | Out-Null

            # 6. archive
            Move-Item $item.FullName "$root\done\$name.json" -Force
            $logText = "agent-id=figma-06`ntime=$(Get-Date -Format o)`nname=$name`nx=$x`ny=$y`nstatus=done`nscreenshot=$root\shots\$name.png"
            Set-Content -Path "$root\logs\$name.log" -Value $logText
            $doneList += $name
            Write-Output "[figma-06] $name DONE"
        }
        catch {
            $name2 = "unknown"
            try { $name2 = (Get-Content $item.FullName -Raw | ConvertFrom-Json).name } catch {}
            Move-Item $item.FullName "$root\failed\$name2.json" -Force -ErrorAction SilentlyContinue
            $logText = "agent-id=figma-06`ntime=$(Get-Date -Format o)`nname=$name2`nstatus=failed`nreason=exception: $($_.Exception.Message)"
            Set-Content -Path "$root\logs\$name2.log" -Value $logText -ErrorAction SilentlyContinue
            $failList += $name2
            Write-Output "[figma-06] $name2 FAILED (exception: $($_.Exception.Message))"
        }
    }
    finally {
        # 7. release lock
        Remove-Item $lock -Force -Recurse -ErrorAction SilentlyContinue
    }
}

Write-Output "[figma-06] RESULT processed=$($doneList.Count) failed=$($failList.Count)"
Write-Output "[figma-06] done: $($doneList -join ', ')"
Write-Output "[figma-06] failed: $($failList -join ', ')"
