# Test API script

Write-Host "=== Testing Account Manager API ===" -ForegroundColor Green

# Test 1: Create an account
Write-Host "`n1. Creating test account..." -ForegroundColor Yellow
$createBody = @{
    email = "admin@chatgpt.com"
    accessToken = "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..test_token_here"
    additionalHeaders = @{}
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3001/api/accounts" -Method POST -Body $createBody -ContentType "application/json"
Write-Host "Response: $($response | ConvertTo-Json)" -ForegroundColor Cyan

# Test 2: Get all accounts
Write-Host "`n2. Getting all accounts..." -ForegroundColor Yellow
$accounts = Invoke-RestMethod -Uri "http://localhost:3001/api/accounts" -Method GET
Write-Host "Accounts: $($accounts | ConvertTo-Json)" -ForegroundColor Cyan

Write-Host "`n=== Tests completed ===" -ForegroundColor Green
