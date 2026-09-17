<script lang="ts">
	import { onMount } from 'svelte';
	import { isFirebaseConfigured } from '$lib/firebase';
	import { DIFFICULTIES, DIFFICULTY_ORDER, type Difficulty } from '$lib/game.svelte';
	import {
		leaderboardFor,
		statsFor,
		type DifficultyStats,
		type LeaderboardRow
	} from '$lib/leaderboard';
	import {
		fetchEpisodes,
		fetchPlayers,
		fetchScoresResetAt,
		resetScores,
		type StoredEpisode,
		type StoredPlayer
	} from '$lib/stats';

	const RESET_PASSWORD = 'delete';
	const LIVE_PASSWORD = 'golive';
	const POLL_MS = 1_000;
	const LIVE_MS = 30 * 60_000;
	const FLASH_MS = 3200;
	const PODIUM = 3;
	const FEED_MAX = 4;

	type FlashKind = 'join' | 'up' | 'down' | 'score';
	type RowFlash = { kind: FlashKind; delta: number };
	type LiveEvent = { id: number; kind: FlashKind; text: string };
	type RankSnap = Map<string, { rank: number; bestReward: number; name: string }>;
	type Boards = Record<Difficulty, LeaderboardRow[]>;
	type FlashMap = Record<string, RowFlash>;

	const flashKey = (difficulty: Difficulty, name: string) =>
		`${difficulty}:${name.trim().toLowerCase()}`;

	let episodes = $state<StoredEpisode[]>([]);
	let players = $state<StoredPlayer[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let scoresResetAt = $state<Date | null>(null);
	let resetPassword = $state('');
	let resetState = $state<'idle' | 'working' | 'wrong' | 'done'>('idle');
	let live = $state(false);
	let livePassword = $state('');
	let liveWrong = $state(false);
	let livePasswordEl: HTMLInputElement | undefined;
	let boardRows = $state.raw<Boards>({ easy: [], medium: [], hard: [] });
	let flashes = $state<FlashMap>({});
	let feed = $state<LiveEvent[]>([]);
	let bumped = $state<Record<string, boolean>>({});
	let viewRows = $derived.by(() => {
		const active = flashes;
		const out = { easy: [], medium: [], hard: [] } as Record<
			Difficulty,
			(LeaderboardRow & { flash?: RowFlash })[]
		>;
		for (const difficulty of DIFFICULTY_ORDER) {
			out[difficulty] = boardRows[difficulty].map((row) => ({
				...row,
				flash: active[flashKey(difficulty, row.playerName)]
			}));
		}
		return out;
	});

	let primed = false;
	let inFlight = false;
	let eventSeq = 0;
	let clearFlashes: ReturnType<typeof setTimeout> | null = null;
	let poll: ReturnType<typeof setInterval> | null = null;
	let liveCutoff: ReturnType<typeof setTimeout> | null = null;

	onMount(() => {
		void load();

		const onVis = () => {
			if (!live) return;
			if (document.visibilityState === 'visible') void load(true);
		};
		document.addEventListener('visibilitychange', onVis);

		return () => {
			stopLive();
			document.removeEventListener('visibilitychange', onVis);
			if (clearFlashes) clearTimeout(clearFlashes);
		};
	});

	function startLive() {
		if (live) return;
		live = true;
		livePassword = '';
		liveWrong = false;
		void load(true);
		poll = setInterval(() => {
			if (document.visibilityState !== 'visible') return;
			if (resetState === 'working') return;
			void load(true);
		}, POLL_MS);
		liveCutoff = setTimeout(stopLive, LIVE_MS);
	}

	function tryStartLive(event: SubmitEvent) {
		event.preventDefault();
		if (livePassword !== LIVE_PASSWORD) {
			liveWrong = true;
			return;
		}
		startLive();
	}

	function onLivePromptToggle(event: Event) {
		const open = (event.currentTarget as HTMLDetailsElement).open;
		if (open) {
			liveWrong = false;
			const fine = window.matchMedia('(hover: hover) and (min-width: 700px)').matches;
			if (fine) queueMicrotask(() => livePasswordEl?.focus());
			return;
		}
		liveWrong = false;
		livePassword = '';
	}

	function stopLive() {
		live = false;
		if (poll) {
			clearInterval(poll);
			poll = null;
		}
		if (liveCutoff) {
			clearTimeout(liveCutoff);
			liveCutoff = null;
		}
	}

	async function load(silent = false) {
		if (!isFirebaseConfigured) {
			error = 'Firestore is not configured, so there is nothing to show yet.';
			return;
		}
		if (inFlight) return;
		inFlight = true;
		if (!silent) loading = true;
		if (!silent) error = null;

		try {
			const since = await fetchScoresResetAt();
			const [nextEpisodes, nextPlayers] = await Promise.all([
				fetchEpisodes(1000, since),
				fetchPlayers(500, since)
			]);
			const incoming = primed ? announce(episodes, nextEpisodes) : {};
			paint(nextEpisodes);
			if (Object.keys(incoming).length) lightUp(incoming);
			episodes = nextEpisodes;
			players = nextPlayers;
			scoresResetAt = since;
			primed = true;
		} catch (e) {
			if (!silent) error = e instanceof Error ? e.message : 'Failed to load stats.';
		} finally {
			inFlight = false;
			loading = false;
		}
	}

	function snapshot(list: StoredEpisode[]): Record<Difficulty, RankSnap> {
		const out = {} as Record<Difficulty, RankSnap>;
		for (const difficulty of DIFFICULTY_ORDER) {
			out[difficulty] = new Map(
				leaderboardFor(list, difficulty).map((row, rank) => [
					row.playerName.toLowerCase(),
					{ rank, bestReward: row.bestReward, name: row.playerName }
				])
			);
		}
		return out;
	}

	function announce(prevList: StoredEpisode[], nextList: StoredEpisode[]): FlashMap {
		const prev = snapshot(prevList);
		const next = snapshot(nextList);
		const incoming: FlashMap = {};
		const events: LiveEvent[] = [];

		for (const difficulty of DIFFICULTY_ORDER) {
			const label = DIFFICULTIES[difficulty].label;
			for (const [key, row] of next[difficulty]) {
				const before = prev[difficulty].get(key);
				const id = flashKey(difficulty, row.name);
				if (!before) {
					incoming[id] = { kind: 'join', delta: 0 };
					if (row.rank < PODIUM) {
						events.push(makeEvent('join', `${row.name} took ${place(row.rank)} on ${label}`));
					}
				} else if (row.rank < before.rank) {
					const delta = before.rank - row.rank;
					incoming[id] = { kind: 'up', delta };
					if (row.rank < PODIUM) {
						events.push(makeEvent('up', `${row.name} climbed to ${place(row.rank)} on ${label}`));
					}
				} else if (row.rank > before.rank) {
					const delta = row.rank - before.rank;
					incoming[id] = { kind: 'down', delta };
					if (before.rank < PODIUM) {
						events.push(
							makeEvent(
								'down',
								row.rank < PODIUM
									? `${row.name} dropped to ${place(row.rank)} on ${label}`
									: `${row.name} dropped out of the top 3 on ${label}`
							)
						);
					}
				} else if (row.bestReward !== before.bestReward) {
					incoming[id] = { kind: 'score', delta: 0 };
				}
			}
		}

		if (events.length) pushFeed(events);

		const prevPlayers = new Set(prevList.map((e) => e.playerNameLower)).size;
		const nextPlayers = new Set(nextList.map((e) => e.playerNameLower)).size;
		const prevGoals = prevList.filter((e) => e.outcome === 'goal').length;
		const nextGoals = nextList.filter((e) => e.outcome === 'goal').length;
		const prevBest = prevList.length ? Math.max(...prevList.map((e) => e.totalReward)) : null;
		const nextBest = nextList.length ? Math.max(...nextList.map((e) => e.totalReward)) : null;
		bumpKpi({
			players: nextPlayers !== prevPlayers,
			episodes: nextList.length !== prevList.length,
			goals: nextGoals !== prevGoals,
			best: nextBest !== prevBest
		});

		return incoming;
	}

	function paint(list: StoredEpisode[]) {
		const next: Boards = { easy: [], medium: [], hard: [] };
		for (const difficulty of DIFFICULTY_ORDER) {
			next[difficulty] = leaderboardFor(list, difficulty);
		}
		boardRows = next;
	}

	function lightUp(incoming: FlashMap) {
		flashes = incoming;
		if (clearFlashes) clearTimeout(clearFlashes);
		clearFlashes = setTimeout(() => {
			flashes = {};
			clearFlashes = null;
		}, FLASH_MS);
	}

	function makeEvent(kind: FlashKind, text: string): LiveEvent {
		return { id: ++eventSeq, kind, text };
	}

	function pushFeed(events: LiveEvent[]) {
		if (!events.length) return;
		feed = [...events, ...feed].slice(0, FEED_MAX);
	}

	function bumpKpi(next: Record<string, boolean>) {
		const on: Record<string, boolean> = {};
		for (const [key, hit] of Object.entries(next)) if (hit) on[key] = true;
		if (!Object.keys(on).length) return;
		bumped = { ...bumped, ...on };
		setTimeout(() => {
			const copy = { ...bumped };
			for (const key of Object.keys(on)) delete copy[key];
			bumped = copy;
		}, 700);
	}

	async function resetLeaderboard(event: SubmitEvent) {
		event.preventDefault();
		if (resetPassword !== RESET_PASSWORD) {
			resetState = 'wrong';
			return;
		}
		if (!isFirebaseConfigured) {
			error = 'Firestore is not configured, so there is nothing to reset.';
			return;
		}

		resetState = 'working';
		try {
			await resetScores();
			resetPassword = '';
			episodes = [];
			players = [];
			paint([]);
			flashes = {};
			scoresResetAt = new Date();
			resetState = 'done';
			await load();
		} catch (e) {
			resetState = 'idle';
			error = e instanceof Error ? e.message : 'Failed to reset scores.';
		}
	}

	let totals = $derived({
		players: new Set(episodes.map((e) => e.playerNameLower)).size,
		episodes: episodes.length,
		goals: episodes.filter((e) => e.outcome === 'goal').length,
		best: episodes.length ? Math.max(...episodes.map((e) => e.totalReward)) : null
	});

	const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);
	const when = (date: Date | null) =>
		date
			? date.toLocaleString(undefined, {
					month: 'short',
					day: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				})
			: '—';
	const medal = (i: number) => ['🥇', '🥈', '🥉'][i] ?? `${i + 1}`;
	const place = (rank: number) => ['1st', '2nd', '3rd'][rank] ?? `${rank + 1}th`;
