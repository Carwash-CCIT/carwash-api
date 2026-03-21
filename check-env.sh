#!/bin/bash
# Check Render environment setup
echo "🔍 Checking Render Environment..."
echo ""

echo "✅ Checking Google OAuth settings:"
echo "  GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:0:20}... (${#GOOGLE_CLIENT_ID} chars)"
echo "  GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:0:20}... (${#GOOGLE_CLIENT_SECRET} chars)"
echo "  GOOGLE_REDIRECT_URI: $GOOGLE_REDIRECT_URI"
echo ""

if [ -z "$GOOGLE_CLIENT_ID" ]; then
    echo "❌ GOOGLE_CLIENT_ID is NOT set!"
    echo "Please add it to Render Environment Variables"
else
    echo "✅ GOOGLE_CLIENT_ID is set"
fi

if [ -z "$GOOGLE_CLIENT_SECRET" ]; then
    echo "❌ GOOGLE_CLIENT_SECRET is NOT set!"
    echo "Please add it to Render Environment Variables"
else
    echo "✅ GOOGLE_CLIENT_SECRET is set"
fi

echo ""
echo "📋 All environment variables:"
env | grep -E "^(GOOGLE|SCB|GMAIL|NODE|PORT)" | sort
