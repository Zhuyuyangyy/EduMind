param([int]$MaxItems = 300, [int]$StaleLockSec = 240)
# figma-01 corrected worker (protocol-compliant). set-value has NO --window-id.
$ad = "F:\new\agent-desktop-v1.1.0-x86_64-pc-windows-msvc\agent-desktop.exe"
$s = "run-1793849257572-7224-0"
$aid = "figma-01"
$W = "w-1968004"
$root = "D:\ZYY Project\EduMind\figma-draw"
$queue = Join-Path $root "queue"; $done = Join-Path $root "done"; $failed = Join-Path $root "failed"
$logs = Join-Path $root "logs"; $shots = Join-Path $root "shots"; $lock = Join-Path $root "lock"
$runlog = Join-Path $logs "figma-01-run.log"
foreach($d in @($done,$failed,$logs,$shots)){ if(-not(Test-Path $d)){ New-Item -ItemType Directory -Path $d -Force | Out-Null } }
function Log([string]$m){ $ts=(Get-Date).ToString("HH:mm:ss"); $line="[$ts][$aid] $m"; Write-Output $line; Add-Content -Path $runlog -Value $line }
function Invoke-Ad { param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)
  $out = & $ad @Args 2>&1 | Out-String; $out=$out.Trim()
  if($out -like '*{*'){ try{ return ($out|ConvertFrom-Json) }catch{ return $null } }
  return $null
}
$okCount=0; $failCount=0
Log "worker start MaxItems=$MaxItems StaleLockSec=$StaleLockSec"
for($i=0;$i -lt $MaxItems;$i++){
  # 1. acquire lock (atomic) with stale-break
  $mine=$false
  while(-not $mine){
    if(-not (Test-Path $lock)){
      try{ New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null; $mine=$true }catch{}
    } else {
      $age=((Get-Date)- (Get-Item $lock).CreationTime).TotalSeconds
      if($age -gt $StaleLockSec){ Log "WARN stale lock age=$([int]$age)s -> breaking"; try{ Remove-Item $lock -Force -Recurse -ErrorAction Stop }catch{}; continue }
    }
    if(-not $mine){ Start-Sleep -Milliseconds (Get-Random -Minimum 200 -Maximum 600) }
  }
  try{
    # 2. take first queue item
    $item = Get-ChildItem -Path $queue -Filter *.json | Sort-Object Name | Select-Object -First 1
    if(-not $item){ Log "QUEUE_EMPTY"; break }
    $j = Get-Content $item.FullName -Raw | ConvertFrom-Json
    $name=$j.name; $png=$j.png; $x=[string]$j.x; $y=[string]$j.y
    Log "PROCESS $name x=$x y=$y"
    # 3. paste (up to 2 attempts)
    $xref=$null; $pasteOk=$false
    for($a=1;$a -le 2 -and -not $pasteOk;$a++){
      $r=Invoke-Ad clipboard-set --session $s --agent-id $aid --image $png
      if(-not $r -or -not $r.ok){ Log "  clipboard-set FAIL a=$a"; Start-Sleep -Milliseconds 500; continue }
      Start-Sleep -Milliseconds 700
      $null=Invoke-Ad focus-window --session $s --agent-id $aid --window-id $W
      $pr=Invoke-Ad press --session $s --agent-id $aid --window-id $W ctrl+v
      if(-not $pr -or -not $pr.ok){ Log "  press FAIL a=$a"; continue }
      Start-Sleep -Milliseconds 2200
      for($t=1;$t -le 3;$t++){ $f=Invoke-Ad find --session $s --agent-id $aid --window-id $W --role spinbutton --name "X-position"; if($f -and $f.ok -and $f.data.matches.Count -ge 1){ $xref=$f.data.matches[0].ref_id; break }; Start-Sleep -Milliseconds 400 }
      if($xref){ $pasteOk=$true } else { Log "  X-position NOT FOUND a=$a" }
    }
    if(-not $pasteOk){
      Move-Item $item.FullName (Join-Path $failed "$name.json") -Force
      Set-Content (Join-Path $logs "$name.log") "agent-id=$aid`ntime=$(Get-Date -Format o)`nname=$name`nstatus=failed`nreason=X-position not found after 2 paste attempts"
      $failCount++; Log "  -> failed\$name.json (no paste)"; continue
    }
    # 4. Y ref
    $yref=$null
    for($t=1;$t -le 3;$t++){ $f=Invoke-Ad find --session $s --agent-id $aid --window-id $W --role spinbutton --name "Y-position"; if($f -and $f.ok -and $f.data.matches.Count -ge 1){ $yref=$f.data.matches[0].ref_id; break }; Start-Sleep -Milliseconds 400 }
    # set-value X (NO --window-id)
    $okx=$false
    for($t=1;$t -le 3 -and -not $okx;$t++){
      $r=Invoke-Ad set-value --session $s --agent-id $aid $xref $x
      if($r -and $r.ok){ $okx=$true; break }
      if($r -and $r.error.code -in @("STALE_REF","TIMEOUT")){ $f=Invoke-Ad find --session $s --agent-id $aid --window-id $W --role spinbutton --name "X-position"; if($f -and $f.ok -and $f.data.matches.Count -ge 1){ $xref=$f.data.matches[0].ref_id }; continue }
      Log "  setX ok=false t=$t code=$($r.error.code)"; Start-Sleep -Milliseconds 300
    }
    # set-value Y (NO --window-id)
    $oky=$false
    if($yref){
      for($t=1;$t -le 3 -and -not $oky;$t++){
        $r=Invoke-Ad set-value --session $s --agent-id $aid $yref $y
        if($r -and $r.ok){ $oky=$true; break }
        if($r -and $r.error.code -in @("STALE_REF","TIMEOUT")){ $f=Invoke-Ad find --session $s --agent-id $aid --window-id $W --role spinbutton --name "Y-position"; if($f -and $f.ok -and $f.data.matches.Count -ge 1){ $yref=$f.data.matches[0].ref_id }; continue }
        Log "  setY ok=false t=$t code=$($r.error.code)"; Start-Sleep -Milliseconds 300
      }
    }
    Start-Sleep -Milliseconds 500
    if(-not ($okx -and $oky)){
      Move-Item $item.FullName (Join-Path $failed "$name.json") -Force
      Set-Content (Join-Path $logs "$name.log") "agent-id=$aid`ntime=$(Get-Date -Format o)`nname=$name`nstatus=failed`nreason=set-value failed okx=$okx oky=$oky"
      $failCount++; Log "  -> failed\$name.json (set-value okx=$okx oky=$oky)"; continue
    }
    # 5. screenshot
    $shot=Join-Path $shots "$name.png"
    for($t=1;$t -le 3;$t++){ $r=Invoke-Ad screenshot --session $s --agent-id $aid --window-id $W $shot; if($r -and $r.ok){ break }; Start-Sleep -Milliseconds 400 }
    # 6. archive
    Move-Item $item.FullName (Join-Path $done "$name.json") -Force
    Set-Content (Join-Path $logs "$name.log") "agent-id=$aid`ntime=$(Get-Date -Format o)`nname=$name`nx=$x`ny=$y`nstatus=ok"
    $okCount++; Log "  -> done\$name.json (ok)"
  } finally {
    # 7. release lock
    if(Test-Path $lock){ Remove-Item $lock -Force -Recurse }
  }
}
Log "SUMMARY ok=$okCount failed=$failCount"
