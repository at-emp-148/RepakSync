$ErrorActionPreference = "Stop"

Write-Host "Pulling latest changes..." -ForegroundColor Cyan
git pull

Write-Host "Installing dependencies..." -ForegroundColor Cyan
npm install

Write-Host "Building..." -ForegroundColor Cyan
npm run build

Write-Host "Starting app..." -ForegroundColor Cyan
npm start
