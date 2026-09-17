<script lang="ts">
	import { COLS, GOAL, ROWS, START } from '$lib/maze';
	import type { CellView, MoveEvent, PortalPhase } from '$lib/game.svelte';

	type Props = {
		cells: CellView[];
		row: number;
		col: number;
		status: 'playing' | 'goal' | 'trap';
		lastMove: MoveEvent | null;
		moves: number;
		portal: PortalPhase;
	};

	let { cells, row, col, status, lastMove, moves, portal }: Props = $props();

	const look = $derived(status === 'goal' ? 'up' : (lastMove?.actual ?? 'right'));

	// Dropping the class for one frame lets the shake replay on consecutive bumps.
	let bumping = $state(false);

	$effect(() => {
		void moves;
		if (!lastMove?.bumped) return;

		bumping = false;
		const frame = requestAnimationFrame(() => (bumping = true));
		const done = setTimeout(() => (bumping = false), 260);
		return () => {
			cancelAnimationFrame(frame);
			clearTimeout(done);
		};
	});
</script>

<div
	class="board panel"
	class:bumped={bumping}
	class:dead={status === 'trap'}
	class:won={status === 'goal'}
	class:warping={portal === 'travel'}
	class:charging={portal === 'charging'}
	style="--rows: {ROWS}; --cols: {COLS}; --pr: {row}; --pc: {col};"
