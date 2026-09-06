param([string]$Activate)
$vaultPath = Join-Path $env:LOCALAPPDATA 'Fansxe/ionos.dpapi'
$savedSecret = Get-Content -LiteralPath $vaultPath | ConvertTo-SecureString
$env:FANSXE_SSH_PASSWORD = [System.Net.NetworkCredential]::new('', $savedSecret).Password
try {
    if ($Activate) { python scripts/deploy.py --activate $Activate }
    else { python scripts/deploy.py --prepare }
} finally { Remove-Item Env:FANSXE_SSH_PASSWORD }
