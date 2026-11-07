$ad = "F:\new\agent-desktop-v1.1.0-x86_64-pc-windows-msvc\agent-desktop.exe"
$s = "run-1793849257572-7224-0"
$id = "figma-05"
$W = "w-1968004"
$root = "D:\ZYY Project\EduMind\figma-draw"
$lock = "$root\lock"
$runLog = "$root\logs\figma-05-run.log"

foreach ($d in @("queue","done","failed","shots","logs")) {
    if (-not (Test-Path "$root\$d")) { New-Item -ItemType Directory -Path "$root\$d" | Out-Null }
}

function Write-Run([string]$msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $runLog -Value "[$ts] $msg"
}

function Get-ADJson {
    param([string[]]$AdArgs)
    $raw = & $ad @AdArgs 2>&1 | Out-String
    try { return ($raw | ConvertFrom-Json) } catch { return $null }
}

function Resolve-Window {
    param([string]$Cur)
    $r = Get-ADJson @("list-windows","--session",$s)
    if ($r -and $r.ok) {
        foreach ($w in $r.data) {
            if ($w.title -like "*Untitled*Figma*") { return $w.id }
        }
    }
    return $Cur
}

$deadline = (Get-Date).AddMinutes(10)
$emptySince = $null
$processed = 0
$failed = 0
Write-Run "WORKER_START window=$W (wait-for-restock mode)"

while ((Get-Date) -lt $deadline) {
    # 1. acquire lock (try-create and detect real creation)
    $mine = $false
    while (-not $mine) {
        if (-not (Test-Path $lock)) {
            try { New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null; $mine = $true } catch {}
        }
        if (-not $mine) { Start-Sleep -Milliseconds (Get-Random -Minimum 200 -Maximum 600) }
    }

    try {
        # 2. take first item
        $item = Get-ChildItem -Path "$root\queue" -Filter *.json | Sort-Object Name | Select-Object -First 1
        if (-not $item) {
            if (-not $emptySince) { $emptySince = Get-Date; Write-Run "QUEUE_EMPTY, waiting for restock" }
            if (((Get-Date) - $emptySince).TotalSeconds -ge 300) { break }
            Remove-Item $lock -Force -Recurse
            Start-Sleep -Seconds 10
            continue
        }
        $emptySince = $null
        $json = Get-Content $item.FullName -Raw | ConvertFrom-Json
        $name = $json.name
        $png = $json.png
        $x = $json.x
        $y = $json.y
        Write-Run "PROCESSING $name x=$x y=$y"

        $ok = $false
        $err = ""
        for ($attempt = 1; $attempt -le 2 -and -not $ok; $attempt++) {
            # 3. paste image
            $r = Get-ADJson @("clipboard-set","--session",$s,"--agent-id",$id,"--image",$png)
            if (-not $r -or -not $r.ok) { $err = "clipboard-set failed: $($r.error.code)"; Start-Sleep -Milliseconds 500; continue }
            Start-Sleep -Milliseconds 700
            $r = Get-ADJson @("press","--session",$s,"--agent-id",$id,"--window-id",$W,"ctrl+v")
            if (-not $r -or -not $r.ok) {
                if ($r -and $r.error.code -eq "WINDOW_NOT_FOUND") { $W = Resolve-Window $W; $r = Get-ADJson @("press","--session",$s,"--agent-id",$id,"--window-id",$W,"ctrl+v") }
            }
            if (-not $r -or -not $r.ok) { $err = "press ctrl+v failed: $($r.error.code)"; continue }
            Start-Sleep -Milliseconds 2200

            # 4. position X (set-value 绝不传 --window-id)
            $xref = $null
            for ($t = 1; $t -le 3 -and -not $xref; $t++) {
                $r = Get-ADJson @("find","--session",$s,"--agent-id",$id,"--window-id",$W,"--role","spinbutton","--name","X-position")
                if ($r -and $r.ok -and $r.data.matches.Count -gt 0) { $xref = $r.data.matches[0].ref_id }
                elseif ($r -and $r.error.code -eq "WINDOW_NOT_FOUND") { $W = Resolve-Window $W }
                elseif ($r -and ($r.error.code -eq "STALE_REF" -or $r.error.code -eq "TIMEOUT")) { Start-Sleep -Milliseconds 400 }
                else { break }
            }
            if (-not $xref) { $err = "X-position not found (attempt $attempt)"; continue }

            $r = Get-ADJson @("set-value","--session",$s,"--agent-id",$id,"$xref","$x")
            if (-not $r -or -not $r.ok) { $err = "set-value X failed: $($r.error.code)"; continue }

            # position Y
            $yref = $null
            for ($t = 1; $t -le 3 -and -not $yref; $t++) {
                $r = Get-ADJson @("find","--session",$s,"--agent-id",$id,"--window-id",$W,"--role","spinbutton","--name","Y-position")
                if ($r -and $r.ok -and $r.data.matches.Count -gt 0) { $yref = $r.data.matches[0].ref_id }
                elseif ($r -and $r.error.code -eq "WINDOW_NOT_FOUND") { $W = Resolve-Window $W }
                elseif ($r -and ($r.error.code -eq "STALE_REF" -or $r.error.code -eq "TIMEOUT")) { Start-Sleep -Milliseconds 400 }
                else { break }
            }
            if (-not $yref) { $err = "Y-position not found (attempt $attempt)"; continue }

            $r = Get-ADJson @("set-value","--session",$s,"--agent-id",$id,"$yref","$y")
            if (-not $r -or -not $r.ok) { $err = "set-value Y failed: $($r.error.code)"; continue }
            Start-Sleep -Milliseconds 500

            # 5. screenshot (must succeed before archive)
            $r = Get-ADJson @("screenshot","--session",$s,"--agent-id",$id,"--window-id",$W,"$root\shots\$name.png")
            if (-not $r -or -not $r.ok) { $err = "screenshot failed: $($r.error.code)"; continue }

            $ok = $true
        }

        if ($ok) {
            # 6. archive
            Move-Item -Path $item.FullName -Destination "$root\done\$name.json" -Force
            $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            Set-Content -Path "$root\logs\$name.log" -Value "agent-id: $id`ntime: $ts`nx: $x`ny: $y`nstatus: done"
            $processed++
            Write-Run "DONE $name"
        } else {
            Move-Item -Path $item.FullName -Destination "$root\failed\$name.json" -Force
            $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            Set-Content -Path "$root\logs\$name.log" -Value "agent-id: $id`ntime: $ts`nx: $x`ny: $y`nstatus: failed`nreason: $err"
            $failed++
            Write-Run "FAILED $name : $err"
        }
    }
    finally {
        # 7. release lock
        if (Test-Path $lock) { Remove-Item $lock -Force -Recurse }
    }
    Start-Sleep -Milliseconds 200
}

Write-Run "EXIT processed=$processed failed=$failed"
Write-Output "SUMMARY processed=$processed failed=$failed"