</script>

<div class="shell">
	<header class="topbar">
		<div>
			<p class="eyebrow">Instructor dashboard</p>
			<h1>Maze Explorer stats</h1>
		</div>
		<div class="actions">
			{#if live}
				<button
					class="btn live-btn on"
					onclick={stopLive}
					title="Stops automatically after 30 minutes"
				>
					<span class="dot"></span>
					Stop live
				</button>
			{:else}
				<details class="live-menu" ontoggle={onLivePromptToggle}>
					<summary
						class="btn live-btn btn-primary"
						title="Refresh every second while this tab is visible"
					>
						<span class="dot"></span>
						Go Live
					</summary>
					<div class="live-panel panel">
						<form class="live-form" onsubmit={tryStartLive}>
							<input
								class="input"
								type="password"
								placeholder="Password"
								autocomplete="off"
								bind:this={livePasswordEl}
								bind:value={livePassword}
							/>
							<button class="btn btn-primary live-start" type="submit" disabled={!livePassword}>
								Start
							</button>
						</form>
						{#if liveWrong}
							<p class="reset-msg">Wrong password.</p>
						{/if}
					</div>
				</details>
			{/if}
			<a class="btn back" href="/">
				<span class="back-long">← Back to the maze</span>
				<span class="back-short">← Maze</span>
			</a>
			<button class="btn" onclick={() => load()} disabled={loading}>
				{loading ? 'Loading…' : 'Refresh'}
			</button>
			<details class="reset-menu">
				<summary title="Reset scores">···</summary>
				<div class="reset-panel panel">
					<form class="reset-form" onsubmit={resetLeaderboard}>
						<input
							class="input"
							type="password"
							placeholder="Password"
							autocomplete="off"
							bind:value={resetPassword}
							disabled={resetState === 'working'}
						/>
						<button class="btn danger-btn" type="submit" disabled={resetState === 'working' || !resetPassword}>
							{resetState === 'working' ? '…' : 'Reset'}
						</button>
					</form>
					{#if scoresResetAt}
						<p class="since mono">since {when(scoresResetAt)}</p>
					{/if}
					{#if resetState === 'wrong'}
						<p class="reset-msg">Wrong password.</p>
					{:else if resetState === 'done'}
						<p class="reset-msg ok">Cleared.</p>
					{/if}
				</div>
			</details>
		</div>
	</header>

	<ul class="feed" aria-live="polite">
		{#each feed as event (event.id)}
			<li class={event.kind}>{event.text}</li>
		{/each}
	</ul>

	{#if error}
		<p class="error panel pad">{error}</p>
	{/if}

	<section class="totals">
		<div class="kpi panel" class:bump={bumped.players}>
			<span class="k">Players</span>
			<span class="v mono">{totals.players}</span>
			<span class="sub">{players.length} registered</span>
		</div>
		<div class="kpi panel" class:bump={bumped.episodes}>
			<span class="k">Episodes</span>
			<span class="v mono">{totals.episodes}</span>
		</div>
		<div class="kpi panel" class:bump={bumped.goals}>
			<span class="k">Treasure found</span>
			<span class="v mono">{totals.goals}</span>
			<span class="sub">
				{totals.episodes ? ((totals.goals / totals.episodes) * 100).toFixed(1) : '0'}% of episodes
			</span>
		</div>
		<div class="kpi panel" class:bump={bumped.best}>
			<span class="k">Best episode</span>
			<span class="v mono" class:positive={(totals.best ?? 0) > 0}>
				{totals.best === null ? '—' : fmt(totals.best)}
			</span>
		</div>
	</section>

	<section class="boards">
		{#each ['easy', 'medium'] as const as difficulty (difficulty)}
			{@const s = statsFor(episodes, difficulty)}
			<div class="board panel {difficulty}">
				<div class="board-head">
					<h2>{DIFFICULTIES[difficulty].label}</h2>
					<span class="tagline">{DIFFICULTIES[difficulty].tagline}</span>
				</div>
				{@render summaryStats(s)}
				{#if viewRows[difficulty].length === 0}
					<p class="empty">No episodes recorded yet.</p>
				{:else}
					<table>
						<thead>
							<tr>
								<th class="rank">#</th>
								<th>Player</th>
								<th class="num">Best</th>
								<th class="num">Moves</th>
								<th class="num">Eps</th>
								<th class="num">Goals</th>
							</tr>
						</thead>
						<tbody>
							{#each viewRows[difficulty] as row, i (`${row.playerName}:${row.flash?.kind ?? ''}`)}
								<tr
									class:join={row.flash?.kind === 'join'}
									class:up={row.flash?.kind === 'up'}
									class:down={row.flash?.kind === 'down'}
									class:score={row.flash?.kind === 'score'}
								>
									<td class="rank">
										{medal(i)}
										{#if row.flash?.kind === 'up' && row.flash.delta}
											<span class="delta up">↑{row.flash.delta}</span>
										{:else if row.flash?.kind === 'down' && row.flash.delta}
											<span class="delta down">↓{row.flash.delta}</span>
										{:else if row.flash?.kind === 'join'}
											<span class="delta join">new</span>
										{/if}
									</td>
									<td class="player" title="Last played {when(row.lastPlayed)}">{row.playerName}</td>
									<td
										class="num mono"
										class:positive={row.bestReward > 0}
										class:negative={row.bestReward < 0}>{fmt(row.bestReward)}</td
									>
									<td class="num mono">{row.moves}</td>
									<td class="num mono">{row.episodes}</td>
									<td class="num mono">{row.goals}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		{/each}
	</section>

	<details class="board panel hard">
		<summary>
			<h2>Hard</h2>
			<span class="tagline">{DIFFICULTIES.hard.tagline}</span>
			<span class="count">
				{viewRows.hard.length
					? `${viewRows.hard.length} ${viewRows.hard.length === 1 ? 'player' : 'players'}`
					: 'no episodes yet'}
			</span>
		</summary>
		<div class="hard-body">
			{@render summaryStats(statsFor(episodes, 'hard'))}
			{#if viewRows.hard.length === 0}
				<p class="empty">No episodes recorded yet.</p>
			{:else}
				<table>
					<thead>
						<tr>
							<th class="rank">#</th>
							<th>Player</th>
							<th class="num">Best</th>
							<th class="num">Moves</th>
							<th class="num">Eps</th>
							<th class="num">Goals</th>
						</tr>
					</thead>
					<tbody>
						{#each viewRows.hard as row, i (`${row.playerName}:${row.flash?.kind ?? ''}`)}
							<tr
								class:join={row.flash?.kind === 'join'}
								class:up={row.flash?.kind === 'up'}
								class:down={row.flash?.kind === 'down'}
								class:score={row.flash?.kind === 'score'}
							>
								<td class="rank">
									{medal(i)}
									{#if row.flash?.kind === 'up' && row.flash.delta}
										<span class="delta up">↑{row.flash.delta}</span>
									{:else if row.flash?.kind === 'down' && row.flash.delta}
										<span class="delta down">↓{row.flash.delta}</span>
									{:else if row.flash?.kind === 'join'}
										<span class="delta join">new</span>
									{/if}
								</td>
								<td class="player" title="Last played {when(row.lastPlayed)}">{row.playerName}</td>
								<td
									class="num mono"
									class:positive={row.bestReward > 0}
									class:negative={row.bestReward < 0}>{fmt(row.bestReward)}</td
								>
								<td class="num mono">{row.moves}</td>
								<td class="num mono">{row.episodes}</td>
								<td class="num mono">{row.goals}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	</details>
</div>

{#snippet summaryStats(s: DifficultyStats)}
	<div class="chips">
		<div class="chip"><span class="k">Episodes</span><span class="mono">{s.episodes}</span></div>
		<div class="chip"><span class="k">Players</span><span class="mono">{s.players}</span></div>
		<div class="chip">
			<span class="k">Goal rate</span><span class="mono">{(s.goalRate * 100).toFixed(0)}%</span>
		</div>
		<div class="chip">
			<span class="k">Avg reward</span><span class="mono">{s.avgReward.toFixed(1)}</span>
		</div>
		<div class="chip">
			<span class="k">Avg moves</span><span class="mono">{s.avgMoves.toFixed(1)}</span>
		</div>
		<div class="chip">
			<span class="k">Min to goal</span><span class="mono">{s.fewestMovesToGoal ?? '—'}</span>
		</div>
	</div>
{/snippet}

<style>
	.shell {
		max-width: 1080px;
		margin: 0 auto;
		padding: clamp(1rem, 3vw, 2.2rem);
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
	}

	.topbar {
		display: flex;
		align-items: flex-end;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.eyebrow {
		margin: 0 0 0.25rem;
		font-size: 0.72rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--violet);
	}

	h1 {
		font-size: clamp(1.6rem, 4vw, 2.2rem);
		font-weight: 800;
	}

	h2 {
		font-size: 1.05rem;
	}

	.actions {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.reset-menu {
		position: relative;
	}

	.reset-menu > summary {
		list-style: none;
		cursor: pointer;
		padding: 0.15rem 0.35rem;
		font-size: 0.7rem;
		letter-spacing: 0.18em;
		color: color-mix(in srgb, var(--muted) 55%, transparent);
		user-select: none;
	}

	.reset-menu > summary::-webkit-details-marker {
		display: none;
	}

	.reset-menu > summary:hover,
	.reset-menu[open] > summary {
		color: var(--muted);
	}

	.reset-panel {
		position: absolute;
		right: 0;
		top: calc(100% + 0.35rem);
		z-index: 8;
		width: 15.5rem;
		padding: 0.7rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		box-shadow: 0 12px 32px -18px rgba(20, 24, 40, 0.45);
	}

	.reset-form {
		display: flex;
		gap: 0.35rem;
		align-items: center;
	}

	.input {
		width: 8.5rem;
		padding: 0.32rem 0.5rem;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--paper);
		font: inherit;
		font-size: 0.78rem;
	}

	.input:focus {
		outline: none;
		border-color: var(--red);
	}

	.btn.danger-btn {
		padding: 0.32rem 0.55rem;
		font-size: 0.72rem;
		background: transparent;
		border-color: rgba(220, 53, 69, 0.35);
		color: var(--red);
	}

	.since {
		margin: 0;
		font-size: 0.68rem;
		color: var(--muted);
	}

	.reset-msg {
		margin: 0;
		font-size: 0.72rem;
		color: var(--red);
	}

	.reset-msg.ok {
		color: var(--green);
	}

	.live-menu {
		position: relative;
	}

	.live-menu > summary {
		list-style: none;
		cursor: pointer;
		user-select: none;
	}

	.live-menu > summary::-webkit-details-marker {
		display: none;
	}

	.live-panel {
		position: absolute;
		left: 0;
		top: calc(100% + 0.35rem);
		z-index: 8;
		width: 15.5rem;
		padding: 0.7rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		box-shadow: 0 12px 32px -18px rgba(20, 24, 40, 0.45);
	}

	.live-form {
		display: flex;
		gap: 0.35rem;
		align-items: center;
	}

	.live-start {
		padding: 0.32rem 0.55rem;
		font-size: 0.72rem;
	}

	.live-btn .dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		background: currentColor;
		opacity: 0.45;
	}

	.live-btn.on {
		color: var(--green);
		border-color: rgba(15, 157, 88, 0.4);
		background: rgba(15, 157, 88, 0.08);
	}

	.live-btn.on .dot {
		opacity: 1;
		box-shadow: 0 0 0 0 currentColor;
		animation: live-pulse 1.8s ease-out infinite;
	}

	.feed {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		gap: 0.4rem;
		min-height: 2.15rem;
		overflow: hidden;
	}

	.feed li {
		flex: 0 0 auto;
		padding: 0.32rem 0.7rem;
		border-radius: 999px;
		font-size: 0.78rem;
		font-weight: 600;
		white-space: nowrap;
		animation: chip-in 0.35s ease-out;
	}

	.feed li.join {
		color: var(--violet);
		background: rgba(109, 77, 242, 0.12);
	}

	.feed li.up {
		color: var(--green);
		background: rgba(15, 157, 88, 0.12);
	}

	.feed li.down {
		color: var(--amber);
		background: rgba(226, 118, 27, 0.12);
	}

	.feed li.score {
		color: var(--gold);
		background: rgba(201, 138, 0, 0.14);
	}

	.btn {
		text-decoration: none;
		padding: 0.5rem 0.9rem;
		font-size: 0.86rem;
	}

	.pad {
		padding: 1.1rem;
	}

	.error {
		margin: 0;
		color: var(--red);
		font-size: 0.85rem;
	}

	.totals {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
		gap: 0.8rem;
	}

	.kpi {
		padding: 0.9rem 1rem;
	}

	.kpi.bump .v {
		animation: kpi-pop 0.45s ease;
	}

	.k {
		display: block;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--muted);
	}

	.v {
		display: block;
		margin-top: 0.2rem;
		font-size: 1.9rem;
		font-weight: 700;
		line-height: 1.1;
	}

	.sub {
		font-size: 0.74rem;
		color: var(--muted);
	}

	/* Easy and Medium sit side by side; Hard expands underneath them. */
	.boards {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.9rem;
		align-items: start;
	}

	.board {
		padding: 1.1rem;
		border-top: 3px solid var(--border);
	}

	.board.easy {
		border-top-color: var(--green);
	}

	.board.medium {
		border-top-color: var(--gold);
	}

	.board.hard {
		border-top-color: var(--red);
	}

	.board-head,
	.board summary {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 0.8rem;
	}

	.tagline {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--muted);
	}

	.board summary {
		cursor: pointer;
		list-style: none;
		margin-bottom: 0;
	}

	.board summary::-webkit-details-marker {
		display: none;
	}

	.board summary::after {
		content: '▾';
		margin-left: auto;
		font-size: 0.8rem;
		color: var(--muted);
		transition: transform 0.2s ease;
	}

	.board[open] summary::after {
		transform: rotate(180deg);
	}

	.count {
		font-size: 0.78rem;
		color: var(--muted);
	}

	.board summary .count {
		margin-left: 0.25rem;
	}

	.hard-body {
		margin-top: 0.9rem;
	}

	.chips {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
		gap: 0.4rem;
		margin-bottom: 0.9rem;
	}

	.chip {
		padding: 0.4rem 0.5rem;
		border-radius: 10px;
		background: var(--surface);
		font-size: 0.92rem;
		font-weight: 600;
	}

	.chip .k {
		margin-bottom: 0.1rem;
		font-size: 0.62rem;
	}

	@keyframes live-pulse {
		0% {
			box-shadow: 0 0 0 0 rgba(15, 157, 88, 0.55);
		}
		100% {
			box-shadow: 0 0 0 8px rgba(15, 157, 88, 0);
		}
	}

	@keyframes chip-in {
		from {
			opacity: 0;
			transform: translateY(-6px) scale(0.92);
		}
	}

	@keyframes kpi-pop {
		40% {
			transform: scale(1.02);
		}
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.86rem;
	}

	th {
		text-align: left;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
		font-weight: 600;
		padding: 0 0.4rem 0.5rem;
	}

	td {
		padding: 0.45rem 0.4rem;
		border-top: 1px solid var(--border);
	}

	.player {
		max-width: 11rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 600;
	}

	tbody tr:hover {
		background: var(--surface);
	}

	.num {
		text-align: right;
	}


	.rank {
		width: 4.2rem;
		white-space: nowrap;
	}

	.delta {
		display: inline-block;
		margin-left: 0.2rem;
		font-size: 0.68rem;
		font-weight: 800;
		animation: delta-pop 0.45s ease;
	}

	.delta.up {
		color: var(--green);
	}

	.delta.down {
		color: var(--amber);
	}

	.delta.join {
		color: var(--violet);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	tbody tr.join {
		animation: row-join 0.7s ease;
		background: rgba(109, 77, 242, 0.1);
	}

	tbody tr.up {
		animation: row-up 0.85s ease;
		background: rgba(15, 157, 88, 0.1);
	}

	tbody tr.down {
		animation: row-down 0.85s ease;
		background: rgba(226, 118, 27, 0.1);
	}

	tbody tr.score {
		animation: row-score 0.85s ease;
		background: rgba(201, 138, 0, 0.1);
	}

	.empty {
		margin: 0;
		font-size: 0.88rem;
		color: var(--muted);
	}

	@keyframes delta-pop {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
	}

	@keyframes row-join {
		from {
			opacity: 0;
			transform: translateX(-10px);
			background: rgba(109, 77, 242, 0.18);
		}
	}

	@keyframes row-up {
		0% {
			transform: translateY(8px);
			background: rgba(15, 157, 88, 0.22);
		}
		100% {
			transform: none;
			background: transparent;
		}
	}

	@keyframes row-down {
		0% {
			transform: translateY(-8px);
			background: rgba(226, 118, 27, 0.2);
		}
		100% {
			transform: none;
			background: transparent;
		}
	}

	@keyframes row-score {
		40% {
			background: rgba(201, 138, 0, 0.22);
		}
	}

	.back-short {
		display: none;
	}

	@media (max-width: 820px) {
		.shell {
			padding: max(0.75rem, env(safe-area-inset-top)) max(0.75rem, env(safe-area-inset-right))
				max(0.85rem, env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-left));
			gap: 0.7rem;
		}

		.topbar {
			flex-direction: column;
			align-items: stretch;
			gap: 0.6rem;
		}

		h1 {
			font-size: 1.4rem;
		}

		.eyebrow {
			font-size: 0.64rem;
			margin-bottom: 0.15rem;
		}

		.actions {
			margin-left: 0;
			flex-wrap: wrap;
			gap: 0.4rem;
		}

		.btn {
			min-height: 2.5rem;
			padding: 0.45rem 0.7rem;
			font-size: 0.82rem;
		}

		.back-long {
			display: none;
		}

		.back-short {
			display: inline;
		}

		.reset-menu > summary {
			min-height: 2.5rem;
			min-width: 2.5rem;
			display: grid;
			place-items: center;
			font-size: 0.85rem;
		}

		.input {
			font-size: 16px;
			width: 100%;
			padding: 0.45rem 0.55rem;
		}

		.live-panel,
		.reset-panel {
			width: min(18rem, calc(100vw - 1.5rem));
		}

		.live-form,
		.reset-form {
			width: 100%;
		}

		.feed {
			min-height: 0;
			flex-wrap: wrap;
			overflow: visible;
		}

		.feed:empty {
			display: none;
		}

		.totals {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0.4rem;
		}

		.kpi {
			padding: 0.45rem 0.55rem;
		}

		.k {
			font-size: 0.58rem;
			letter-spacing: 0.06em;
		}

		.v {
			margin-top: 0.05rem;
			font-size: 1.25rem;
		}

		.sub {
			display: none;
		}

		.boards {
			grid-template-columns: 1fr;
			gap: 0.7rem;
		}

		.board {
			padding: 0.8rem;
			overflow-x: auto;
		}

		.board-head,
		.board summary {
			gap: 0.35rem;
			margin-bottom: 0.55rem;
			min-height: 2.4rem;
			align-items: center;
		}

		.chips {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 0.3rem;
			margin-bottom: 0.6rem;
		}

		.chip {
			padding: 0.28rem 0.35rem;
			font-size: 0.8rem;
			border-radius: 8px;
		}

		.chip .k {
			font-size: 0.55rem;
		}

		table {
			font-size: 0.78rem;
		}

		th,
		td {
			padding: 0.38rem 0.28rem;
		}

		.rank {
			width: 2.6rem;
		}

		.player {
			max-width: 7.5rem;
		}
	}
</style>
