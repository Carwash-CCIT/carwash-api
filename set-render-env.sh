#!/bin/bash
# Script to set Render environment variables via curl
# Usage: bash set-render-env.sh <API_KEY>

RENDER_API_KEY=${1:-$RENDER_API_KEY}
SERVICE_ID="srv-aygz" # carwash-api service ID

if [ -z "$RENDER_API_KEY" ]; then
    echo "❌ Please provide Render API key as argument or RENDER_API_KEY env var"
    echo "Usage: bash set-render-env.sh <YOUR_RENDER_API_KEY>"
    exit 1
fi

echo "🔐 Setting Render environment variables..."

# Function to set a single env var
set_env_var() {
    local key=$1
    local value=$2
    
    echo "📝 Setting $key..."
    
    curl -X PATCH \
      "https://api.render.com/v1/services/$SERVICE_ID" \
      -H "Authorization: Bearer $RENDER_API_KEY" \
      -H "Content-Type: application/json" \
      -d "{
        \"envVars\": [{
          \"key\": \"$key\",
          \"value\": \"$value\"
        }]
      }"
    
    echo ""
}

# Set Google OAuth vars
set_env_var "GOOGLE_CLIENT_ID" "<from-.env.example>"
set_env_var "GOOGLE_CLIENT_SECRET" "<from-.env.example>"
set_env_var "GOOGLE_REDIRECT_URI" "https://carwash-api-aygz.onrender.com/auth/google/callback"

echo "✅ Environment variables set!"
echo "⏳ Waiting for Render to restart..."

