@echo off
REM ============================================
REM LAUNCH COMMAND CENTRE - Auto Sync Script
REM ============================================
REM
REM This script syncs local JSON files to the hosted dashboard.
REM Set up in Windows Task Scheduler to run every 5 minutes.
REM
REM SETUP INSTRUCTIONS:
REM 1. Change DASHBOARD_URL to your actual dashboard URL
REM 2. Change SYNC_SECRET to match config.php
REM 3. Change LOCAL_DATA_DIR to where your JSON files live
REM 4. Open Task Scheduler > Create Basic Task
REM    - Trigger: Daily, repeat every 5 minutes for 1 day
REM    - Action: Start a Program > Browse to this .bat file
REM ============================================

SET DASHBOARD_URL=https://yourwebsite.com/dashboard/api.php
SET SYNC_SECRET=your-secret-key-change-me-2026
SET LOCAL_DATA_DIR=C:\Users\User\dashboard\data

REM Build JSON payload with all area files
echo Syncing dashboard data at %TIME%...

REM Use PowerShell to do the heavy lifting
powershell -ExecutionPolicy Bypass -Command ^
    "$dataDir = '%LOCAL_DATA_DIR%'; " ^
    "$url = '%DASHBOARD_URL%?action=sync'; " ^
    "$secret = '%SYNC_SECRET%'; " ^
    "" ^
    "$areas = @(); " ^
    "Get-ChildItem -Path $dataDir -Filter '*.json' | ForEach-Object { " ^
    "    $content = Get-Content $_.FullName -Raw | ConvertFrom-Json; " ^
    "    $areas += $content; " ^
    "}; " ^
    "" ^
    "$body = @{ " ^
    "    secret = $secret; " ^
    "    areas = $areas; " ^
    "} | ConvertTo-Json -Depth 10; " ^
    "" ^
    "try { " ^
    "    $response = Invoke-RestMethod -Uri $url -Method POST -Body $body -ContentType 'application/json'; " ^
    "    Write-Host 'Sync complete:' $response.synced.Count 'areas synced,' $response.skipped.Count 'skipped (locked)'; " ^
    "" ^
    "    # Pull back any changes made by others on the server " ^
    "    if ($response.serverData) { " ^
    "        foreach ($area in $response.serverData) { " ^
    "            $skippedIds = $response.skipped; " ^
    "            if ($area.id -notin $response.synced) { " ^
    "                # This area wasn't synced (locked), pull server version " ^
    "                $filePath = Join-Path $dataDir ($area.id + '.json'); " ^
    "                $area | ConvertTo-Json -Depth 10 | Set-Content $filePath -Encoding UTF8; " ^
    "                Write-Host 'Pulled server version of' $area.id; " ^
    "            } " ^
    "        } " ^
    "    } " ^
    "} catch { " ^
    "    Write-Host 'Sync failed:' $_.Exception.Message; " ^
    "}"

echo.
echo Sync complete.
