param([int]$MaxItems = 300)
# figma-03 wave-3 worker — 从 .figma-parked-queue 返工
# 关键修正（基于两个会话的实测）：
#  1) 会话自愈：session ended 时自动 session start 新会话并重试
#  2) 贴图前 focus-window + press escape（解除 spinbutton 焦点，否则 ctrl+v 不贴画布）
#  3) 贴图上岸校验：选中图 fill 的 chit hash 变化
#  4) set-value 绝不传 --window-id；set-value 后 press return 提交，再 find 回读校验
#  5) WINDOW_NOT_FOUND 自动 list-windows 换 id
# 铁律：无 --headed；键盘只用 press --window-id；持协议锁；不碰别人刚贴的图。

$ad = "F:\new\agent-desktop-v1.1.0-x86_64-pc-windows-msvc\agent-desktop.exe"
$aid = "figma-03"
$script:W = "w-1968004"
$script:s = $null
$root = "D:\ZYY Project\EduMind\figma-draw"
$src = Join-Path $root "queue"
$staging1 = "D:\ZYY Project\EduMind\.figma-parked-queue"
$staging2 = "D:\ZYY Project\EduMind\.storage-9f3a7c"
$staging3 = "D:\ZYY Project\EduMind\.wk-k39d4inw8s"
$deadline = (Get-Date).AddMinutes(25)
$done = Join-Path $root "done"
$failed = Join-Path $root "failed"
$logs = Join-Path $root "logs"
$shots = Join-Path $root "shots"
$lock = Join-Path $root "lock"
$runlog = Join-Path $logs "figma-03-wave3.log"

foreach ($d in @($done, $failed, $logs, $shots)) { if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null } }

function Log([string]$m) {
    $ts = (Get-Date).ToString("HH:mm:ss")
    $line = "[$ts][$aid] $m"
    Write-Output $line
    Add-Content -Path $runlog -Value $line
}

function Start-Session {
    $out = & $ad session start --name "figma-draw-03-wave3" --multi-agent --cursor 2>&1 | Out-String
    try { $j = $out | ConvertFrom-Json } catch { return $false }
    if ($j -and $j.ok -and $j.data.session_id) {
        $script:s = $j.data.session_id
        & $ad cursor-overlay enable --session $script:s --agent-id $aid --accent "#FECA57" | Out-Null
        Log "session started: $($script:s)"
        return $true
    }
    return $false
}

function Invoke-Ad {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
    for ($try = 1; $try -le 4; $try++) {
        if (-not $script:s) { if (-not (Start-Session)) { Start-Sleep -Milliseconds 500; continue } }
        $rest = if ($Args.Count -gt 1) { $Args[1..($Args.Count - 1)] } else { @() }
        $full = @($Args[0], '--session', $script:s, '--agent-id', $aid) + $rest
        $out = & $ad @full 2>&1 | Out-String
        $out = $out.Trim()
        $j = $null
        if ($out -like '*{*') { try { $j = $out | ConvertFrom-Json } catch { $j = $null } }
        if ($j -and $j.ok) { return $j }
        if ($j -and $j.error) {
            if ($j.error.details -and $j.error.details.kind -eq 'session_ended') { Log "  session ended -> restart"; $script:s = $null; continue }
            if ($j.error.code -eq 'WINDOW_NOT_FOUND') {
                $lw = Invoke-Ad list-windows
                if ($lw -and $lw.ok) {
                    foreach ($w in $lw.data) { if ($w.title -like "*Untitled*Figma*") { $script:W = $w.id; break } }
                    $newArgs = @()
                    for ($i = 0; $i -lt $Args.Count; $i++) {
                        $newArgs += $Args[$i]
                        if ($Args[$i] -eq '--window-id' -and ($i + 1) -lt $Args.Count) { $newArgs += $script:W; $i++ }
                    }
                    $Args = $newArgs
                    continue
                }
            }
        }
        return $j
    }
    return $null
}

function Find-Spin {
    param([string]$Name)
    $f = Invoke-Ad find --window-id $script:W --role spinbutton --name $Name
    if ($f -and $f.ok -and $f.data.matches.Count -ge 1) {
        return @{ ref = $f.data.matches[0].ref_id; value = $f.data.matches[0].value }
    }
    return $null
}

function Get-ChitHash {
    $f = Invoke-Ad find --window-id $script:W --role image
    if ($f -and $f.ok) {
        foreach ($m in $f.data.matches) {
            if ($m.name -and $m.name -like "chit for *") {
                if ($m.name -match '"hash":\{"0":(\d+),"1":(\d+),"2":(\d+)') { return "$($matches[1]).$($matches[2]).$($matches[3])" }
            }
        }
    }
    return $null
}

function Set-And-Verify {
    param([string]$Field, [string]$Val)
    for ($r = 1; $r -le 3; $r++) {
        $m = Find-Spin $Field
        if (-not $m) { Start-Sleep -Milliseconds 400; continue }
        $sv = Invoke-Ad set-value $m.ref $Val
        if (-not $sv -or -not $sv.ok) { Start-Sleep -Milliseconds 300; continue }
        Start-Sleep -Milliseconds 200
        $null = Invoke-Ad press --window-id $script:W return
        Start-Sleep -Milliseconds 400
        $m2 = Find-Spin $Field
        if ($m2 -and "$($m2.value)" -eq "$Val") { return $true }
        Log "  $Field verify got '$($m2.value)' want '$Val' try=$r"
    }
    return $false
}

