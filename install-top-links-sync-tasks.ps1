[CmdletBinding()]
param(
    [ValidatePattern('^([01]?\d|2[0-3]):[0-5]\d$')]
    [string[]]$At = @('09:00', '21:00'),
    [string]$TaskNamePrefix = 'EOS Top Links Sync'
)

$root = $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$script = Join-Path $root 'sync-eos-public-api.js'

if (-not (Test-Path -LiteralPath (Join-Path $root '.env'))) {
    throw 'Missing .env. Configure .env before registering the scheduled tasks.'
}

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

foreach ($time in $At | Select-Object -Unique) {
    $taskName = "$TaskNamePrefix $($time.Replace(':', ''))"
    $action = New-ScheduledTaskAction -Execute $node -Argument ('"{0}" --top-links-only' -f $script) -WorkingDirectory $root
    $trigger = New-ScheduledTaskTrigger -Daily -At $time

    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "EOS top-links (24h) API sync every day at $time." -Force | Out-Null
    Write-Host "Created task '$taskName' for $time."
}

Write-Host 'The tasks run while this Windows account is signed in. If the machine is off at the scheduled time, they run after the next sign-in when possible.'
