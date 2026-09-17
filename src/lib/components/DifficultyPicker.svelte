<script lang="ts">
	import { DIFFICULTIES, DIFFICULTY_ORDER, type Difficulty } from '$lib/game.svelte';

	type Props = {
		value: Difficulty;
		onselect: (difficulty: Difficulty) => void;
		compact?: boolean;
	};

	let { value, onselect, compact = false }: Props = $props();
</script>

<div class="picker" class:compact role="radiogroup" aria-label="Difficulty">
	{#each DIFFICULTY_ORDER as difficulty (difficulty)}
		{@const info = DIFFICULTIES[difficulty]}
		<button
			type="button"
			role="radio"
			aria-checked={value === difficulty}
			class="option {difficulty}"
			class:selected={value === difficulty}
			onclick={() => onselect(difficulty)}
		>
			<span class="label">{info.label}</span>
			{#if !compact}
				<span class="tagline">{info.tagline}</span>
				<span class="desc">{info.description}</span>
			{/if}
		</button>
	{/each}
</div>

<style>
	.picker {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.6rem;
	}

	.option {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.75rem 0.8rem;
		text-align: left;
		border-radius: 14px;
		background: var(--paper);
		border: 1px solid var(--border);
		transition:
			border-color 0.2s ease,
			background 0.2s ease,
			transform 0.12s ease;
	}

	.option:hover {
		transform: translateY(-2px);
		background: #fbfbfe;
	}

	.label {
		font-weight: 700;
	}

	.tagline {
		font-size: 0.78rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.desc {
		margin-top: 0.35rem;
		font-size: 0.8rem;
		line-height: 1.35;
		color: var(--muted);
	}

	.compact {
		gap: 0.35rem;
	}

	.compact .option {
		padding: 0.45rem 1.1rem;
		border-radius: 11px;
		align-items: center;
		font-size: 0.95rem;
	}

	.compact .option.selected {
		box-shadow: 0 2px 10px -4px rgba(28, 38, 71, 0.5);
	}

	.easy.selected {
		border-color: var(--green);
		background: rgba(15, 157, 88, 0.12);
	}

	.medium.selected {
		border-color: var(--gold);
		background: rgba(201, 138, 0, 0.14);
	}

	.hard.selected {
		border-color: var(--red);
		background: rgba(220, 53, 69, 0.12);
	}

	.selected .label {
		color: var(--text);
	}

	.selected .tagline {
		color: var(--text);
	}
</style>
