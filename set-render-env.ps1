# PowerShell script to set Render environment variables
# Run: powershell -ExecutionPolicy Bypass -File set-render-env.ps1

param(
    [string]$RenderApiKey = $env:RENDER_API_KEY
)

if (-not $RenderApiKey) {
    Write-Host "❌ Please provide Render API key" -ForegroundColor Red
    Write-Host "Usage: powershell -ExecutionPolicy Bypass -File set-render-env.ps1 -RenderApiKey <YOUR_API_KEY>" -ForegroundColor Yellow
    exit 1
}

$serviceId = "srv-aygz"  # carwash-api-aygz service ID
$apiUrl = "https://api.render.com/v1/services/$serviceId"

$headers = @{
    "Authorization" = "Bearer $RenderApiKey"
    "Content-Type" = "application/json"
}

# Environment variables to set
$envVars = @(
    @{
        key = "GOOGLE_CLIENT_ID"
        value = "<from-.env.example>"
    },
    @{
        key = "GOOGLE_CLIENT_SECRET"
        value = "<from-.env.example>"
    },
    @{
        key = "GOOGLE_REDIRECT_URI"
        value = "https://carwash-api-aygz.onrender.com/auth/google/callback"
    }
)

Write-Host "🔐 Setting Render environment variables..." -ForegroundColor Cyan

foreach ($var in $envVars) {
    Write-Host "📝 Setting $($var.key)..." -ForegroundColor Yellow
    
    $body = @{
        envVars = @($var)
    } | ConvertTo-Json
    
    try {
        $response = Invoke-WebRequest -Uri $apiUrl `
            -Method PATCH `
            -Headers $headers `
            -Body $body
        
        Write-Host "✅ $($var.key) set successfully!" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to set $($var.key)" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
    }
}

Write-Host "" -ForegroundColor Cyan
Write-Host "✅ Environment variables queued for update!" -ForegroundColor Green
Write-Host "⏳ Render will restart the service automatically" -ForegroundColor Yellow
Write-Host "📊 Check https://dashboard.render.com for status" -ForegroundColor Cyan

