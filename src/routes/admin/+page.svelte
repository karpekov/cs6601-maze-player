<script lang="ts">
	import { onMount } from 'svelte';
	import { isFirebaseConfigured } from '$lib/firebase';
	import { DIFFICULTIES, type Difficulty } from '$lib/game.svelte';
	import {
		leaderboardFor,
		statsFor,
		type DifficultyStats,
		type LeaderboardRow
	} from '$lib/leaderboard';
	import { fetchEpisodes, fetchPlayers, type StoredEpisode, type StoredPlayer } from '$lib/stats';

	let episodes = $state<StoredEpisode[]>([]);
	let players = $state<StoredPlayer[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	onMount(load);

	async function load() {
		if (!isFirebaseConfigured) {
			error = 'Firestore is not configured, so there is nothing to show yet.';
			return;
		}

		loading = true;
		error = null;
		try {
			[episodes, players] = await Promise.all([fetchEpisodes(), fetchPlayers()]);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load stats.';
		} finally {
			loading = false;
		}
	}

	let totals = $derived({
		players: new Set(episodes.map((e) => e.playerNameLower)).size,
		episodes: episodes.length,
		goals: episodes.filter((e) => e.outcome === 'goal').length,
		best: episodes.length ? Math.max(...episodes.map((e) => e.totalReward)) : null
	});
	let hardRows = $derived<LeaderboardRow[]>(leaderboardFor(episodes, 'hard'));

	const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);
	const when = (date: Date | null) =>
		date ? date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
	const medal = (i: number) => ['🥇', '🥈', '🥉'][i] ?? `${i + 1}`;
</script>

<div class="shell">
	<header class="topbar">
		<div>
			<p class="eyebrow">Instructor dashboard</p>
			<h1>Maze Explorer stats</h1>
		</div>
		<div class="actions">
			<a class="btn" href="/">← Back to the maze</a>
			<button class="btn" onclick={load} disabled={loading}>
				{loading ? 'Loading…' : 'Refresh'}
			</button>
		</div>
	</header>

	{#if error}
		<p class="error panel pad">{error}</p>
	{/if}

	<section class="totals">
		<div class="kpi panel">
			<span class="k">Players</span>
			<span class="v mono">{totals.players}</span>
			<span class="sub">{players.length} registered</span>
		</div>
		<div class="kpi panel">
			<span class="k">Episodes</span>
			<span class="v mono">{totals.episodes}</span>
		</div>
		<div class="kpi panel">
			<span class="k">Treasure found</span>
			<span class="v mono">{totals.goals}</span>
			<span class="sub">
				{totals.episodes ? ((totals.goals / totals.episodes) * 100).toFixed(1) : '0'}% of episodes
			</span>
		</div>
		<div class="kpi panel">
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
				{@render leaderboardTable(difficulty)}
			</div>
		{/each}
	</section>

	<details class="board panel hard">
		<summary>
			<h2>Hard</h2>
			<span class="tagline">{DIFFICULTIES.hard.tagline}</span>
			<span class="count">
				{hardRows.length
					? `${hardRows.length} ${hardRows.length === 1 ? 'player' : 'players'}`
					: 'no episodes yet'}
			</span>
		</summary>
		<div class="hard-body">
			{@render summaryStats(statsFor(episodes, 'hard'))}
			{@render leaderboardTable('hard')}
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

{#snippet leaderboardTable(difficulty: Difficulty)}
	{@const rows = leaderboardFor(episodes, difficulty)}
	{#if rows.length === 0}
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
				{#each rows as row, i (row.playerName + i)}
					<tr>
						<td class="rank">{medal(i)}</td>
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
		gap: 0.5rem;
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
	}

	tbody tr:hover {
		background: var(--surface);
	}

	.num {
		text-align: right;
	}

	.rank {
		width: 2.4rem;
	}

	.player {
		font-weight: 600;
	}

	.empty {
		margin: 0;
		font-size: 0.88rem;
		color: var(--muted);
	}

	@media (max-width: 820px) {
		.boards {
			grid-template-columns: 1fr;
		}
	}
</style>
