# Exports Chan Yew's legacy Access CRM (one branch) to JSON for tools/import-access.js.
# Read-only: works on a copy of the .accdb. Needs the Microsoft Access Database Engine (ACE OLE DB, 64-bit).
#   powershell -File tools/access-export.ps1 -AccessFile "<path>.accdb" -From 2025-10-01 -Out "<folder>\access-export.json"
# The output holds client personal data: keep it outside the repository.
param(
  [Parameter(Mandatory)] [string] $AccessFile,
  [string] $From = '2025-10-01',
  [Parameter(Mandatory)] [string] $Out
)
$ErrorActionPreference = 'Stop'
$copy = Join-Path ([IO.Path]::GetDirectoryName($Out)) 'access-export-copy.accdb'
Copy-Item $AccessFile $copy -Force
$cn = New-Object System.Data.OleDb.OleDbConnection("Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$copy;Mode=Read;")
$cn.Open()

function Rows($sql) {
  $a = New-Object System.Data.OleDb.OleDbDataAdapter($sql, $cn); $t = New-Object System.Data.DataTable; [void]$a.Fill($t)
  foreach ($r in $t.Rows) {
    $o = [ordered]@{}
    foreach ($c in $t.Columns) {
      $v = $r[$c.ColumnName]
      if ($v -is [DBNull]) { $v = $null }
      elseif ($v -is [DateTime]) { $v = $v.ToString('yyyy-MM-dd') }
      elseif ($v -is [string]) { $v = $v.Trim() }
      $o[$c.ColumnName] = $v
    }
    [pscustomobject]$o
  }
}

$since = "#$From#"
# sales orders from the cut-off, their work orders, and every work order on the same invoices (so invoices stay whole)
$soWhere = "[Date In] >= $since"
$woSql = "SELECT w.* FROM [Work Order] w WHERE w.[Sales Order ID] IN (SELECT ID FROM [Sales Order] WHERE $soWhere)
  OR w.[Invoice ID] IN (SELECT w2.[Invoice ID] FROM [Work Order] w2 INNER JOIN [Sales Order] s2 ON s2.ID = w2.[Sales Order ID] WHERE s2.[Date In] >= $since AND w2.[Invoice ID] IS NOT NULL)"
$wos = @(Rows $woSql)
Write-Host ("work orders: {0}" -f $wos.Count)
$soIds = ($wos | Where-Object { $_.'Sales Order ID' } | ForEach-Object { $_.'Sales Order ID' } | Sort-Object -Unique)
$sos = @(Rows "SELECT * FROM [Sales Order] WHERE $soWhere")
$extraSo = $soIds | Where-Object { $_ -notin $sos.ID }
if ($extraSo) { $sos += @(Rows ("SELECT * FROM [Sales Order] WHERE ID IN (" + ($extraSo -join ',') + ")")) }
$custIds = ($sos | Where-Object { $_.Contact } | ForEach-Object { $_.Contact } | Sort-Object -Unique)
$invIds = ($wos | Where-Object { $_.'Invoice ID' } | ForEach-Object { $_.'Invoice ID' } | Sort-Object -Unique)

$result = [ordered]@{
  exportedAt = (Get-Date).ToString('s'); from = $From
  customers = @(Rows ("SELECT ID, [Customer Name], CStr(Contact) AS Phone, Email, Address FROM [Customer Info] WHERE ID IN (" + ($custIds -join ',') + ")"))
  salesOrders = $sos
  workOrders = $wos
  invoices = @(Rows ("SELECT * FROM Invoice WHERE ID IN (" + ($invIds -join ',') + ")"))
  brands = @(Rows 'SELECT * FROM Brand'); itemTypes = @(Rows 'SELECT * FROM [Item Type]'); productCodes = @(Rows 'SELECT * FROM [Product Code]')
  locations = @(Rows 'SELECT * FROM [Location Code]'); stages = @(Rows 'SELECT * FROM Stage'); technicians = @(Rows 'SELECT * FROM Technician')
}
$cn.Close()
Remove-Item $copy -Force
$json = $result | ConvertTo-Json -Depth 4 -Compress
[IO.File]::WriteAllText($Out, $json, (New-Object Text.UTF8Encoding $false))
"Exported {0} customers, {1} sales orders, {2} work orders, {3} invoices to {4}" -f $result.customers.Count, $result.salesOrders.Count, $result.workOrders.Count, $result.invoices.Count, $Out
