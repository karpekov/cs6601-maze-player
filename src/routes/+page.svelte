<script lang="ts">
	import { goto } from '$app/navigation';
	import DifficultyPicker from '$lib/components/DifficultyPicker.svelte';
	import EpisodeOverlay from '$lib/components/EpisodeOverlay.svelte';
	import Hud from '$lib/components/Hud.svelte';
	import Landing from '$lib/components/Landing.svelte';
	import MazeBoard from '$lib/components/MazeBoard.svelte';
	import { isFirebaseConfigured } from '$lib/firebase';
	import {
		ARROW,
		DIFFICULTIES,
		GameSession,
		KEY_TO_DIRECTION,
		type Difficulty,
		type Direction
	} from '$lib/game.svelte';
	import { isAdminName } from '$lib/leaderboard';
	import { logPlayerEntry, saveEpisode } from '$lib/stats';

	let session = $state<GameSession | null>(null);
	let difficulty = $state<Difficulty>('easy');
	let sessionId = '';
	let saveState = $state<'idle' | 'saving' | 'saved' | 'error' | 'disabled'>('idle');
	let savedEpisodes = 0;

	function enter(name: string, chosen: Difficulty) {
		if (isAdminName(name)) {
			goto('/admin');
			return;
		}

		sessionId = crypto.randomUUID();
		savedEpisodes = 0;
		saveState = 'idle';
		session = new GameSession(name, chosen);
		logPlayerEntry(name, chosen).catch((error) => console.warn('player log failed', error));
	}

	function nextEpisode() {
		saveState = 'idle';
		session?.nextEpisode();
	}

	function switchDifficulty(next: Difficulty) {
		difficulty = next;
		saveState = 'idle';
		session?.setDifficulty(next);
	}

	function step(direction: Direction) {
		session?.move(direction);
	}

	function handleKey(event: KeyboardEvent) {
		const active = session;
		if (!active) return;

		if (active.playing) {
			const direction = KEY_TO_DIRECTION[event.key];
			if (!direction) return;
			event.preventDefault();
			step(direction);
			return;
		}

		if (event.key === 'Enter' || event.key === ' ' || event.key === 'n') {
			event.preventDefault();
			nextEpisode();
		}
	}

	// Persist each finished episode exactly once.
	$effect(() => {
		const active = session;
		if (!active) return;

		const finished = active.history;
		if (finished.length <= savedEpisodes) return;
		savedEpisodes = finished.length;

		const result = finished[finished.length - 1];

		if (!isFirebaseConfigured) {
			saveState = 'disabled';
			return;
		}

		saveState = 'saving';
		saveEpisode({
			...result,
			playerName: active.playerName,
			sessionId,
			exploredCells: active.revealed.size
		})
			.then(() => (saveState = 'saved'))
			.catch((error) => {
				console.warn('episode save failed', error);
				saveState = 'error';
			});
	});

	let lastResult = $derived(session?.history.at(-1) ?? null);
	const directions: Direction[] = ['up', 'left', 'down', 'right'];
</script>

<svelte:window onkeydown={handleKey} />

