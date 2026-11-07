# figma-02 wave-3 worker — session run-1793853538914-43904-0（auto-heal）
# 汇集三个会话的现场实测修正：
#  1) 会话自愈：session_ended → 自动 session start 新会话并重试
#  2) 每轮贴图前 press escape（解除 spinbutton 焦点，否则 ctrl+v 粘不进画布）
#  3) 贴图上岸校验：chit hash 变化（find --role image，name 含 "chit for *"）；首贴无 chit 时回落 X-position 判定
#  4) set-value 绝不传 --window-id；set 后 press return 提交，再 find 回读校验值==目标（最多 4 轮）
#  5) WINDOW_NOT_FOUND 自动 list-windows 换窗口 id
#  6) 取件源顺序：queue/ → .storage-9f3a7c(lead 暂存) → queue_hold/ → .figma-parked-queue
#  7) 每件全程持协议锁；取件只取引用，done/failed 时才 move（VANISHED 防护）
# 铁律：全程无 --headed；键盘只用 press --window-id；不碰别人刚贴的图。

$ad = "F:\new\agent-desktop-v1.1.0-x86_64-pc-windows-msvc\agent-desktop.exe"
$aid = "figma-02"
$script:W = "w-1968004"
$script:s = "run-1793853538914-43904-0"
$root = "D:\ZYY Project\EduMind\figma-draw"
$lock = "$root\lock"
$runLog = "$root\logs\figma-02-wave3.log"
$staging = "D:\ZYY Project\EduMind\.storage-9f3a7c"
$parkedq = "D:\ZYY Project\EduMind\.figma-parked-queue"
$srcOrder = @("$root\queue", $staging, "$root\queue_hold", $parkedq)
$script:doneCount = 0
$script:failCount = 0

function Wlog([string]$m) { Add-Content -Path $runLog -Value "[$(Get-Date -Format 'HH:mm:ss')] $m" }

function Start-Session {
    $out = & $ad session start --name "figma-draw-02-wave3" --multi-agent --cursor 2>&1 | Out-String
    try { $j = $out | ConvertFrom-Json } catch { return $false }
    if ($j -and $j.ok -and $j.data.session_id) {
        $script:s = $j.data.session_id
        & $ad cursor-overlay enable --session $script:s --agent-id $aid --accent "#FF9F43" | Out-Null
        Wlog "session (re)started: $($script:s)"
        return $true
    }
    return $false
}

function Adx {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$A)
    for ($t = 1; $t -le 3; $t++) {
        if (-not $script:s) { if (-not (Start-Session)) { Start-Sleep -Milliseconds 500; continue } }
        $rest = if ($A.Count -gt 1) { $A[1..($A.Count - 1)] } else { @() }
        $full = @($A[0], '--session', $script:s, '--agent-id', $aid) + $rest
        $out = & $ad @full 2>&1 | Out-String
        $j = $null
        if ($out -like '*{*') { try { $j = $out | ConvertFrom-Json } catch { $j = $null } }
        if ($j -and $j.ok) { return $j }
        if ($j -and $j.error -and $j.error.details -and $j.error.details.kind -eq 'session_ended') {
            Wlog "  session_ended -> reheal"; $script:s = $null; continue
        }
        return $j
    }
    return $null
}

function Resolve-Window {
    $r = Adx list-windows
    if ($r -and $r.ok) {
        foreach ($w in $r.data) { if ($w.title -like "*Untitled*Figma*") { return $w.id } }
    }
    return $script:W
}

function Ensure-Foreground {
    for ($i = 1; $i -le 3; $i++) {
        $null = Adx restore --window-id $script:W
        $f = Adx focus-window --window-id $script:W
        if ($f -and $f.ok) { return $true }
        Start-Sleep -Milliseconds 500
    }
    $script:W = Resolve-Window
    return $false
}

function Find-Spin {
    param([string]$Name)
    for ($t = 1; $t -le 4; $t++) {
        $r = Adx find --window-id $script:W --role spinbutton --name $Name --timeout-ms 6000
        if ($r -and $r.ok -and $r.data.matches -and $r.data.matches.Count -ge 1) {
            return @{ ref = "$($r.data.matches[0].ref_id)"; value = "$($r.data.matches[0].value)" }
        }
        if ($r -and $r.error -and $r.error.code -eq "WINDOW_NOT_FOUND") { $script:W = Resolve-Window; continue }
        Start-Sleep -Milliseconds 400
    }
    return $null
}

function Get-ChitHash {
    $r = Adx find --window-id $script:W --role image --timeout-ms 6000
    if ($r -and $r.ok -and $r.data.matches) {
        foreach ($m in $r.data.matches) {
            if ($m.name -and $m.name -like "chit for *") {
                if ($m.name -match '"hash":\{"0":(\d+),"1":(\d+),"2":(\d+)') { return "$($matches[1]).$($matches[2]).$($matches[3])" }
            }
        }
    }
    return $null
}

function Set-Field {
    param([string]$Name, [string]$Target)
    for ($t = 1; $t -le 4; $t++) {
        $cur = Find-Spin $Name
        if (-not $cur) { Start-Sleep -Milliseconds 400; continue }
        if ($cur.value.Trim() -eq $Target.Trim()) { return $true }
        $r = Adx set-value $cur.ref $Target
        if (-not $r -or -not $r.ok) { Start-Sleep -Milliseconds 400; continue }
        Start-Sleep -Milliseconds 250
        $null = Adx press --window-id $script:W return
        Start-Sleep -Milliseconds 400
        $chk = Find-Spin $Name
        if ($chk -and $chk.value.Trim() -eq $Target.Trim()) { return $true }
        if ($t -eq 2) { $null = Ensure-Foreground }
    }
    return $false
}

