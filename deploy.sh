#!/bin/bash

echo "🚀 Replit Deployment Process Starting..."
echo "======================================="

# 1. Run tests
echo "📋 Running E2E deployment checks..."
npm run test:e2e:ci

if [ $? -ne 0 ]; then
  echo "❌ Deployment checks failed! Aborting deployment."
  exit 1
fi

# 2. Build the app
echo "🔨 Building Next.js app..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Build failed! Aborting deployment."
  exit 1
fi

# 3. Run database migrations (if you have any)
# echo "🗄️ Running database migrations..."
# npm run migrate

echo "✅ All checks passed! Your app is ready."
echo "======================================="
echo "🎉 Deployment checks complete!"