<div class="shell">
	{#if !session}
		<div class="center">
			<Landing bind:difficulty configured={isFirebaseConfigured} onenter={enter} />
		</div>
	{:else}
		<header class="topbar panel">
			<div class="brand">
				<span class="dot"></span>
				Maze Explorer
			</div>

			<div class="mode">
				<span class="mode-label">Difficulty</span>
				<DifficultyPicker value={session.difficulty} onselect={switchDifficulty} compact />
				<span class="mode-hint">{DIFFICULTIES[session.difficulty].description}</span>
			</div>

			<div class="who">
				<span class="name">{session.playerName}</span>
				<button class="btn leave" onclick={() => (session = null)}>Leave maze</button>
			</div>
		</header>

		<main class="game">
			<aside class="side panel">
				<Hud
					episodeNumber={session.episodeNumber}
					moves={session.moves}
					reward={session.reward}
					bestReward={session.bestReward}
					exploredPct={session.exploredPct}
					lastMove={session.lastMove}
					history={session.history}
					portalPhase={session.portalPhase}
					portalCharge={session.portalCharge}
				/>

				<div class="block">
					<span class="block-label">Legend</span>
					<ul class="legend">
						<li><i class="sw you"></i> You</li>
						<li><i class="sw lit"></i> Explored</li>
						<li><i class="sw fog"></i> Unknown</li>
						<li><i class="sw wall"></i> Wall</li>
						<li><i class="sw trap"></i> Trap</li>
						<li><i class="sw goal"></i> Treasure</li>
					</ul>
				</div>
			</aside>

			<section class="stage">
				<MazeBoard
					cells={session.cells}
					row={session.row}
					col={session.col}
					status={session.status}
					lastMove={session.lastMove}
					moves={session.moves}
					portal={session.portalPhase}
				/>

				{#if !session.playing && lastResult}
					<EpisodeOverlay result={lastResult} {saveState} onnext={nextEpisode} />
				{/if}

				<div class="controls">
					<div class="dpad">
						{#each directions as direction (direction)}
							<button
								class="btn pad {direction}"
								onclick={() => step(direction)}
								disabled={!session.playing}
								aria-label={direction}
							>
								{ARROW[direction]}
							</button>
						{/each}
					</div>
					<p class="keys">
						<kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd
						><kbd>D</kbd> to move · <kbd>↵</kbd> for a new episode
					</p>
				</div>
			</section>
		</main>
	{/if}
</div>

<style>
	.shell {
		min-height: 100vh;
		padding: clamp(1rem, 3vw, 2rem);
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
	}

	.center {
		flex: 1;
		display: grid;
		place-items: center;
		padding: 2rem 0;
	}

	.topbar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 1rem;
		padding: 0.7rem 1rem;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		font-weight: 800;
		letter-spacing: -0.01em;
	}

	/* Difficulty lives dead-centre at the top so it can't be missed. */
	.mode {
		display: grid;
		grid-template-columns: auto auto;
		justify-content: center;
		align-items: center;
		gap: 0.15rem 0.7rem;
	}

	.mode-label {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--muted);
	}

	.mode-hint {
		grid-column: 2;
		font-size: 0.74rem;
		color: var(--muted);
	}

	.dot {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		background: radial-gradient(circle at 34% 30%, #ffe9a8, #f0a91b 60%, #b46f07);
		box-shadow: 0 1px 4px rgba(180, 111, 7, 0.5);
	}

	.who {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.6rem;
	}

	.name {
		font-weight: 600;
	}

	.leave {
		padding: 0.45rem 0.85rem;
		font-size: 0.85rem;
	}

	.game {
		flex: 1;
		display: flex;
		gap: 1.2rem;
		align-items: flex-start;
		justify-content: center;
	}

	.side {
		width: 270px;
		flex: none;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.block-label {
		display: block;
		margin-bottom: 0.45rem;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--muted);
	}

	.hint {
		margin: 0.5rem 0 0;
		font-size: 0.78rem;
		line-height: 1.4;
		color: var(--muted);
	}

	.legend {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.35rem 0.5rem;
		font-size: 0.78rem;
		color: var(--muted);
	}

	.legend li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.sw {
		width: 0.85rem;
		height: 0.85rem;
		border-radius: 3px;
		flex: none;
	}

	.sw.you {
		border-radius: 50%;
		background: radial-gradient(circle at 34% 30%, #ffe9a8, #f0a91b 60%, #b46f07);
		box-shadow: 0 1px 3px rgba(180, 111, 7, 0.5);
	}

	.sw.lit {
		background: rgba(255, 178, 41, 0.42);
		box-shadow: inset 0 0 0 1px rgba(201, 138, 0, 0.4);
	}

	.sw.fog {
		background: rgba(28, 38, 71, 0.09);
		box-shadow: inset 0 0 0 1px rgba(28, 38, 71, 0.22);
	}

	.sw.wall {
		background: linear-gradient(160deg, #5b6490, #3c4470);
	}

	.sw.trap {
		background: rgba(220, 53, 69, 0.22);
		box-shadow: inset 0 0 0 1px var(--red);
	}

	.sw.goal {
		background: rgba(15, 157, 88, 0.3);
		box-shadow: inset 0 0 0 1px var(--green);
	}

	.stage {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.9rem;
	}

	.controls {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
	}

	.dpad {
		display: grid;
		grid-template-areas:
			'. up .'
			'left down right';
		gap: 0.35rem;
	}

	.pad {
		width: 2.8rem;
		height: 2.4rem;
		padding: 0;
		font-size: 1.1rem;
	}

	.pad.up {
		grid-area: up;
	}
	.pad.left {
		grid-area: left;
	}
	.pad.down {
		grid-area: down;
	}
	.pad.right {
		grid-area: right;
	}

	.keys {
		margin: 0;
		font-size: 0.75rem;
		color: var(--muted);
		text-align: center;
	}

	.keys kbd + kbd {
		margin-left: 0.15rem;
	}

	@media (max-width: 900px) {
		.topbar {
			grid-template-columns: 1fr auto;
		}

		.mode {
			grid-column: 1 / -1;
			grid-row: 2;
			justify-content: start;
		}

		.game {
			flex-direction: column;
			align-items: center;
		}

		.side {
			width: min(440px, 100%);
			order: 2;
		}
	}
</style>