function Process-Item {
    param($ItemPath, [string]$SrcName)
    $j = Get-Content $ItemPath -Raw | ConvertFrom-Json
    $name = "$($j.name)"; $png = "$($j.png)"; $x = "$($j.x)"; $y = "$($j.y)"
    Wlog "START $name x=$x y=$y src=$SrcName"
    $ok = $false; $reason = ""
    for ($a = 1; $a -le 2 -and -not $ok; $a++) {
        $null = Ensure-Foreground
        $null = Adx press --window-id $script:W escape
        Start-Sleep -Milliseconds 300
        $h0 = Get-ChitHash
        $r = Adx clipboard-set --image $png
        if (-not $r -or -not $r.ok) { $reason = "clipboard-set code=$($r.error.code)"; Wlog "  $reason"; Start-Sleep -Milliseconds 500; continue }
        Start-Sleep -Milliseconds 700
        $pr = Adx press --window-id $script:W ctrl+v
        if (-not $pr -or -not $pr.ok) {
            $reason = "press code=$($pr.error.code)"
            Wlog "  $reason"
            if ($pr -and $pr.error.code -in @("STALE_REF","TIMEOUT")) { $null = Ensure-Foreground }
            continue
        }
        Start-Sleep -Milliseconds 2200
        $h1 = Get-ChitHash
        $landed = ($h1 -and $h0 -and $h1 -ne $h0)
        if (-not $landed -and -not $h0) { if (Find-Spin "X-position") { $landed = $true } }
        if (-not $landed) { $reason = "paste not landed (hash $h0 -> $h1)"; Wlog "  $reason a=$a"; continue }
        if (-not (Set-Field "X-position" $x)) { $reason = "X set/verify failed a=$a"; Wlog "  $reason"; continue }
        if (-not (Set-Field "Y-position" $y)) { $reason = "Y set/verify failed a=$a"; Wlog "  $reason"; continue }
        Start-Sleep -Milliseconds 500
        $shot = "$root\shots\$name.png"
        $sr = $null
        for ($t = 1; $t -le 3; $t++) { $sr = Adx screenshot --window-id $script:W $shot; if ($sr -and $sr.ok) { break }; Start-Sleep -Milliseconds 400 }
        if (-not $sr -or -not $sr.ok) { $reason = "screenshot code=$($sr.error.code)"; Wlog "  $reason"; continue }
        $ok = $true
    }
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    if ($ok) {
        if (Test-Path $ItemPath) {
            Move-Item -LiteralPath $ItemPath -Destination "$root\done\$name.json" -Force
            Set-Content -Path "$root\logs\$name.log" -Value "agent-id=$aid`ntime=$ts`nname=$name`nx=$x`ny=$y`nstatus=done`npng=$png`nscreenshot=$root\shots\$name.png`nsession=$($script:s)"
            $script:doneCount++
            Wlog "DONE $name"
        } else { Wlog "VANISHED-DONE $name (moved by someone else)" }
    } else {
        if (Test-Path $ItemPath) {
            Move-Item -LiteralPath $ItemPath -Destination "$root\failed\$name.json" -Force
            Set-Content -Path "$root\logs\$name.log" -Value "agent-id=$aid`ntime=$ts`nname=$name`nstatus=failed`nreason=$reason`nsession=$($script:s)"
            $script:failCount++
            Wlog "FAILED $name : $reason"
        } else { Wlog "VANISHED-FAIL $name" }
    }
}

foreach ($d in @("done","failed","shots","logs")) {
    if (-not (Test-Path "$root\$d")) { New-Item -ItemType Directory -Path "$root\$d" -Force | Out-Null }
}

Wlog "WAVE3_START session=$($script:s) window=$($script:W)"

while ($true) {
    $item = $null; $srcName = ""
    foreach ($src in $srcOrder) {
        $si = Get-ChildItem -Path $src -Filter *.json -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -First 1
        if ($si) { $item = $si; $srcName = Split-Path $src -Leaf; break }
    }
    if (-not $item) { Wlog "ALL_SOURCES_EMPTY"; break }

    $mine = $false
    while (-not $mine) {
        if (-not (Test-Path $lock)) {
            try { New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null; $mine = $true } catch {}
        }
        if (-not $mine) { Start-Sleep -Milliseconds (Get-Random -Minimum 200 -Maximum 600) }
    }
    try {
        $item2 = $null; $src2 = ""
        foreach ($src in $srcOrder) {
            $si = Get-ChildItem -Path $src -Filter *.json -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -First 1
            if ($si) { $item2 = $si; $src2 = Split-Path $src -Leaf; break }
        }
        if ($item2) { Process-Item $item2.FullName $src2 }
    } catch {
        Wlog "EXCEPTION: $($_.Exception.Message)"
        try {
            if ($item2 -and (Test-Path $item2.FullName)) {
                $nm = "unknown"
                try { $nm = (Get-Content $item2.FullName -Raw | ConvertFrom-Json).name } catch {}
                Move-Item -LiteralPath $item2.FullName -Destination "$root\failed\$nm.json" -Force -ErrorAction SilentlyContinue
            }
        } catch {}
        $script:failCount++
    } finally {
        Remove-Item $lock -Force -Recurse -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 300
}

Wlog "WAVE3_END processed=$doneCount failed=$failCount"
Write-Output "SUMMARY processed=$doneCount failed=$failCount"
