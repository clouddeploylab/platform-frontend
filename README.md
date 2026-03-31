# Monolotic App Frontend

Next.js dashboard for authentication, repository browsing, deployment triggering, and real-time Jenkins build logs.

## Tech stack

- Next.js 16 (App Router)
- React 19
- NextAuth (GitHub OAuth)
- Redux Toolkit

## Clone and run

1. Clone and enter the project:

```bash
git clone <your-frontend-repo-url>
cd monolotic-app-frontend
```

2. Install dependencies:

```bash
npm install
```

3. Create `.env.local`:

```bash
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<random-secret>
GITHUB_CLIENT_ID=<github-oauth-client-id>
GITHUB_CLIENT_SECRET=<github-oauth-client-secret>

# Backend API URL (same value for both is recommended in local)
BACKEND_URL=http://localhost:8080
NEXT_PUBLIC_API_URL=http://localhost:8080
```

4. Run the frontend:

```bash
npm run dev
```

Open `http://localhost:3000`.

## How to use

1. Sign in with GitHub.
2. Open Dashboard and click `Deploy` on any repository.
3. The page will auto-start Jenkins log streaming in the same screen.
4. Use the Deployments page for deployment status and manual stream controls.

## Run checks

```bash
npm run lint
npm run build
```

## Notes for new contributors

- Deploy flow depends on backend response fields: `queueItemId`, `queueUrl`, and `jenkinsJobName`.
- Live log streaming uses backend WebSocket endpoint:
  - `ws://localhost:8080/ws/jenkins/logs?job=<job>&queueItem=<id>&token=<backend-jwt>`
- Browser WebSocket cannot send `Authorization` headers directly, so JWT is passed in query during handshake.
