# figma-02 worker v2 — rerun session run-1793853538914-43904-0
# 相对 round1 的关键修正（基于 round1 实测 + figma-06 v2 现场经验）：
#  1) 旧会话 run-1793849257572-7224-0 已被 lead 于 12:34:14 结束（session_ended），
#     本 worker 使用 figma-02 自建 rerun 会话 run-1793853538914-43904-0
#  2) set-value 绝不传 --window-id（该命令无此 flag，传了 INVALID_ARGS —— round1 figma-06 21 连败根因）
#  3) set-value 后重新 find 校验值真的变成目标值，未变则换新 ref 重试（最多 4 次）
#  4) 每轮贴图前 Ensure-Foreground（restore + focus-window，纯语义动作，不动物理鼠标/键盘）
#  5) restock-wait：queue 空则等待；150s 仍空且 queue_hold 有料 → 自行 move 回 queue（move 天然防重）
#  6) WINDOW_NOT_FOUND → list-windows 重解析标题含 "Untitled – Figma" 的窗口
# 铁律：全程无 --headed；键盘只用 press --window-id；不碰画布上其它图片；锁外不取件。

$ad = "F:\new\agent-desktop-v1.1.0-x86_64-pc-windows-msvc\agent-desktop.exe"
$s = "run-1793853538914-43904-0"
$id = "figma-02"
$script:W = "w-1968004"
$root = "D:\ZYY Project\EduMind\figma-draw"
$lock = "$root\lock"
$runLog = "$root\logs\figma-02-run.log"
$script:doneCount = 0
$script:failCount = 0

function Write-Run([string]$msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $runLog -Value "[$ts] $msg"
}

function Get-AdJson {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
    $out = & $ad @Args 2>&1 | Out-String
    if ($out -like '*{*') { try { return ($out | ConvertFrom-Json) } catch { return $null } }
    return $null
}

function Resolve-Window {
    $r = Get-AdJson list-windows --session $s --agent-id $id
    if ($r -and $r.ok) {
        foreach ($w in $r.data) { if ($w.title -like "*Untitled*Figma*") { return $w.id } }
    }
    return $script:W
}

function Ensure-Foreground {
    for ($i = 1; $i -le 3; $i++) {
        & $ad restore --session $s --agent-id $id --window-id $script:W 2>&1 | Out-Null
        $f = Get-AdJson focus-window --session $s --agent-id $id --window-id $script:W
        if ($f -and $f.ok) { return $true }
        Start-Sleep -Milliseconds 500
    }
    $script:W = Resolve-Window
    return $false
}

function Find-Spin {
    param([string]$Name)
    for ($t = 1; $t -le 3; $t++) {
        $r = Get-AdJson find --session $s --agent-id $id --window-id $script:W --role spinbutton --name $Name --timeout-ms 6000
        if ($r -and $r.ok -and $r.data.matches -and $r.data.matches.Count -ge 1) {
            return @{ ref = $r.data.matches[0].ref_id; value = $r.data.matches[0].value }
        }
        if ($r -and $r.error.code -eq "WINDOW_NOT_FOUND") { $script:W = Resolve-Window; continue }
        Start-Sleep -Milliseconds 400
    }
    return $null
}

function Set-And-Verify {
    param([string]$Field, [string]$Val)
    for ($r = 1; $r -le 4; $r++) {
        $m = Find-Spin $Field
        if (-not $m) { Start-Sleep -Milliseconds 400; continue }
        if ("$($m.value)" -eq "$Val") { return $true }
        $sv = Get-AdJson set-value --session $s --agent-id $id $m.ref $Val
        Start-Sleep -Milliseconds 350
        $m2 = Find-Spin $Field
        if ($m2 -and "$($m2.value)" -eq "$Val") { return $true }
        if ($r -eq 2) { Ensure-Foreground | Out-Null }
    }
    return $false
}

