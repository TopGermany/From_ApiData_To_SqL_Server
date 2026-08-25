[CmdletBinding()]
param(
    [ValidatePattern('^([01]?\d|2[0-3]):[0-5]\d$')]
    [string]$At = '01:15',
    [string]$TaskName = 'EOS Public API Daily Sync'
)

$root = $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$script = Join-Path $root 'sync-eos-public-api.js'

if (-not (Test-Path -LiteralPath (Join-Path $root '.env'))) {
    throw 'Missing .env. Copy .env.example to .env, then fill in EOS_KEY and SQL_SERVER before registering the task.'
}

$action = New-ScheduledTaskAction -Execute $node -Argument ('"{0}"' -f $script) -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Daily EOS public read API extraction and SQL Server load.' -Force | Out-Null
Write-Host "Created scheduled task '$TaskName' for $At. It runs while this Windows account is signed in."
