$ErrorActionPreference = 'Continue'
$ad  = "F:\new\agent-desktop-v1.1.0-x86_64-pc-windows-msvc\agent-desktop.exe"
$s   = "run-1793849257572-7224-0"
$id  = "figma-04"
$root = "D:\ZYY Project\EduMind\figma-draw"
$lock = "$root\lock"
$script:W = "w-1968004"
$runLog = "$root\logs\figma-04-run.log"

# ensure dirs exist
foreach ($d in @("$root\queue","$root\done","$root\failed","$root\shots","$root\logs")) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

function Write-Log([string]$msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $runLog -Value "[$ts] $msg"
}

function Resolve-Window {
    $out = & $ad list-windows --session $s 2>&1 | Out-String
    try {
        $j = $out | ConvertFrom-Json
        foreach ($win in $j.data) {
            if ($win.title -like "*Untitled*Figma*") { return $win.id }
        }
    } catch {}
    return $null
}

function Invoke-Ad([string[]]$CmdArgs) {
    $out = & $ad @CmdArgs 2>&1 | Out-String
    try { return ($out | ConvertFrom-Json) } catch { return $null }
}

function Invoke-AdRetry([string[]]$CmdArgs, [int]$Max = 3) {
    $r = $null
    for ($i = 0; $i -lt $Max; $i++) {
        $r = Invoke-Ad $CmdArgs
        if ($null -ne $r -and $r.ok) { return $r }
        if ($null -ne $r) {
            $code = $r.error.code
            if ($code -eq 'WINDOW_NOT_FOUND') {
                $newW = Resolve-Window
                if ($newW) {
                    $script:W = $newW
                    $idx = [array]::IndexOf($CmdArgs, '--window-id')
                    if ($idx -ge 0 -and ($idx + 1) -lt $CmdArgs.Count) { $CmdArgs[$idx + 1] = $newW }
                    continue
                }
                return $r
            }
            if ($code -eq 'STALE_REF' -or $code -eq 'TIMEOUT') {
                Start-Sleep -Milliseconds 300
                continue
            }
            return $r
        }
        Start-Sleep -Milliseconds 300
    }
    return $r
}

function Find-Ref([string]$name) {
    $r = Invoke-AdRetry @('find','--session',$s,'--agent-id',$id,'--window-id',$script:W,'--role','spinbutton','--name',$name)
    if ($null -ne $r -and $r.ok -and $null -ne $r.data.matches -and $r.data.matches.Count -gt 0) {
        return $r.data.matches[0].ref_id
    }
    return $null
}

$results = @()
$failed  = @()

$w0 = Resolve-Window
if ($w0) { $script:W = $w0 } else { Write-Log "FATAL: Figma window not found at start"; }
Write-Log "WORKER_START window=$script:W"

while ($true) {
    # 1. lock (only claim if truly created by me)
    $mine = $false
    while (-not $mine) {
        if (-not (Test-Path $lock)) {
            try { New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null; $mine = $true } catch {}
        }
        if (-not $mine) { Start-Sleep -Milliseconds (Get-Random -Minimum 200 -Maximum 600) }
    }
    try {
        # 2. take first item
        $items = @(Get-ChildItem "$root\queue" -Filter *.json | Sort-Object Name)
        if ($items.Count -eq 0) { break }
        $file = $items[0]
        $j = Get-Content $file.FullName -Raw | ConvertFrom-Json
        $name = $j.name
        Write-Log "START $name png=$($j.png) x=$($j.x) y=$($j.y)"

        $done = $false
        $failReason = ""
        for ($attempt = 1; $attempt -le 2 -and -not $done; $attempt++) {
            # 3. paste
            $r = Invoke-AdRetry @('clipboard-set','--session',$s,'--agent-id',$id,'--image',"$($j.png)")
            if ($null -eq $r -or -not $r.ok) {
                $failReason = "clipboard-set failed (code=$($r.error.code))"
                Write-Log "WARN ${name}: $failReason"
                Start-Sleep -Milliseconds 500
                continue
            }
            Start-Sleep -Milliseconds 700
            $r = Invoke-AdRetry @('press','--session',$s,'--agent-id',$id,'--window-id',$script:W,'ctrl+v')
            if ($null -eq $r -or -not $r.ok) {
                $failReason = "press ctrl+v failed (code=$($r.error.code))"
                Write-Log "WARN ${name}: $failReason"
                continue
            }
            Start-Sleep -Milliseconds 2200

            # 4. position
            $xref = Find-Ref 'X-position'
            if (-not $xref) {
                $failReason = "attempt ${attempt}: X-position spinbutton not found (paste not landed)"
                Write-Log "WARN ${name}: $failReason"
                continue
            }
            $r = Invoke-AdRetry @('set-value','--session',$s,'--agent-id',$id,"$xref","$($j.x)")
            if ($null -eq $r -or -not $r.ok) {
                $failReason = "set-value X failed (code=$($r.error.code))"
                Write-Log "WARN ${name}: $failReason"
                continue
            }
            $yref = Find-Ref 'Y-position'
            if (-not $yref) {
                $failReason = "Y-position spinbutton not found"
                Write-Log "WARN ${name}: $failReason"
                continue
            }
            $r = Invoke-AdRetry @('set-value','--session',$s,'--agent-id',$id,"$yref","$($j.y)")
            if ($null -eq $r -or -not $r.ok) {
                $failReason = "set-value Y failed (code=$($r.error.code))"
                Write-Log "WARN ${name}: $failReason"
                continue
            }
            Start-Sleep -Milliseconds 500

            # 5. screenshot
            $shot = "$root\shots\$name.png"
            $r = Invoke-AdRetry @('screenshot','--session',$s,'--agent-id',$id,'--window-id',$script:W,"$shot")
            if ($null -eq $r -or -not $r.ok) {
                $failReason = "screenshot failed (code=$($r.error.code))"
                Write-Log "WARN ${name}: $failReason"
                continue
            }

            # 6. archive
            Move-Item -LiteralPath $file.FullName -Destination "$root\done\$name.json" -Force
            $logLine = "agent-id: figma-04`ntime: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`nx: $($j.x)`ny: $($j.y)`nshot: $shot`nattempt: $attempt"
            Set-Content -Path "$root\logs\$name.log" -Value $logLine
            $done = $true
            $results += $name
            Write-Log "DONE $name x=$($j.x) y=$($j.y) attempt=$attempt"
        }
        if (-not $done) {
            Move-Item -LiteralPath $file.FullName -Destination "$root\failed\$name.json" -Force
            Set-Content -Path "$root\logs\$name.log" -Value "agent-id: figma-04`ntime: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`nstatus: FAILED`nreason: $failReason"
            $failed += "$name : $failReason"
            Write-Log "FAILED $name reason=$failReason"
        }
    } finally {
        # 7. release lock
        Remove-Item $lock -Force -Recurse -ErrorAction SilentlyContinue
    }
}

Write-Log "QUEUE_EMPTY processed=$($results.Count) failed=$($failed.Count)"
Write-Output "PROCESSED=$($results.Count)"
Write-Output "FAILED=$($failed.Count)"
foreach ($f in $failed) { Write-Output "FAILDETAIL=$f" }
Write-Output "DONELIST=$($results -join ',')"
