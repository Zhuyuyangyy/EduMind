param([int]$MaxItems = 60)
# figma-07 worker v5 — v4 + Ensure-Figma-Focus before every press (press needs active window)
# sources: .storage-9f3a7c, failed/ (rework), queue/, queue_hold/
$ad = "F:\new\agent-desktop-v1.1.0-x86_64-pc-windows-msvc\agent-desktop.exe"
$id = "figma-07"
$script:W = "w-1968004"
$script:s = $null
$root = "D:\ZYY Project\EduMind\figma-draw"
$lock = "$root\lock"
$runLog = "$root\logs\figma-07-v5.log"
$srcs = @("D:\ZYY Project\EduMind\.storage-9f3a7c", "$root\failed", "$root\queue", "$root\queue_hold", "D:\ZYY Project\EduMind\.figma-parked-queue")
# plus any .wk-* / .storage-* staging dirs (glob, newest first)
$extra = Get-ChildItem "D:\ZYY Project\EduMind\" -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '.wk-*' -or $_.Name -like '.storage-*' } | Sort-Object LastWriteTime -Descending | ForEach-Object { $_.FullName }
$srcs = $extra + $srcs
foreach ($d in @("done","failed","shots","logs")) {
    if (-not (Test-Path "$root\$d")) { New-Item -ItemType Directory -Path "$root\$d" | Out-Null }
}
function Wlog([string]$m) { Add-Content -Path $runLog -Value "[$(Get-Date -Format 'HH:mm:ss')] $m" }

function Get-AdJson([string[]]$A) {
    $raw = & $ad @A 2>&1 | Out-String
    try { return ($raw | ConvertFrom-Json) } catch { return $null }
}

function Start-Session {
    $r = Get-AdJson @("session","start","--name","figma-draw-07-v5","--cursor","--multi-agent")
    if ($r -and $r.ok -and $r.data.session_id) {
        $script:s = $r.data.session_id
        & $ad cursor-overlay enable --session $script:s --agent-id $id --accent "#5F27CD" | Out-Null
        Wlog "session started: $($script:s)"
        return $true
    }
    Wlog "session start FAILED"
    return $false
}

function Adx([string[]]$A) {
    for ($t = 1; $t -le 2; $t++) {
        if (-not $script:s) { if (-not (Start-Session)) { Start-Sleep -Milliseconds 500; continue } }
        $full = @($A[0],'--session',$script:s,'--agent-id',$id) + $A[1..($A.Count-1)]
        $r = Get-AdJson $full
        if ($r -and $r.ok) { return $r }
        if ($r -and $r.error -and $r.error.details -and $r.error.details.kind -eq 'session_ended') {
            Wlog "  session_ended -> reheal"; $script:s = $null; continue
        }
        return $r
    }
    return $null
}

function Resolve-Window {
    $r = Adx @("list-windows")
    if ($r -and $r.ok) {
        foreach ($w in $r.data) { if ($w.title -like "*Untitled*Figma*") { return $w.id } }
    }
    return $script:W
}

function Ensure-Figma {
    # resolve window, restore if minimized, focus it, confirm active. pure semantic ops.
    for ($t = 1; $t -le 3; $t++) {
        $lw = Adx @("list-windows")
        if ($lw -and $lw.ok) {
            $fw = $lw.data | Where-Object { $_.title -like "*Untitled*Figma*" } | Select-Object -First 1
            if ($fw) {
                $script:W = $fw.id
                if ($fw.minimized) { $null = Adx @("restore","--window-id",$script:W) }
                if (-not $fw.is_focused) { $null = Adx @("focus-window","--window-id",$script:W) }
                Start-Sleep -Milliseconds 250
                $lw2 = Adx @("list-windows")
                $fw2 = $lw2.data | Where-Object { $_.id -eq $script:W } | Select-Object -First 1
                if ($fw2 -and $fw2.is_focused) { return $true }
            }
        }
        Start-Sleep -Milliseconds 500
    }
    Wlog "  Ensure-Figma FAILED"
    return $false
}

function Press([string]$Combo) {
    if (-not (Ensure-Figma)) { return $null }
    return (Adx @("press","--window-id",$script:W,$Combo))
}

function Find-Spin([string]$Name) {
    for ($t = 1; $t -le 4; $t++) {
        $r = Adx @("find","--window-id",$script:W,"--role","spinbutton","--name",$Name)
        if ($r -and $r.ok -and $r.data.matches.Count -ge 1) {
            return @{ ref = "$($r.data.matches[0].ref_id)"; value = "$($r.data.matches[0].value)" }
        }
        if ($r -and $r.error -and $r.error.code -eq "WINDOW_NOT_FOUND") { $script:W = Resolve-Window; continue }
        Start-Sleep -Milliseconds 400
    }
    return $null
}