function Process-Item {
    param($ItemPath)
    $j = Get-Content $ItemPath -Raw | ConvertFrom-Json
    $name = $j.name; $png = $j.png; $x = [string]$j.x; $y = [string]$j.y
    Write-Run "PROCESSING $name x=$x y=$y"
    $ok = $false; $err = ""
    for ($attempt = 1; $attempt -le 2 -and -not $ok; $attempt++) {
        Ensure-Foreground | Out-Null
        $cs = Get-AdJson clipboard-set --session $s --agent-id $id --image $png
        if (-not $cs -or -not $cs.ok) { $err = "clipboard-set failed (attempt $attempt)"; Start-Sleep -Milliseconds 500; continue }
        Start-Sleep -Milliseconds 700
        $pressed = $false
        for ($t = 1; $t -le 3 -and -not $pressed; $t++) {
            $pv = Get-AdJson press --session $s --agent-id $id --window-id $script:W ctrl+v
            if ($pv -and $pv.ok) { $pressed = $true }
            elseif ($pv -and $pv.error.code -eq "WINDOW_NOT_FOUND") { $script:W = Resolve-Window }
            elseif ($pv -and ($pv.error.code -in @("STALE_REF","TIMEOUT"))) { Ensure-Foreground | Out-Null; Start-Sleep -Milliseconds 400 }
            else { break }
        }
        if (-not $pressed) { $err = "press ctrl+v failed (attempt $attempt)"; continue }
        Start-Sleep -Milliseconds 2200
        if (-not (Find-Spin "X-position")) { $err = "X-position not found (attempt $attempt)"; continue }
        if (Set-And-Verify "X-position" $x) {
            if (Set-And-Verify "Y-position" $y) {
                Start-Sleep -Milliseconds 500
                $ok = $true
            } else { $err = "Y-position set/verify failed (attempt $attempt)" }
        } else { $err = "X-position set/verify failed (attempt $attempt)" }
        if (-not $ok) { Write-Run "  attempt $attempt failed: $err" }
    }
    if ($ok) {
        $shot = "$root\shots\$name.png"
        for ($t = 1; $t -le 3; $t++) {
            $sr = Get-AdJson screenshot --session $s --agent-id $id --window-id $script:W $shot
            if ($sr -and $sr.ok) { break }
            Start-Sleep -Milliseconds 400
        }
        Move-Item -Path $ItemPath -Destination "$root\done\$name.json" -Force
        $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Set-Content -Path "$root\logs\$name.log" -Value "agent-id=$id`ntime=$ts`nname=$name`nx=$x`ny=$y`nstatus=done`npng=$png`nscreenshot=$shot`nsession=$s"
        $script:doneCount++
        Write-Run "DONE $name"
    } else {
        Move-Item -Path $ItemPath -Destination "$root\failed\$name.json" -Force
        $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Set-Content -Path "$root\logs\$name.log" -Value "agent-id=$id`ntime=$ts`nname=$name`nstatus=failed`nreason=$err`nsession=$s"
        $script:failCount++
        Write-Run "FAILED $name : $err"
    }
}

foreach ($d in @("queue","done","failed","shots","logs")) {
    if (-not (Test-Path "$root\$d")) { New-Item -ItemType Directory -Path "$root\$d" -Force | Out-Null }
}

Write-Run "WORKER_START session=$s window=$script:W (restock-wait mode)"

$restocked = $false
$idleSince = $null
while ($true) {
    $item = Get-ChildItem -Path "$root\queue" -Filter *.json -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -First 1
    if (-not $item) {
        if (-not $idleSince) { $idleSince = Get-Date; Write-Run "QUEUE_EMPTY, waiting for restock" }
        $idleSec = ((Get-Date) - $idleSince).TotalSeconds
        if (-not $restocked -and $idleSec -ge 150) {
            $hold = Get-ChildItem -Path "$root\queue_hold" -Filter *.json -ErrorAction SilentlyContinue
            if ($hold) {
                $n = 0
                foreach ($h in $hold) { try { Move-Item -Path $h.FullName -Destination "$root\queue\$($h.Name)" -Force -ErrorAction Stop; $n++ } catch {} }
                Write-Run "RESTOCKED $n items from queue_hold"
                $restocked = $true
                $idleSince = $null
                continue
            }
        }
        if ($idleSec -ge 420) { Write-Run "IDLE_EXIT after $([int]$idleSec)s"; break }
        Start-Sleep -Seconds 3
        continue
    }
    $idleSince = $null
    $mine = $false
    while (-not $mine) {
        if (-not (Test-Path $lock)) {
            try { New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null; $mine = $true } catch {}
        }
        if (-not $mine) { Start-Sleep -Milliseconds (Get-Random -Minimum 200 -Maximum 600) }
    }
    try {
        $item2 = Get-ChildItem -Path "$root\queue" -Filter *.json -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -First 1
        if ($item2) { Process-Item $item2.FullName }
    } catch {
        $nm = "unknown"
        try { $nm = (Get-Content $item2.FullName -Raw | ConvertFrom-Json).name } catch {}
        try {
            Move-Item -Path $item2.FullName -Destination "$root\failed\$nm.json" -Force -ErrorAction SilentlyContinue
            Set-Content -Path "$root\logs\$nm.log" -Value "agent-id=$id`ntime=$(Get-Date -Format o)`nname=$nm`nstatus=failed`nreason=exception: $($_.Exception.Message)" -ErrorAction SilentlyContinue
        } catch {}
        $script:failCount++
        Write-Run "EXCEPTION on ${nm}: $($_.Exception.Message)"
    } finally {
        Remove-Item $lock -Force -Recurse -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 200
}

Write-Run "EXIT processed=$doneCount failed=$failCount"
Write-Output "SUMMARY processed=$doneCount failed=$failCount"