>
	<div class="grid">
		{#each cells as cell (cell.key)}
			<div
				class="cell {cell.kind}"
				class:path={cell.onPath}
				class:start={cell.isStart}
				class:goal={cell.terminal !== undefined && cell.terminal > 0}
				class:trap={cell.terminal !== undefined && cell.terminal < 0}
				style="grid-row: {cell.r + 1}; grid-column: {cell.c + 1};"
			>
				{#if cell.terminal !== undefined}
					<span class="value mono">{cell.terminal > 0 ? '🏆' : cell.terminal}</span>
				{:else if cell.isStart}
					<span class="value">⌂</span>
				{/if}
			</div>
		{/each}

		{#if portal !== 'idle'}
			<div class="portal entry" style="--r: {START.r}; --c: {START.c};">
				<span class="swirl"></span>
				<span class="ring"></span>
				<span class="ring"></span>
			</div>
		{/if}

		{#if portal === 'travel' || portal === 'arrived'}
			<div class="portal exit" style="--r: {GOAL.r}; --c: {GOAL.c};">
				<span class="swirl"></span>
				<span class="ring"></span>
				<span class="ring"></span>
			</div>
		{/if}

		<div
			class="player"
			class:win={status === 'goal'}
			class:dead={status === 'trap'}
			class:sucked={portal === 'charging'}
			class:warping={portal === 'travel'}
		>
			<span class="orb">
				<span class="eye {look}">
					<span class="pupil"></span>
				</span>
			</span>
		</div>

		<div class="torch"></div>
	</div>
</div>

<style>
	.board {
		--pad: clamp(8px, 1.4vw, 16px);
		--gap: 1px;
		--cell: clamp(12px, min(3.1vw, 3.4vh), 28px);
		padding: var(--pad);
		overflow: hidden;
		/* Blank graph paper: unexplored cells are simply not drawn. The line
		   pitch matches the grid's cell + 1px gap so the two stay aligned. */
		background:
			linear-gradient(rgba(28, 38, 71, 0.05) 1px, transparent 1px) 0 0 / 100%
				calc(var(--cell) + 1px),
			linear-gradient(90deg, rgba(28, 38, 71, 0.05) 1px, transparent 1px) 0 0 /
				calc(var(--cell) + 1px) 100%,
			#fdfdff;
		background-origin: content-box;
	}

	.grid {
		position: relative;
		display: grid;
		grid-template-rows: repeat(var(--rows), var(--cell));
		grid-template-columns: repeat(var(--cols), var(--cell));
		gap: var(--gap);
	}

	.cell {
		display: grid;
		place-items: center;
		border-radius: 3px;
		font-size: calc(var(--cell) * 0.42);
		line-height: 1;
		transition:
			background 0.35s ease,
			box-shadow 0.35s ease;
	}

	.void {
		background: transparent;
	}

	.wall {
		background: linear-gradient(160deg, #5b6490, #3c4470);
		box-shadow: inset 0 -1px 0 rgba(28, 38, 71, 0.35);
	}

	.frontier {
		background: rgba(28, 38, 71, 0.09);
		box-shadow: inset 0 0 0 1px rgba(28, 38, 71, 0.2);
		animation: breathe 3.2s ease-in-out infinite;
	}

	.floor {
		background: rgba(255, 194, 71, 0.22);
		box-shadow: inset 0 0 0 1px rgba(201, 138, 0, 0.22);
	}

	.floor.path {
		background: rgba(255, 178, 41, 0.42);
	}

	.cell.start {
		color: #0a6d94;
		background: rgba(14, 135, 184, 0.2);
		box-shadow: inset 0 0 0 1px rgba(14, 135, 184, 0.5);
	}

	.cell.trap {
		background: rgba(220, 53, 69, 0.22);
		box-shadow: inset 0 0 0 1px rgba(220, 53, 69, 0.6);
		color: #a3151f;
		font-family: var(--mono);
		font-size: calc(var(--cell) * 0.34);
		font-weight: 700;
	}

	.cell.goal {
		background: rgba(15, 157, 88, 0.3);
		box-shadow:
			inset 0 0 0 1px rgba(15, 157, 88, 0.75),
			0 0 22px rgba(15, 157, 88, 0.35);
	}

	.player {
		position: absolute;
		top: 0;
		left: 0;
		width: var(--cell);
		height: var(--cell);
		display: grid;
		place-items: center;
		transform: translate(calc(var(--pc) * (var(--cell) + 1px)), calc(var(--pr) * (var(--cell) + 1px)));
		transition: transform 0.1s ease-out;
		z-index: 3;
	}

	.orb {
		position: relative;
		overflow: hidden;
		width: 72%;
		height: 72%;
		border-radius: 50%;
		background: radial-gradient(circle at 34% 30%, #ffe9a8, #f0a91b 55%, #b46f07);
		box-shadow:
			0 0 0 1.5px rgba(122, 76, 4, 0.55),
			0 2px 10px rgba(180, 111, 7, 0.55);
		animation: pulse 1.6s ease-in-out infinite;
	}

	.eye {
		position: absolute;
		width: 40%;
		height: 40%;
		border-radius: 50%;
		background: #fffdf6;
		box-shadow: inset 0 0 0 1px rgba(90, 55, 8, 0.28);
		top: 26%;
		left: 32%;
		transition:
			top 0.14s ease,
			left 0.14s ease;
		animation: blink 5.6s ease-in-out infinite;
		transform-origin: 50% 55%;
	}

	.eye.up {
		top: 12%;
		left: 30%;
	}

	.eye.down {
		top: 44%;
		left: 30%;
	}

	.eye.left {
		top: 26%;
		left: 12%;
	}

	.eye.right {
		top: 26%;
		left: 48%;
	}

	.pupil {
		position: absolute;
		width: 52%;
		height: 52%;
		border-radius: 50%;
		background: #2a2214;
		top: 24%;
		left: 24%;
		transition:
			top 0.14s ease,
			left 0.14s ease;
	}

	.eye.up .pupil {
		top: 6%;
		left: 24%;
	}

	.eye.down .pupil {
		top: 42%;
		left: 24%;
	}

	.eye.left .pupil {
		top: 24%;
		left: 6%;
	}

	.eye.right .pupil {
		top: 24%;
		left: 42%;
	}

	.player.dead .orb {
		background: radial-gradient(circle at 34% 30%, #ffc9c9, #e0454f 55%, #8f1d1d);
		box-shadow: 0 0 0 1.5px rgba(122, 20, 26, 0.6);
		animation: sink 0.5s ease-in forwards;
	}

	.player.dead .eye {
		animation: none;
		transform: scaleY(0.12);
	}

	.player.win .orb {
		background: radial-gradient(circle at 34% 30%, #c6f7dc, #14b365 55%, #0b7a43);
		box-shadow:
			0 0 0 1.5px rgba(8, 92, 51, 0.6),
			0 0 22px rgba(15, 157, 88, 0.6);
		animation: cheer 0.6s ease-out 3;
	}

	.player.sucked .eye,
	.player.warping .eye {
		opacity: 0;
	}

	/* --- Secret portal ------------------------------------------------- */

	.portal {
		position: absolute;
		top: 0;
		left: 0;
		width: var(--cell);
		height: var(--cell);
		display: grid;
		place-items: center;
		transform: translate(calc(var(--c) * (var(--cell) + 1px)), calc(var(--r) * (var(--cell) + 1px)));
		pointer-events: none;
		z-index: 4;
		--hue-a: rgba(109, 77, 242, 0.9);
		--hue-b: rgba(14, 135, 184, 0.75);
	}

	.portal.exit {
		--hue-a: rgba(15, 157, 88, 0.9);
		--hue-b: rgba(255, 194, 71, 0.85);
	}

	.swirl {
		position: absolute;
		width: 260%;
		height: 260%;
		border-radius: 50%;
		background: conic-gradient(
			from 0deg,
			transparent,
			var(--hue-a),
			var(--hue-b),
			transparent 75%
		);
		/* Donut, so the player stays readable inside the mouth of the portal. */
		mask: radial-gradient(circle, transparent 26%, #000 42%);
		filter: blur(1.5px);
		animation:
			spin 0.55s linear infinite,
			bloom 2.1s cubic-bezier(0.2, 0.9, 0.3, 1.2);
	}

	.exit .swirl {
		animation:
			spin 0.45s linear infinite reverse,
			bloom 1.5s cubic-bezier(0.2, 0.9, 0.3, 1.2);
	}

	.ring {
		position: absolute;
		width: 100%;
		height: 100%;
		border-radius: 50%;
		border: 2px solid var(--hue-a);
		animation: shockwave 1.1s ease-out infinite;
	}

	.ring:last-child {
		animation-delay: 0.45s;
	}

	.player.sucked .orb {
		animation: suck 2.25s cubic-bezier(0.6, -0.3, 0.8, 0.4) forwards;
	}

	.player.warping {
		transition: transform 2.85s cubic-bezier(0.7, 0.05, 0.25, 1);
	}

	/* Comet tail smeared behind the orb as it crosses the maze. */
	.player.warping::before {
		content: '';
		position: absolute;
		inset: -75%;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(109, 77, 242, 0.5), transparent 68%);
		animation: tail 2.85s ease-out forwards;
	}

	.player.warping .orb {
		box-shadow:
			0 0 14px 5px rgba(109, 77, 242, 0.6),
			0 0 34px 12px rgba(109, 77, 242, 0.3);
		animation: warp 2.85s cubic-bezier(0.7, 0.05, 0.25, 1);
	}

	.board.charging {
		animation: portal-glow 2.25s ease-out;
	}

	.board.warping .torch {
		/* The lamp sweeps along with the orb instead of snapping to the goal. */
		transition: background 2.85s cubic-bezier(0.7, 0.05, 0.25, 1);
	}

	@keyframes spin {
		to {
			transform: rotate(1turn);
		}
	}

	@keyframes bloom {
		from {
			opacity: 0;
			scale: 0.2;
		}
	}

	@keyframes shockwave {
		from {
			scale: 0.6;
			opacity: 0.85;
		}
		to {
			scale: 3.4;
			opacity: 0;
		}
	}

	@keyframes suck {
		60% {
			transform: rotate(1.5turn) scale(0.5);
		}
		to {
			transform: rotate(3turn) scale(0.05);
			opacity: 0.4;
		}
	}

	@keyframes warp {
		from {
			transform: rotate(0turn) scale(0.15);
		}
		60% {
			transform: rotate(2turn) scale(1.25);
		}
		to {
			transform: rotate(3turn) scale(1);
		}
	}

	@keyframes tail {
		from {
			opacity: 0.9;
		}
		to {
			opacity: 0;
			scale: 0.4;
		}
	}

	@keyframes portal-glow {
		50% {
			box-shadow: inset 0 0 40px rgba(109, 77, 242, 0.45);
		}
	}

	/* Remembered ground fades toward blank paper away from the player's lamp. */
	.torch {
		position: absolute;
		inset: calc(var(--cell) * -2);
		pointer-events: none;
		z-index: 2;
		background: radial-gradient(
			circle calc(var(--cell) * 7) at
				calc((var(--pc) + 2.5) * (var(--cell) + 1px))
				calc((var(--pr) + 2.5) * (var(--cell) + 1px)),
			rgba(255, 255, 255, 0) 0%,
			rgba(255, 255, 255, 0.32) 55%,
			rgba(247, 248, 252, 0.68) 100%
		);
		transition: background 0.18s linear;
	}

	.board.bumped {
		animation: shake 0.13s ease-in-out;
	}

	.board.dead {
		animation: flash-red 0.5s ease-out;
	}

	.board.won {
		animation: flash-green 0.7s ease-out;
	}

	@keyframes blink {
		0%,
		8%,
		12%,
		86%,
		89%,
		92%,
		100% {
			transform: scaleY(1);
		}
		10%,
		87.5%,
		90.5% {
			transform: scaleY(0.08);
		}
	}

	@keyframes pulse {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.14);
		}
	}

	@keyframes cheer {
		0% {
			transform: scale(1);
		}
		40% {
			transform: scale(1.5);
		}
		100% {
			transform: scale(1);
		}
	}

	@keyframes sink {
		to {
			transform: scale(0.15);
			opacity: 0.25;
		}
	}

	@keyframes breathe {
		0%,
		100% {
			opacity: 0.55;
		}
		50% {
			opacity: 1;
		}
	}

	@keyframes shake {
		50% {
			transform: translateX(-1px);
		}
	}

	@keyframes flash-red {
		0% {
			box-shadow: inset 0 0 0 2px rgba(220, 53, 69, 0.9);
		}
		100% {
			box-shadow: inset 0 0 0 2px rgba(220, 53, 69, 0);
		}
	}

	@keyframes flash-green {
		0% {
			box-shadow: inset 0 0 0 2px rgba(15, 157, 88, 0.9);
		}
		100% {
			box-shadow: inset 0 0 0 2px rgba(15, 157, 88, 0);
		}
	}

	@media (max-width: 900px) {
		.board {
			--pad: 3px;
			--cell: clamp(
				8px,
				min(
					calc((100cqi - 2 * var(--pad) - (var(--cols) - 1) * var(--gap)) / var(--cols)),
					calc((100cqb - 2 * var(--pad) - (var(--rows) - 1) * var(--gap)) / var(--rows))
				),
				36px
			);
			width: max-content;
			max-width: 100%;
			max-height: 100%;
			border-radius: 10px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.orb,
		.eye,
		.frontier,
		.board.bumped,
		.ring,
		.swirl,
		.player.sucked .orb,
		.player.warping .orb,
		.player.warping::before {
			animation: none;
		}
	}
</style>
