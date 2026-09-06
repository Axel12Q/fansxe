# The encrypted password can only be opened by this Windows account.
$vaultPath = Join-Path $env:LOCALAPPDATA 'Fansxe/admin.dpapi'
$credential = Get-Content -LiteralPath $vaultPath | ConvertTo-SecureString
Set-Clipboard -Value ([System.Net.NetworkCredential]::new('', $credential).Password)
Write-Output 'Contrasena copiada. Usuario: admin. Pegala en https://fansxe.com/login.html'
