# figma-06 worker v2 — 修正版
# 相对 v1 的关键修正（基于 run-1793849257572-7224-0 会话的实测）：
#  1) 每个工单开工前 restore + focus-window 确保 Figma 是精确前台窗口
#     （失焦时 press ctrl+v 报 STALE_REF exact_window_focus_unconfirmed，
#       set-value 虽 ok 但值不被 Chromium 接受，事后校验才发现）
#  2) set-value 绝不传 --window-id（INVALID_ARGS）
#  3) set-value 后重新 find 校验值真的变成目标值，未变则换新 ref 重试（最多 3 次）
#  4) 两次贴图+定位仍失败 → failed/，写日志，继续
# 铁律：全程无 --headed；键盘只用 press --window-id；不碰画布上其它图片。

$ad = "F:\new\agent-desktop-v1.1.0-x86_64-pc-windows-msvc\agent-desktop.exe"
$s = "run-1793849257572-7224-0"
$aid = "figma-06"
$W = "w-1968004"
$root = "D:\ZYY Project\EduMind\figma-draw"
$lock = "$root\lock"
$doneList = @()
$failList = @()

function Resolve-Window {
    param([string]$Cur)
    $r = & $ad list-windows --session $s --agent-id $aid 2>&1 | Out-String
    try { $j = $r | ConvertFrom-Json } catch { return $Cur }
    if ($j.ok) {
        foreach ($w in $j.data) {
            if ($w.title -like "*Untitled*Figma*") { return $w.id }
        }
    }
    return $Cur
}

function Ensure-Foreground {
    # restore + focus-window，带重试；返回最终窗口 id
    for ($i = 1; $i -le 3; $i++) {
        & $ad restore --session $s --agent-id $aid --window-id $W 2>&1 | Out-Null
        $f = & $ad focus-window --session $s --agent-id $aid --window-id $W 2>&1 | Out-String
        try { $fj = $f | ConvertFrom-Json } catch { $fj = $null }
        if ($fj -and $fj.ok) { return }
        Start-Sleep -Milliseconds 500
    }
    $script:W = Resolve-Window $script:W
}

function Find-Spin {
    param([string]$Name)
    $out = & $ad find --session $s --agent-id $aid --window-id $W --role spinbutton --name $Name 2>&1 | Out-String
    try { $j = $out | ConvertFrom-Json } catch { return $null }
    if ($j.ok -and $j.data.matches -and $j.data.matches.Count -gt 0) {
        return @{ ref = $j.data.matches[0].ref_id; value = $j.data.matches[0].value }
    }
    return $null
}

function Set-And-Verify {
    param([string]$Field, [string]$Val)
    for ($r = 1; $r -le 3; $r++) {
        $m = Find-Spin $Field
        if (-not $m) { Start-Sleep -Milliseconds 400; continue }
        & $ad set-value --session $s --agent-id $aid $m.ref $Val 2>&1 | Out-Null
        Start-Sleep -Milliseconds 350
        $m2 = Find-Spin $Field
        if ($m2 -and "$($m2.value)" -eq "$Val") { return $true }
    }
    return $false
}

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
        # 2. take item
        $item = Get-ChildItem -Path "$root\queue" -Filter *.json | Sort-Object Name | Select-Object -First 1
        if (-not $item) { Write-Output "[figma-06] queue empty, exit"; break }

        try {
            $j = Get-Content $item.FullName -Raw | ConvertFrom-Json
            $name = $j.name; $png = $j.png; $x = [string]$j.x; $y = [string]$j.y
            Write-Output "[figma-06] processing $name (x=$x y=$y)"

            $ok = $false
            for ($attempt = 1; $attempt -le 2 -and -not $ok; $attempt++) {
                # 每轮开工前确保 Figma 前台
                Ensure-Foreground
                # 3. paste
                & $ad clipboard-set --session $s --agent-id $aid --image $png | Out-Null
                Start-Sleep -Milliseconds 700
                $pv = & $ad press --session $s --agent-id $aid --window-id $W ctrl+v 2>&1 | Out-String
                Start-Sleep -Milliseconds 2200
                # 4. position + verify
                if (Set-And-Verify "X-position" $x) {
                    if (Set-And-Verify "Y-position" $y) {
                        Start-Sleep -Milliseconds 500
                        $ok = $true
                    }
                }
                if (-not $ok) { Write-Output "[figma-06] $name attempt $attempt failed, will retry paste" }
            }

            if (-not $ok) {
                Move-Item $item.FullName "$root\failed\$name.json" -Force
                Set-Content "$root\logs\$name.log" "agent-id=$aid`ntime=$(Get-Date -Format o)`nname=$name`nstatus=failed`nreason=position set-value verification failed after 2 paste attempts (check Figma foreground)"
                $failList += $name
                Write-Output "[figma-06] $name FAILED"
                continue
            }

            # 5. screenshot
            & $ad screenshot --session $s --agent-id $aid --window-id $W "$root\shots\$name.png" | Out-Null
            # 6. archive
            Move-Item $item.FullName "$root\done\$name.json" -Force
            Set-Content "$root\logs\$name.log" "agent-id=$aid`ntime=$(Get-Date -Format o)`nname=$name`nx=$x`ny=$y`nstatus=done`nscreenshot=$root\shots\$name.png"
            $doneList += $name
            Write-Output "[figma-06] $name DONE"
        }
        catch {
            $name2 = "unknown"
            try { $name2 = (Get-Content $item.FullName -Raw | ConvertFrom-Json).name } catch {}
            Move-Item $item.FullName "$root\failed\$name2.json" -Force -ErrorAction SilentlyContinue
            Set-Content "$root\logs\$name2.log" "agent-id=$aid`ntime=$(Get-Date -Format o)`nname=$name2`nstatus=failed`nreason=exception: $($_.Exception.Message)" -ErrorAction SilentlyContinue
            $failList += $name2
            Write-Output "[figma-06] $name2 FAILED (exception)"
        }
    }
    finally {
        Remove-Item $lock -Force -Recurse -ErrorAction SilentlyContinue
    }
}

Write-Output "[figma-06] RESULT processed=$($doneList.Count) failed=$($failList.Count)"
Write-Output "[figma-06] done: $($doneList -join ', ')"
Write-Output "[figma-06] failed: $($failList -join ', ')"
