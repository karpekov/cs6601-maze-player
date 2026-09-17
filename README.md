# Maze Explorer — human play, in the browser

A SvelteKit front end where CS6601 students play the `complex_maze` gridworld by
hand: no Q-learning, just a human feeling their way through a dark maze, falling
into traps, and eventually finding the treasure. Episode stats go to Firestore
so you can put a leaderboard on the projector.

## Game rules

The maze is ported cell-for-cell from `create_complex_maze()` in the
[Q-learning repo](https://github.com/karpekov/cs3600-q-learning/blob/main/graph_definitions.py):
20 × 23 grid, 245 open cells, one treasure worth **+1000** and eighteen traps
worth **−5 to −20**. Every move costs **−1**, and any terminal cell (trap or
treasure) ends the episode — the same numbers the pygame human-play mode uses.

Like the pygame version, the maze is hidden. You light up cells you have stood
on, you can see which neighbouring cells are open, and trap values only become
legible once you have landed on one. Map knowledge carries over between episodes
of the same session, so repeated attempts get smarter.

| Mode       | Intended move | Slips left | Slips right |
| ---------- | ------------- | ---------- | ----------- |
| **Easy**   | 1.00          | —          | —           |
| **Medium** | 0.80          | 0.10       | 0.10        |
| **Hard**   | 1/3           | 1/3        | 1/3         |

Slips are geometric: 90° to either side of the direction you pressed. Walking
into a wall leaves you in place and still costs a point.

<details>
<summary>Secret portal (spoiler)</summary>

Bang into the wall immediately **left** of the start cell five times in a row
and it tears open, warping you straight onto the treasure. Stepping off the
start cell, or any move that isn't a bump to the left, resets the count. Portal runs show their own
end-of-episode card and count on the leaderboard like any other run.

</details>

## Play on a phone

The site is meant to be playable in a class on a phone as well as a laptop.

**Landing.** Easy, Medium, and Hard stack as equal-width cards so the long
Hard copy does not squeeze the others. The name field stays at 16px and does
not auto-focus, which keeps iOS from zooming the page. The About block
(problem, class, credit) sits below the form.

**In the maze.** The view is locked to the screen — no scrolling. A single top
bar holds the difficulty toggle (equal Easy / Medium / Hard buttons) and
**Leave maze**. Under that is a one-row stats strip (episode, moves, reward,
best, explored) and a short last-move line; the legend and past-episode log
are hidden. The grid uses almost all leftover space. The D-pad sits at the
bottom and grows on taller phones when there is room. Buttons are large enough
that a double tap is two moves, not a zoom. Keyboard hints are hidden; move
with the D-pad.

## Run it locally

Requires Node 20.19+, 22.12+, or 24 (see `.nvmrc`; the Svelte toolchain rejects
odd-numbered releases like Node 23).

```bash
nvm use            # -> Node 24
npm install
cp .env.example .env.local   # then fill in the Firebase web config
npm run dev
```

The game is playable without Firestore — it just tells you scores aren't saved.
Dashboard passwords for this machine live in `.passwords` (gitignored). `.vscode`
is gitignored as well.

## Firestore

The `cs3600-maze-explorer` Firebase project and its web app already exist, and
`.env.local` holds that project's config. Two collections are used:

- `players` — one document per player name (`name`, `sessions`, `firstSeenAt`,
  `lastSeenAt`, `lastDifficulty`)
- `episodes` — one document per finished episode (`playerName`, `difficulty`,
  `outcome`, `totalReward`, `moves`, `terminalValue`, `exploredCells`,
  `durationMs`, `episodeNumber`, `endedAt`)
- `settings/app` — optional `scoresResetAt` cutoff so the dashboard can start a
  fresh scoring window without deleting anything

Security rules live in [`firestore.rules`](firestore.rules): the data is
append-only and world-readable, with no player login. Deploy them with

```bash
firebase deploy --only firestore:rules
```

## Dashboard

Type anything containing `admin` into the name field on the landing screen, or
just visit `/admin` — the page is not gated. Easy and Medium leaderboards sit
side by side, each above its own summary stats (episodes, players, goal rate,
average reward and moves, fewest moves to the treasure); Hard expands below on
demand. Each leaderboard ranks a player's best single episode, breaking ties by
fewest moves. Portal runs count the same as any other episode. The board loads
once when you open `/admin` and stays still until you press **Go Live**
(password `golive`), which refreshes every second while that tab is visible and
turns itself off after 30 minutes. **Stop live** needs no password. Closing the
tab or the 30-minute cutoff also ends the polling so an idle dashboard does not
keep reading Firestore. Click **Go Live** again to resume. Highlights and news
chips only run while live; they call out top-3 changes. A tiny menu in the top
bar resets the scoring window (password `delete`); older Firestore rows are left
in place and simply ignored.

On a phone the dashboard stacks: compact title, wrapping action buttons (**Go
Live**, **Maze**, **Refresh**), a 2×2 stats strip, then Easy, Medium, and Hard
boards one under another. Password fields stay at 16px and do not auto-focus, so
iOS does not zoom the page. Leaderboard tables scroll sideways if a name is
long.

## Deploying to Vercel

1. Import the repo and set **Root Directory** to `web`. The framework preset
   (SvelteKit, via `@sveltejs/adapter-vercel`) is detected automatically.
2. Add the six `VITE_FIREBASE_*` variables from `.env.local` to the project's
   environment variables — they are read at build time.
3. Add the deployment domain under **Firebase console → Authentication →
   Settings → Authorized domains** only if you later add Firebase Auth; plain
   Firestore access needs no domain allow-list.

Every route is prerendered and client-rendered (`src/routes/+layout.ts`), so the
deployment is static and Firestore is the only backend.