function Set-Field([string]$Name, [string]$Target) {
    for ($t = 1; $t -le 4; $t++) {
        $cur = Find-Spin $Name
        if (-not $cur) { Wlog "  $Name not found (t=$t)"; return $false }
        if ($cur.value.Trim() -eq $Target.Trim()) { return $true }
        $r = Adx @("set-value","$($cur.ref)","$Target")
        if (-not $r -or -not $r.ok) { Wlog "  set-value $Name t=$t code=$($r.error.code)"; Start-Sleep -Milliseconds 400; continue }
        $null = Press "return"
        Start-Sleep -Milliseconds 400
    }
    $chk = Find-Spin $Name
    if ($chk -and $chk.value.Trim() -eq $Target.Trim()) { return $true }
    Wlog "  $Name verify FAILED (want=$Target got=$(if($chk){$chk.value}else{'none'}))"
    return $false
}

Wlog "WORKER_V5_START max=$MaxItems"
$processed = 0; $failedN = 0; $doneNames = @(); $failNames = @()
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
        # 2. take item from first non-empty source
        $item = $null
        foreach ($src in $srcs) {
            $item = Get-ChildItem $src -Filter *.json -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -First 1
            if ($item) { break }
        }
        if (-not $item) { Wlog "ALL_SOURCES_EMPTY"; break }
        $j = Get-Content $item.FullName -Raw | ConvertFrom-Json
        $name = "$($j.name)"; $png = "$($j.png)"; $x = "$($j.x)"; $y = "$($j.y)"
        Wlog "START $name x=$x y=$y src=$($item.Directory.Name)"

        $ok = $false; $failReason = ""
        for ($attempt = 1; $attempt -le 2 -and -not $ok; $attempt++) {
            # snapshot pre-paste X (of currently selected image) to detect paste-not-landed
            $pre = Find-Spin "X-position"
            $preX = if ($pre) { $pre.value.Trim() } else { $null }
            # release any spinbutton focus from previous item
            $null = Press "escape"
            Start-Sleep -Milliseconds 300
            # 3. paste
            $r = Adx @("clipboard-set","--image",$png)
            if (-not $r -or -not $r.ok) { $failReason = "clipboard-set code=$($r.error.code)"; Wlog "  $failReason"; Start-Sleep -Milliseconds 500; continue }
            Start-Sleep -Milliseconds 700
            $r = Press "ctrl+v"
            if (-not $r -or -not $r.ok) { $failReason = "press code=$($r.error.code)"; Wlog "  $failReason"; continue }
            Start-Sleep -Milliseconds 2200
            # paste-landed guard: if selected X unchanged vs pre-paste, paste likely went into a field
            $post = Find-Spin "X-position"
            if ($preX -ne $null -and $preX -ne "" -and $post -and $post.value.Trim() -eq $preX) {
                Wlog "  paste guard: X unchanged ($preX) -> re-paste (a$attempt)"
                $failReason = "paste not landed (X unchanged)"
                continue
            }
            # 4. position + verify
            if (-not (Set-Field "X-position" $x)) { $failReason = "X fail (a$attempt)"; Wlog "  $failReason"; continue }
            if (-not (Set-Field "Y-position" $y)) { $failReason = "Y fail (a$attempt)"; Wlog "  $failReason"; continue }
            Start-Sleep -Milliseconds 500
            # 5. screenshot
            $shot = "$root\shots\$name.png"
            $r = Adx @("screenshot","--window-id",$script:W,"$shot")
            if (-not $r -or -not $r.ok) { $failReason = "screenshot code=$($r.error.code)"; Wlog "  $failReason"; continue }
            $ok = $true
        }

        $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        if ($ok) {
            if (Test-Path $item.FullName) {
                Move-Item -LiteralPath $item.FullName -Destination "$root\done\$name.json" -Force
                Set-Content -Path "$root\logs\$name.log" -Value "agent-id=$id`ntime=$ts`nx=$x`ny=$y`nstatus=done`nshot=$root\shots\$name.png`nsession=$($script:s)"
                $processed++; $doneNames += $name
                Wlog "DONE $name"
            } else { Wlog "VANISHED $name (moved by someone else)" }
        } else {
            if (Test-Path $item.FullName) {
                Move-Item -LiteralPath $item.FullName -Destination "$root\failed\$name.json" -Force
                Set-Content -Path "$root\logs\$name.log" -Value "agent-id=$id`ntime=$ts`nstatus=failed`nreason=$failReason"
                $failedN++; $failNames += "${name}:${failReason}"
                Wlog "FAILED $name : $failReason"
            } else { Wlog "VANISHED-FAIL $name" }
        }
    } finally {
        if (Test-Path $lock) { Remove-Item $lock -Force -Recurse }
    }
    Start-Sleep -Milliseconds 300
}
Wlog "V5_END processed=$processed failed=$failedN"
Write-Output "V5RESULT processed=$processed failed=$failedN"
Write-Output "DONE_LIST=$($doneNames -join ',')"
$failNames | ForEach-Object { Write-Output "FAIL_DETAIL=$_" }
