<script lang="ts">
	import {
		ARROW,
		PORTAL_BUMPS,
		type EpisodeResult,
		type MoveEvent,
		type PortalPhase
	} from '$lib/game.svelte';

	type Props = {
		episodeNumber: number;
		moves: number;
		reward: number;
		bestReward: number | null;
		exploredPct: number;
		lastMove: MoveEvent | null;
		history: EpisodeResult[];
		portalPhase: PortalPhase;
		portalCharge: number;
	};

	let {
		episodeNumber,
		moves,
		reward,
		bestReward,
		exploredPct,
		lastMove,
		history,
		portalPhase,
		portalCharge
	}: Props = $props();

	const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);
	let recent = $derived(history.slice(-7).reverse());
</script>

<div class="hud">
	<div class="stats">
		<div class="stat">
			<span class="k">Episode</span>
			<span class="v mono">{episodeNumber}</span>
		</div>
		<div class="stat">
			<span class="k">Moves</span>
			<span class="v mono">{moves}</span>
		</div>
		<div class="stat wide">
			<span class="k">Episode reward</span>
			<span class="v mono" class:positive={reward > 0} class:negative={reward < 0}>{fmt(reward)}</span>
		</div>
		<div class="stat">
			<span class="k">Your best</span>
			<span class="v mono">{bestReward === null ? '—' : fmt(bestReward)}</span>
		</div>
		<div class="stat">
			<span class="k">Explored</span>
			<span class="v mono">{exploredPct.toFixed(1)}%</span>
		</div>
	</div>

	<div class="last" aria-live="polite">
		{#if portalPhase !== 'idle'}
			<span class="portal">
				{#if portalPhase === 'charging'}
					🌀 The wall folds open…
				{:else if portalPhase === 'travel'}
					🌀 Falling through the maze!
				{:else}
					🌀 The portal spits you out on the treasure.
				{/if}
			</span>
		{:else if portalCharge >= PORTAL_BUMPS - 2}
			<span class="portal">
				{portalCharge === PORTAL_BUMPS - 1
					? '…the wall is trembling. Again?'
					: '…something behind that wall hums back.'}
			</span>
		{:else if !lastMove}
			<span class="muted">Pick a direction to take your first step.</span>
		{:else if lastMove.bumped}
			<span class="bump">🧱 You walked into a wall {ARROW[lastMove.actual]} — still cost you a point.</span>
		{:else if lastMove.slipped}
			<span class="slip">
				💫 You slipped! Aimed {ARROW[lastMove.intended]} but went {ARROW[lastMove.actual]}.
			</span>
		{:else}
			<span class="muted">Moved {ARROW[lastMove.actual]} for {fmt(lastMove.reward)}.</span>
		{/if}
	</div>

	{#if recent.length}
		<div class="log">
			<span class="k">Past episodes</span>
			<ul>
				{#each recent as episode (episode.episodeNumber)}
					<li>
						<span class="mono num">#{episode.episodeNumber}</span>
						<span class="badge {episode.outcome}">
							{episode.outcome === 'goal' ? '🏆' : '☠'}
						</span>
						<span class="mono moves">{episode.moves} mv</span>
						<span
							class="mono score"
							class:positive={episode.totalReward > 0}
							class:negative={episode.totalReward < 0}
						>
							{fmt(episode.totalReward)}
						</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style>
	.hud {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	.stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.stat {
		padding: 0.6rem 0.75rem;
		border-radius: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
	}

	.stat.wide {
		grid-column: span 2;
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
		margin-top: 0.15rem;
		font-size: 1.35rem;
		font-weight: 700;
	}

	.wide .v {
		font-size: 1.8rem;
	}

	.last {
		/* Fixed at two lines so a longer message can't shove the sidebar around. */
		height: 3.6rem;
		overflow: hidden;
		display: flex;
		align-items: center;
		padding: 0.55rem 0.75rem;
		font-size: 0.86rem;
		line-height: 1.35;
		border-radius: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
	}

	.muted {
		color: var(--muted);
	}

	.slip {
		color: var(--violet);
	}

	.bump {
		color: var(--amber);
	}

	.portal {
		color: var(--violet);
		font-weight: 600;
	}

	.log ul {
		margin: 0.45rem 0 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.log li {
		display: grid;
		grid-template-columns: 2.6rem 1.4rem 1fr auto;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.5rem;
		font-size: 0.8rem;
		border-radius: 8px;
		background: var(--surface);
	}

	.num,
	.moves {
		color: var(--muted);
	}

	.score {
		font-weight: 700;
	}

	.badge {
		font-size: 0.85rem;
	}

	@media (max-width: 900px) {
		.hud {
			gap: 0.2rem;
		}

		.stats {
			grid-template-columns: repeat(5, minmax(0, 1fr));
			gap: 0.2rem;
		}

		.stat {
			padding: 0.12rem 0.2rem;
			border-radius: 7px;
			text-align: center;
		}

		.stat.wide {
			grid-column: auto;
		}

		.k {
			font-size: 0.5rem;
			letter-spacing: 0.04em;
		}

		.v,
		.wide .v {
			margin-top: 0.02rem;
			font-size: 0.8rem;
		}

		.last {
			height: auto;
			min-height: 0;
			padding: 0.22rem 0.4rem;
			font-size: 0.7rem;
			line-height: 1.25;
			border-radius: 7px;
		}

		.log {
			display: none;
		}
	}
</style>
