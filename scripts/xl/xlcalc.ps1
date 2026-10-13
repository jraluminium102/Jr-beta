# xlcalc.ps1 — เปิดสำเนาไฟล์ Excel (ไม่แตะไฟล์จริงของเจ้าของ) ใส่อินพุตตามงาน แล้วอ่านค่าที่คำนวณใหม่
#   powershell -File xlcalc.ps1 -Book <xlsx> -Jobs <jobs.json> -Out <out.json>
#   jobs.json = [{ "id":"...", "sheet":"คิดทุน ยูโร", "set":{"B2":400,"B3":240,"B4":4,"B5":"อิสระ"}, "read":["D48","D55"] }, ...]
#   ⚠ ไม่ save ไฟล์ · ปิด Excel ทุกครั้ง (finally)
param([string]$Book, [string]$Jobs, [string]$Out)
$ErrorActionPreference = "Stop"
$jobsArr = Get-Content -Raw -Encoding UTF8 $Jobs | ConvertFrom-Json
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.ScreenUpdating = $false; $xl.EnableEvents = $false
$results = @()
try {
  $wb = $xl.Workbooks.Open($Book, 0, $true)   # read-only
  foreach ($j in $jobsArr) {
    $ws = $wb.Worksheets.Item($j.sheet)
    # เก็บค่าเดิมไว้คืน (สูตรในชีตอื่นอ้างถึง)
    $orig = @{}
    foreach ($p in $j.set.PSObject.Properties) { $orig[$p.Name] = $ws.Range($p.Name).Formula; $ws.Range($p.Name).Value2 = $p.Value }
    $xl.CalculateFull()
    $vals = @{}
    foreach ($c in $j.read) { $vals[$c] = $ws.Range($c).Value2 }
    $results += [pscustomobject]@{ id = $j.id; vals = $vals }
    foreach ($k in $orig.Keys) { $ws.Range($k).Formula = $orig[$k] }
  }
  $wb.Close($false)
} finally {
  $xl.Quit() | Out-Null
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
}
$results | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $Out
