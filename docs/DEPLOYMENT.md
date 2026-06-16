# Deployment

## Overview

```
GitHub (main branch)
    │
    └── GitHub Actions
          ├── npm install
          ├── npm run build
          └── Deploy to GitHub Pages (gh-pages branch)
                    │
                    └── https://yourusername.github.io/worldcup-prediction-game/
```

Firebase services (Auth + Firestore) run independently — no Firebase hosting needed.

## GitHub Pages Setup

### 1. Create GitHub Repository

```bash
git init
git remote add origin https://github.com/YOUR_USERNAME/worldcup-prediction-game.git
```

### 2. Enable GitHub Pages

1. Go to repository Settings → Pages
2. Source: "Deploy from a branch" → Branch: `gh-pages` → `/` (root)
3. Or use GitHub Actions deployment (preferred)

### 3. Vite Config for GitHub Pages

`vite.config.ts` must set `base` to the repository name:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/worldcup-prediction-game/',  // must match repo name
});
```

### 4. React Router with GitHub Pages

GitHub Pages doesn't support HTML5 History API routing. Use hash routing or the 404 redirect trick.

Option A (recommended): Use `HashRouter` for GitHub Pages:
```typescript
// main.tsx
import { HashRouter } from 'react-router-dom';
```

Option B: Add a `public/404.html` that redirects to `index.html` with the path encoded.

## GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
          VITE_ADMIN_EMAILS: ${{ secrets.VITE_ADMIN_EMAILS }}
          VITE_DATA_PROVIDER: ${{ vars.VITE_DATA_PROVIDER }}
          VITE_API_KEY: ${{ secrets.VITE_API_KEY }}
        run: npm run build

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### Setting GitHub Secrets

In repository Settings → Secrets and variables → Actions:

**Secrets (sensitive):**
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_ADMIN_EMAILS`
- `VITE_API_KEY` (if using API provider)

**Variables (non-sensitive):**
- `VITE_DATA_PROVIDER` = `local` (or `api`)

## Firebase Setup

### 1. Create Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create project → name it `worldcup-prediction-game`
3. Disable Google Analytics (optional, saves complexity)

### 2. Enable Authentication

1. Firebase Console → Authentication → Get started
2. Sign-in providers → Google → Enable
3. Set project public-facing name and support email
4. Save

### 3. Enable Firestore

1. Firebase Console → Firestore Database → Create database
2. Start in **production mode** (not test mode)
3. Choose region: `europe-west1` (Belgium, closest to Romania)
4. Click "Enable"

### 4. Configure Authorized Domains

Firebase Authentication → Settings → Authorized domains:

Add:
```
yourusername.github.io
localhost
```

### 5. Get Firebase Config

Firebase Console → Project settings → Your apps → Add app → Web

Copy the config object:
```javascript
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

Add values to `.env.local` and GitHub Secrets.

### 6. Deploy Firestore Rules

```bash
npm install -g firebase-tools
firebase login
firebase init firestore  # select existing project
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 7. Firestore Security Rules

`firestore.rules`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return request.auth != null && request.auth.uid == userId;
    }

    function isAdmin() {
      return isAuthenticated() &&
        request.auth.token.email in
          get(/databases/$(database)/documents/appConfig/main).data.adminEmails;
    }

    function matchHasNotStarted(matchId) {
      let match = get(/databases/$(database)/documents/matches/$(matchId));
      return match.data.scheduledKickoffUtc > request.time;
    }

    // Public read: teams, matches, standings, leaderboard, appConfig
    match /teams/{teamId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /matches/{matchId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /standings/{standingId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /leaderboard/{userId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /appConfig/{configId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // Users: own profile read/write, public leaderboard fields readable
    match /users/{userId} {
      allow read: if isOwner(userId) || isAdmin();
      allow create: if isOwner(userId);
      allow update: if (isOwner(userId) &&
        !request.resource.data.diff(resource.data).affectedKeys()
          .hasAny(['totalPoints', 'rank', 'exactScoreCount', 'correctOutcomeCount']))
        || isAdmin();
    }

    // Predictions: owner can create/update before kickoff; admin can always write
    match /predictions/{predictionId} {
      allow read: if isOwner(resource.data.userId) || isAdmin();
      allow create: if isOwner(request.resource.data.userId) &&
        matchHasNotStarted(request.resource.data.matchId);
      allow update: if (isOwner(resource.data.userId) &&
        matchHasNotStarted(resource.data.matchId) &&
        !request.resource.data.diff(resource.data).affectedKeys()
          .hasAny(['pointsAwarded', 'isManualEntry', 'manuallyEnteredByAdmin']))
        || isAdmin();
      allow delete: if isAdmin();
    }

    // Admin-only collections
    match /adminAuditLog/{logId} {
      allow read, write: if isAdmin();
    }

    match /manualEntries/{entryId} {
      allow read, write: if isAdmin();
    }
  }
}
```

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Yes | Firebase Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Yes | Firestore project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Yes | Storage bucket (for future use) |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Yes | Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Yes | Firebase App ID |
| `VITE_ADMIN_EMAILS` | Yes | Comma-separated admin emails |
| `VITE_DATA_PROVIDER` | No | `local` (default), `api`, or `firestore` |
| `VITE_API_KEY` | No | football-data.org API key |
| `VITE_API_BASE_URL` | No | API base URL override |

## Limitations of Static Hosting

| Limitation | Impact | Mitigation |
|---|---|---|
| No server-side code | Scoring runs in browser on admin trigger | Admin manually recalculates |
| No webhooks | Cannot receive push updates from API | Poll on interval instead |
| API keys exposed | football-data.org key visible in bundle | Low-risk; restrict by domain in API dashboard |
| No scheduled jobs | Cannot auto-recalculate at match end | Admin runs manually |
| CORS restrictions | Some APIs block browser requests | Use football-data.org which allows it, or proxy |

For zero-cost operation these are acceptable trade-offs. If budget allows later, adding a single Firebase Cloud Function resolves all of them.

## Custom Domain (Optional)

GitHub Pages supports custom domains:

1. Buy domain (e.g., `worldcup2026.yourdomain.ro`)
2. Settings → Pages → Custom domain → enter domain
3. Add CNAME DNS record pointing to `yourusername.github.io`
4. Enable "Enforce HTTPS"
5. Add custom domain to Firebase authorized domains
