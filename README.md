# World Cup 2026 Prediction Game

A mobile-responsive web app where users log in with Google, predict match scores for FIFA World Cup 2026, and compete on a leaderboard.

## Features

- Google authentication via Firebase
- View all 48 teams, 12 groups, 104 matches
- Predict exact scores before match kickoff
- Automatic score calculation and leaderboard
- Live match status with periodic refresh
- Group standings calculated from results
- Knockout bracket view (Round of 32 through Final)
- Admin panel for managing results and manual predictions
- Romania timezone display (Europe/Bucharest) throughout
- Works for anonymous users (read-only) and authenticated users

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| Auth | Firebase Authentication (Google Sign-In) |
| Database | Cloud Firestore |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions |
| Timezone | date-fns-tz |

## Project Structure

```
worldcup-prediction-game/
├── public/
│   └── flags/               # Flag images (fallback)
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── auth/
│   │   ├── bracket/
│   │   ├── fixtures/
│   │   ├── groups/
│   │   ├── leaderboard/
│   │   ├── predictions/
│   │   └── ui/
│   ├── data/
│   │   ├── teams.json       # Static team data
│   │   └── fixtures.json    # Static fixture data
│   ├── hooks/
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Fixtures.tsx
│   │   ├── MyPredictions.tsx
│   │   ├── Groups.tsx
│   │   ├── Standings.tsx
│   │   ├── Bracket.tsx
│   │   ├── Leaderboard.tsx
│   │   ├── UserStats.tsx
│   │   ├── Profile.tsx
│   │   └── Admin.tsx
│   ├── providers/
│   │   ├── DataProvider.ts       # Interface
│   │   ├── LocalJsonProvider.ts
│   │   ├── ApiProvider.ts
│   │   └── FirestoreProvider.ts
│   ├── services/
│   │   ├── firebase.ts
│   │   ├── auth.ts
│   │   ├── firestoreMatches.ts
│   │   ├── firestorePredictions.ts
│   │   ├── firestoreLeaderboard.ts
│   │   └── scoring.ts
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   ├── timezone.ts
│   │   └── scoring.ts
│   ├── App.tsx
│   └── main.tsx
├── firestore.rules
├── .env.example
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── docs/
    ├── ARCHITECTURE.md
    ├── SCORING_RULES.md
    ├── DATA_MODEL.md
    ├── API_SOURCE_STRATEGY.md
    ├── ADMIN_GUIDE.md
    ├── DEPLOYMENT.md
    └── ROADMAP.md
```

## Quick Start

### Prerequisites

- Node.js 20+
- npm or pnpm
- Firebase project (free Spark plan)
- GitHub repository

### Local Development

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/worldcup-prediction-game.git
cd worldcup-prediction-game

# Install
npm install

# Configure environment
cp .env.example .env.local
# Fill in your Firebase config values

# Start dev server
npm run dev
```

### Environment Variables

Create `.env.local` (never commit this file):

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_ADMIN_EMAILS=admin@example.com,other@example.com
VITE_DATA_PROVIDER=local   # or "api" or "firestore"
VITE_API_KEY=               # football-data.org API key if using API provider
```

### Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create project → enable Firestore and Authentication
3. Enable Google Sign-In provider
4. Add `yourusername.github.io` to authorized domains
5. Copy config values to `.env.local`
6. Deploy Firestore security rules: `firebase deploy --only firestore:rules`

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full details.

## Deployment

Push to `main` branch — GitHub Actions automatically builds and deploys to GitHub Pages.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Admin

Users whose email is in `VITE_ADMIN_EMAILS` get access to the Admin panel.

See [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md).

## Scoring

See [docs/SCORING_RULES.md](docs/SCORING_RULES.md).

## License

MIT
