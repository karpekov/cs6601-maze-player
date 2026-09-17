<script lang="ts">
	import type { EpisodeResult } from '$lib/game.svelte';
	import { STEP_COST } from '$lib/maze';

	type Props = {
		result: EpisodeResult;
		saveState: 'idle' | 'saving' | 'saved' | 'error' | 'disabled';
		onnext: () => void;
	};

	let { result, saveState, onnext }: Props = $props();

	const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);
	let won = $derived(result.outcome === 'goal');
	let stepTotal = $derived(result.moves * STEP_COST);
</script>

<div class="scrim">
	<div class="card panel" class:won class:portal={result.viaPortal}>
		<div class="emoji">{result.viaPortal ? '🌀' : won ? '🏆' : '☠️'}</div>
		<h2>
			{#if result.viaPortal}
				You took the secret portal
			{:else if won}
				You found the treasure!
			{:else}
				You fell into a trap
			{/if}
		</h2>
		<p class="sub">
			{#if result.viaPortal}
				Bang on a wall long enough and the maze gives up. The score still counts.
			{:else if won}
				{result.moves} moves through an unmapped maze and you walked out rich.
			{:else}
				The trap was worth {result.terminalValue} points. Learn where it is and try again.
			{/if}
		</p>

		<dl class="breakdown">
			<div>
				<dt>Steps</dt>
				<dd class="mono">{result.moves} × {STEP_COST} = {stepTotal}</dd>
			</div>
			<div>
				<dt>{won ? 'Treasure' : 'Trap'}</dt>
				<dd class="mono" class:positive={won} class:negative={!won}>{fmt(result.terminalValue)}</dd>
			</div>
			<div class="total">
				<dt>Episode reward</dt>
				<dd
					class="mono"
					class:positive={result.totalReward > 0}
					class:negative={result.totalReward < 0}
				>
					{fmt(result.totalReward)}
				</dd>
			</div>
		</dl>

		<button class="btn btn-primary" onclick={onnext}>
			Next episode <kbd>↵</kbd>
		</button>

		<p class="save {saveState}">
			{#if saveState === 'saving'}
				Saving your score…
			{:else if saveState === 'saved'}
				✓ Saved to the leaderboard
			{:else if saveState === 'error'}
				⚠ Couldn't reach Firestore — score not saved
			{:else if saveState === 'disabled'}
				Firestore not configured — score not saved
			{:else}
				&nbsp;
			{/if}
		</p>
	</div>
</div>

<style>
	.scrim {
		position: absolute;
		inset: 0;
		z-index: 10;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(247, 248, 252, 0.78);
		backdrop-filter: blur(3px);
		animation: fade 0.25s ease-out;
	}

	.card {
		width: min(380px, 100%);
		padding: 1.5rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		background: var(--paper);
		border-color: rgba(220, 53, 69, 0.45);
		box-shadow: 0 26px 60px -24px rgba(220, 53, 69, 0.45);
		animation: rise 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.2);
	}

	.card.won {
		border-color: rgba(15, 157, 88, 0.5);
		box-shadow: 0 26px 60px -24px rgba(15, 157, 88, 0.5);
	}

	.card.portal {
		border-color: rgba(109, 77, 242, 0.5);
		box-shadow: 0 26px 60px -24px rgba(109, 77, 242, 0.55);
	}

	.card.portal .emoji {
		animation: spin 1.6s linear infinite;
	}

	.emoji {
		font-size: 2.6rem;
		line-height: 1;
	}

	h2 {
		font-size: 1.35rem;
	}

	.sub {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.45;
		color: var(--muted);
	}

	.breakdown {
		margin: 0.4rem 0 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.9rem;
	}

	.breakdown div {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.35rem 0.1rem;
	}

	.breakdown dt {
		color: var(--muted);
	}

	.breakdown dd {
		margin: 0;
		font-weight: 700;
	}

	.total {
		border-top: 1px solid var(--border);
		padding-top: 0.5rem !important;
		font-size: 1.05rem;
	}

	.save {
		margin: 0;
		min-height: 1.2rem;
		font-size: 0.78rem;
		color: var(--muted);
	}

	.save.saved {
		color: var(--green);
	}

	.save.error,
	.save.disabled {
		color: var(--amber);
	}

	@keyframes spin {
		to {
			transform: rotate(1turn);
		}
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(14px) scale(0.96);
		}
	}
</style>