$script:startedAt = Get-Date
$okCount = 0
$failCount = 0
$waitCount = 0
for ($i = 0; $i -lt $MaxItems; $i++) {
    # 1. lock
    $mine = $false
    while (-not $mine) {
        if (-not (Test-Path $lock)) {
            try { New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null; $mine = $true } catch {}
        }
        if (-not $mine) { Start-Sleep -Milliseconds (Get-Random -Minimum 200 -Maximum 600) }
    }
    try {
        # 2. take item: failed/ 返工 → queue/ 补货 → lead 各暂存区（竞态容错）
        $item = $null; $itemSrc = ""
        foreach ($pair in @(@{ p = $failed; n = "failed" }, @{ p = $src; n = "queue" }, @{ p = $staging2; n = "storage" }, @{ p = $staging3; n = "wk" }, @{ p = $staging1; n = "parked" })) {
            $si = @(Get-ChildItem -Path $pair.p -Filter *.json -ErrorAction SilentlyContinue | Sort-Object Name)
            if ($si.Count -gt 0) { $item = $si[0]; $itemSrc = $pair.n; break }
        }
        if (-not $item) {
            if ((Get-Date) -gt $deadline) { Log "DEADLINE_REACHED all sources empty"; break }
            Remove-Item $lock -Force -Recurse -ErrorAction SilentlyContinue
            $null = Invoke-Ad list-windows
            $waitCount++
            if ($waitCount % 6 -eq 1) { Log "STANDBY all-empty-watch session=$($script:s)" }
            Start-Sleep -Seconds 5
            continue
        }
        $j = Get-Content $item.FullName -Raw | ConvertFrom-Json
        $name = $j.name; $png = $j.png; $x = [string]$j.x; $y = [string]$j.y
        Log "PROCESS $name x=$x y=$y src=$itemSrc"

        # 3. paste with landing check (up to 2 attempts)
        $landed = $false
        for ($a = 1; $a -le 2 -and -not $landed; $a++) {
            $h0 = Get-ChitHash
            $r = Invoke-Ad clipboard-set --image $png
            if (-not $r -or -not $r.ok) { Log "  clipboard-set FAIL a=$a"; Start-Sleep -Milliseconds 500; continue }
            Start-Sleep -Milliseconds 700
            $null = Invoke-Ad focus-window --window-id $script:W
            $null = Invoke-Ad press --window-id $script:W escape
            $pr = Invoke-Ad press --window-id $script:W ctrl+v
            if (-not $pr -or -not $pr.ok) { Log "  press FAIL a=$a"; continue }
            Start-Sleep -Milliseconds 2200
            $h1 = Get-ChitHash
            if ($h1 -and $h0 -and $h1 -ne $h0) { $landed = $true }
            elseif (-not $h0) { if (Find-Spin "X-position") { $landed = $true } }
            else { Log "  paste not landed a=$a (hash $h0 -> $h1)" }
        }
        if (-not $landed) {
            try { Move-Item $item.FullName (Join-Path $failed "$name.json") -Force -ErrorAction Stop } catch { Log "  item taken by other agent, skip"; continue }
            Set-Content (Join-Path $logs "$name.log") "agent-id=$aid`ntime=$(Get-Date -Format o)`nname=$name`nstatus=failed`nreason=paste did not land after 2 attempts (chit hash unchanged)"
            $failCount++; Log "  -> failed\$name.json"; continue
        }

        # 4. position + verify
        $okx = Set-And-Verify "X-position" $x
        $oky = $false
        if ($okx) { $oky = Set-And-Verify "Y-position" $y }
        if (-not ($okx -and $oky)) {
            try { Move-Item $item.FullName (Join-Path $failed "$name.json") -Force -ErrorAction Stop } catch { Log "  item taken by other agent, skip"; continue }
            Set-Content (Join-Path $logs "$name.log") "agent-id=$aid`ntime=$(Get-Date -Format o)`nname=$name`nstatus=failed`nreason=position verify failed okx=$okx oky=$oky"
            $failCount++; Log "  -> failed\$name.json (okx=$okx oky=$oky)"; continue
        }
        Start-Sleep -Milliseconds 500

        # 5. screenshot
        $shot = Join-Path $shots "$name.png"
        for ($t = 1; $t -le 3; $t++) { $r = Invoke-Ad screenshot --window-id $script:W $shot; if ($r -and $r.ok) { break }; Start-Sleep -Milliseconds 400 }

        # 6. archive + log
        try { Move-Item $item.FullName (Join-Path $done "$name.json") -Force -ErrorAction Stop } catch { Log "  item taken by other agent, skip"; continue }
        Set-Content (Join-Path $logs "$name.log") "agent-id=$aid`ntime=$(Get-Date -Format o)`nname=$name`nx=$x`ny=$y`nstatus=ok`nshot=$shot`nsession=$($script:s)"
        $okCount++
        Log "  -> done\$name.json (ok)"
    } finally {
        if (Test-Path $lock) { Remove-Item $lock -Force -Recurse }
    }
}
Log "SUMMARY ok=$okCount failed=$failCount"
