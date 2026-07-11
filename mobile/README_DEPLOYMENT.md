# CLINNA — App Store Deployment Guide

Complete checklist for shipping Clinna to the iOS App Store.
Complete each section in order before moving to the next.

---

## 1. Apple Developer Account

**URL:** https://developer.apple.com/account  
**Cost:** $99 / year  
**Required before:** Any EAS build or TestFlight upload

Steps:
1. Sign in with your Apple ID at developer.apple.com
2. Enroll in the Apple Developer Program (individual or organization)
3. Wait for approval (usually instant for individuals, up to 48h for orgs)
4. Note your **Team ID** from Membership details — needed in `eas.json`
5. Create an **App ID** under Certificates, Identifiers & Profiles:
   - Bundle ID: `com.clinna.app`
   - Enable: Push Notifications (if needed later)

---

## 2. App Store Connect — Create the App Record

**URL:** https://appstoreconnect.apple.com  

Steps:
1. Click **+** → New App
2. Platform: iOS
3. Name: Clinna
4. Bundle ID: `com.clinna.app` (from step 1)
5. SKU: `clinna-app-001`
6. Primary language: English
7. Note the **App ID (numeric)** — needed in `eas.json` as `ascAppId`

---

## 3. RevenueCat — In-App Purchases

**URL:** https://app.revenuecat.com  
**Required before:** Any purchase flow testing

### 3a. App Store Connect — Create Products

In App Store Connect → Your App → Monetization → In-App Purchases, create:

| Product ID           | Type          | Price  |
|----------------------|---------------|--------|
| clinna_credit_1      | Consumable    | $2.99  |
| clinna_credit_5      | Consumable    | $9.99  |
| clinna_credit_15     | Consumable    | $19.99 |
| clinna_pro_monthly   | Auto-Renewable| $14.99/mo |
| clinna_pro_annual    | Auto-Renewable| $99.99/yr |

### 3b. RevenueCat Dashboard

1. Create a new project → select App Store
2. Add your app with Bundle ID `com.clinna.app`
3. Connect App Store Connect API key (under RevenueCat → API Keys)
4. Create an **Offering** (default offering)
5. Add **Packages** matching the product IDs above
6. Copy your **Public SDK Key** → set in `.env` as `EXPO_PUBLIC_REVENUECAT_API_KEY`

---

## 4. Supabase — Run Migrations

In Supabase Dashboard → SQL Editor, run migrations **in this order**:

```
1. mobile/src/services/profiles_migration.sql
2. mobile/src/services/supabase_migration.sql
3. mobile/services/credits_migration.sql
```

Verify in Table Editor that `profiles` has:
- `scans_left` (default 2)
- `credits` (default 0)
- `is_pro` (default false)
- `pro_expires_at`
- `total_scans_used`

Verify RPC functions exist under Database → Functions:
- `decrement_scans_left`
- `use_credit`
- `is_pro_active`
- `get_user_entitlement`

---

## 5. Backend — Deploy to Railway

**URL:** https://railway.app  

### 5a. One-time setup

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login
```

### 5b. Create project and deploy

```bash
cd backend

# Initialize new Railway project
railway init

# Set environment variables in Railway dashboard or via CLI:
railway variables set GEMINI_API_KEY=your_gemini_key
railway variables set ALLOWED_ORIGINS=https://clinna.app,exp://your-expo-url

# Deploy
railway up
```

### 5c. Verify deployment

```bash
# Check health endpoint
curl https://your-api.railway.app/health
# Expected: {"status":"ok","version":"0.1.0"}
```

### 5d. Update mobile config

Edit `mobile/.env`:
```
EXPO_PUBLIC_BACKEND_URL=https://your-api.railway.app
```

---

## 6. EAS Build — iOS Production

### 6a. Prerequisites

```bash
# Install EAS CLI
npm install -g eas-cli

# Login with Expo account
eas login

