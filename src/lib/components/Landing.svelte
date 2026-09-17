<script lang="ts">
	import DifficultyPicker from './DifficultyPicker.svelte';
	import { ADMIN_KEYWORD, isAdminName } from '$lib/leaderboard';
	import { TOTAL_FLOOR_CELLS } from '$lib/maze';
	import type { Difficulty } from '$lib/game.svelte';

	type Props = {
		difficulty: Difficulty;
		configured: boolean;
		onenter: (name: string, difficulty: Difficulty) => void;
	};

	let { difficulty = $bindable(), configured, onenter }: Props = $props();

	let name = $state('');
	let adminDetected = $derived(isAdminName(name));
	let ready = $derived(name.trim().length > 0);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (ready) onenter(name.trim(), difficulty);
	}
</script>

<div class="landing">
	<div class="hero">
		<p class="eyebrow">CS6601 · Gridworld</p>
		<h1>Maze <span>Explorer</span></h1>
		<p class="pitch">
			You are the agent. The map is blank: {TOTAL_FLOOR_CELLS} rooms you have never seen, with
			eighteen traps hidden somewhere among them. Feel your way to the treasure — every step costs
			you a point, every trap ends the run.
		</p>
	</div>

	<form class="card panel" onsubmit={submit}>
		<label class="field">
			<span class="field-label">Your name</span>
			<input
				class="input"
				type="text"
				bind:value={name}
				placeholder="e.g. Ada"
				maxlength="32"
				autocomplete="off"
				spellcheck="false"
			/>
		</label>

		<div class="field">
			<span class="field-label">Difficulty</span>
			<DifficultyPicker value={difficulty} onselect={(d) => (difficulty = d)} />
		</div>

		<button class="btn btn-primary enter" type="submit" disabled={!ready}>
			{adminDetected ? 'Open the dashboard' : 'Enter the maze'} →
		</button>

		{#if adminDetected}
			<p class="note admin">Admin keyword detected — you'll land on the leaderboard.</p>
		{:else}
			<p class="note">
				Hint: type <code>{ADMIN_KEYWORD}</code> in the name field for the instructor dashboard.
			</p>
		{/if}

		{#if !configured}
			<p class="note warn">
				Firestore isn't configured, so scores won't be saved. Add your Firebase keys to
				<code>web/.env.local</code>.
			</p>
		{/if}
	</form>

	<ul class="rules">
		<li><span class="glyph">⌨</span> Arrow keys or <kbd>WASD</kbd> to move</li>
		<li><span class="glyph">−1</span> Every move costs one point</li>
		<li><span class="glyph">☠</span> Traps cost 5–20 and end the episode</li>
		<li><span class="glyph">🏆</span> The treasure is worth +1000</li>
	</ul>
</div>

<style>
	.landing {
		width: min(680px, 100%);
		display: flex;
		flex-direction: column;
		gap: 1.6rem;
	}

	.eyebrow {
		margin: 0 0 0.4rem;
		font-size: 0.78rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--gold);
	}

	h1 {
		font-size: clamp(2.6rem, 8vw, 4.2rem);
		font-weight: 800;
		line-height: 0.95;
	}

	h1 span {
		background: linear-gradient(120deg, var(--gold), var(--amber), var(--violet));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}

	.pitch {
		margin: 1rem 0 0;
		max-width: 52ch;
		color: var(--muted);
		line-height: 1.6;
	}

	.card {
		padding: 1.4rem;
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field-label {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--muted);
	}

	.input {
		font: inherit;
		font-size: 1.1rem;
		padding: 0.8rem 1rem;
		border-radius: 12px;
		color: var(--text);
		background: var(--paper);
		border: 1px solid var(--border);
		box-shadow: inset 0 1px 2px rgba(28, 38, 71, 0.06);
		outline: none;
		transition: border-color 0.2s ease;
	}

	.input:focus {
		border-color: var(--amber);
	}

	.enter {
		margin-top: 0.2rem;
		padding: 0.9rem 1.2rem;
		font-size: 1.05rem;
	}

	.note {
		margin: 0;
		font-size: 0.82rem;
		color: var(--muted);
	}

	.note.admin {
		color: var(--violet);
	}

	.note.warn {
		color: var(--amber);
	}

	code {
		font-family: var(--mono);
		font-size: 0.8em;
		padding: 0.1rem 0.35rem;
		border-radius: 5px;
		background: var(--surface-strong);
	}

	.rules {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0.7rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.rules li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.88rem;
		color: var(--muted);
	}

	.glyph {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		flex: none;
		border-radius: 9px;
		font-family: var(--mono);
		font-size: 0.8rem;
		background: var(--paper);
		border: 1px solid var(--border);
	}
</style>
