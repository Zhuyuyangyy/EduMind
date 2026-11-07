param([int]$MaxItems = 60)
# figma-07 final worker v4 — drains remaining items with all field-proven fixes:
#  - session auto-heal (session_ended -> session start fresh)
#  - press escape before each paste (release spinbutton focus, else ctrl+v types into field)
#  - set-value NEVER with --window-id; press return to commit; re-find to verify value == target
#  - sources: .storage-9f3a7c (lead staging) first, then queue/, queue_hold/
#  - protocol lock held per item; no --headed anywhere; keyboard only via press --window-id
$ad = "F:\new\agent-desktop-v1.1.0-x86_64-pc-windows-msvc\agent-desktop.exe"
$id = "figma-07"
$script:W = "w-1968004"
$script:s = $null
$root = "D:\ZYY Project\EduMind\figma-draw"
$lock = "$root\lock"
$runLog = "$root\logs\figma-07-v4.log"
$srcs = @("D:\ZYY Project\EduMind\.storage-9f3a7c", "$root\queue", "$root\queue_hold")
foreach ($d in @("done","failed","shots","logs")) {
    if (-not (Test-Path "$root\$d")) { New-Item -ItemType Directory -Path "$root\$d" | Out-Null }
}
function Wlog([string]$m) { Add-Content -Path $runLog -Value "[$(Get-Date -Format 'HH:mm:ss')] $m" }

function Get-AdJson([string[]]$A) {
    $raw = & $ad @A 2>&1 | Out-String
    try { return ($raw | ConvertFrom-Json) } catch { return $null }
}

function Start-Session {
    $r = Get-AdJson @("session","start","--name","figma-draw-07-final","--cursor","--multi-agent")
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
    # run with current session; auto-heal once on session_ended
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
    # set-value (no --window-id) + return commit + verify by re-find; up to 4 rounds
    for ($t = 1; $t -le 4; $t++) {
        $cur = Find-Spin $Name
        if (-not $cur) { Wlog "  $Name not found (t=$t)"; return $false }
        if ($cur.value.Trim() -eq $Target.Trim()) { return $true }
        $r = Adx @("set-value","$($cur.ref)","$Target")
        if (-not $r -or -not $r.ok) { Wlog "  set-value $Name t=$t code=$($r.error.code)"; Start-Sleep -Milliseconds 400; continue }
        $null = Adx @("press","--window-id",$script:W,"return")
        Start-Sleep -Milliseconds 400
    }
    $chk = Find-Spin $Name
    if ($chk -and $chk.value.Trim() -eq $Target.Trim()) { return $true }
    Wlog "  $Name verify FAILED (want=$Target got=$(if($chk){$chk.value}else{'none'}))"
    return $false
}

Wlog "WORKER_V4_START max=$MaxItems"
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
            # release any spinbutton focus from previous item
            $null = Adx @("press","--window-id",$script:W,"escape")
            Start-Sleep -Milliseconds 300
            # 3. paste
            $r = Adx @("clipboard-set","--image",$png)
            if (-not $r -or -not $r.ok) { $failReason = "clipboard-set code=$($r.error.code)"; Wlog "  $failReason"; Start-Sleep -Milliseconds 500; continue }
            Start-Sleep -Milliseconds 700
            $r = Adx @("press","--window-id",$script:W,"ctrl+v")
            if (-not $r -or -not $r.ok) { $failReason = "press code=$($r.error.code)"; Wlog "  $failReason"; continue }
            Start-Sleep -Milliseconds 2200
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
Wlog "V4_END processed=$processed failed=$failedN"
Write-Output "V4RESULT processed=$processed failed=$failedN"
Write-Output "DONE_LIST=$($doneNames -join ',')"
$failNames | ForEach-Object { Write-Output "FAIL_DETAIL=$_" }