# Link project (run from mobile/ directory)
cd mobile
eas init
```

Update `eas.json` with your credentials:
- `appleId`: your Apple ID email
- `ascAppId`: numeric App ID from App Store Connect
- `appleTeamId`: Team ID from Apple Developer

### 6b. Configure app signing

```bash
# EAS will handle provisioning profiles automatically
eas credentials
```

### 6c. Build for production

```bash
cd mobile

# Production build (App Store)
eas build --platform ios --profile production

# This will:
# 1. Bundle the JS
# 2. Compile native iOS code
# 3. Sign with your distribution certificate
# 4. Upload to EAS servers
# Build takes ~10-15 minutes
```

---

## 7. TestFlight — Internal Testing

After EAS build completes:

```bash
# Submit to TestFlight (manual approach)
eas submit --platform ios --profile production
```

Or download the `.ipa` from EAS dashboard and upload manually via Xcode / Transporter.

In App Store Connect → TestFlight:
1. Wait for processing (~5 minutes)
2. Add internal testers (your Apple ID)
3. Install TestFlight app on device → accept invitation
4. Test all flows: auth, camera scan, paywall, purchase, history

---

## 8. App Store Connect — Metadata

Before submitting for review, fill in:

**App Information:**
- Name: Clinna
- Subtitle: Archive Fashion Authentication
- Category: Shopping (Primary), Lifestyle (Secondary)
- Age Rating: 4+ (no objectionable content)

**Description (App Store):**
```
Clinna is an AI-powered fashion authentication tool for archive and streetwear collectors.

Photograph any garment, accessory, or sneaker — Clinna's AI engine cross-references
brand signatures, construction details, and hardware marks to deliver a verdict in seconds.

FEATURES
• Quick Scan — instant authentication from a single photo
• Deep Auth — multi-image analysis with label, wash tag, and hardware verification
• Accessory Mode — belts, bags, footwear, and jewelry
• Cost Breakdown — estimated production cost, brand premium, and resell market value
• Scan Archive — save and revisit your authentication history
```

**Keywords:** archive fashion, authentication, legit check, streetwear, vintage, luxury

**Screenshots required (6.7" and 5.5"):** at minimum 3 screenshots per size class
- Home screen
- Camera scanning
- Authentication receipt

**Privacy Policy URL:** Required — host a simple one at your domain or use a generator.

---

## 9. App Store Review Submission

Before submitting:
- [ ] All metadata filled in App Store Connect
- [ ] At least 1 screenshot per required device size
- [ ] Privacy policy URL live and accessible
- [ ] App builds and runs correctly on TestFlight
- [ ] All in-app purchases approved in App Store Connect
- [ ] No placeholder text or lorem ipsum in the app

Submit:
1. App Store Connect → Your App → 1.0 Prepare for Submission
2. Select the build from TestFlight
3. Answer the export compliance questions (No encryption → Yes to EAR99 exemption)
4. Click **Submit for Review**

**Review timeline:** Usually 24-48 hours. First submission may take longer.

---

## Environment Variables Checklist

| Variable | Where to set | Value |
|----------|-------------|-------|
| `EXPO_PUBLIC_SUPABASE_URL` | `.env` / EAS secrets | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env` / EAS secrets | Supabase anon key |
| `EXPO_PUBLIC_BACKEND_URL` | `.env` / EAS secrets | Railway URL |
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | `.env` / EAS secrets | RevenueCat public key |
| `GEMINI_API_KEY` | Railway env vars | Google AI Studio key |
| `ALLOWED_ORIGINS` | Railway env vars | Comma-separated origins |

To add secrets to EAS (so they're available at build time):
```bash
eas secret:create --scope project --name EXPO_PUBLIC_BACKEND_URL --value https://your-api.railway.app
```

---

## Quick Reference Commands

```bash
# Preview build (internal testing, no App Store)
eas build --platform ios --profile preview

# Production build
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios --profile production

# Check build status
eas build:list

# View logs
eas build:view
```
