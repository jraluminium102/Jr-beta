# xlcalc2 — เหมือน xlcalc.ps1 แต่ read รองรับ "ชีต!เซลล์" (อ่านข้ามชีต) · read-only ไม่ save
param([string]$Book, [string]$Jobs, [string]$Out)
$ErrorActionPreference = "Stop"
$jobsArr = Get-Content -Raw -Encoding UTF8 $Jobs | ConvertFrom-Json
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.ScreenUpdating = $false; $xl.EnableEvents = $false
$results = @()
function Rg($wb, $defSheet, [string]$ref) {
  $i = $ref.LastIndexOf('!')
  if ($i -ge 0) { return $wb.Worksheets.Item($ref.Substring(0, $i)).Range($ref.Substring($i + 1)) }
  return $wb.Worksheets.Item($defSheet).Range($ref)
}
try {
  $wb = $xl.Workbooks.Open($Book, 0, $true)
  foreach ($j in $jobsArr) {
    $orig = @{}
    foreach ($p in $j.set.PSObject.Properties) { $r = Rg $wb $j.sheet ([string]$p.Name); $orig[[string]$p.Name] = [string]$r.Formula; if ($p.Value -is [string]) { $r.Value2 = [string]$p.Value } else { $r.Formula = [string]$p.Value } }
    $xl.CalculateFull()
    $vals = @{}
    foreach ($c in $j.read) { $vals[[string]$c] = (Rg $wb $j.sheet ([string]$c)).Value2 }
    $results += [pscustomobject]@{ id = $j.id; vals = $vals }
    foreach ($k in $orig.Keys) { (Rg $wb $j.sheet $k).Formula = $orig[$k] }
  }
  $wb.Close($false)
} finally {
  $xl.Quit() | Out-Null
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
}
$results | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $Out
