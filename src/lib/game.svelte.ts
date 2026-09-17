import { SvelteSet } from 'svelte/reactivity';
import {
	COLS,
	GOAL,
	ROWS,
	START,
	STEP_COST,
	TOTAL_FLOOR_CELLS,
	cellKey,
	isFloor,
	isWall,
	terminalReward
} from './maze';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type Outcome = 'goal' | 'trap';

export type EpisodeResult = {
	episodeNumber: number;
	difficulty: Difficulty;
	outcome: Outcome;
	totalReward: number;
	moves: number;
	terminalValue: number;
	durationMs: number;
	/** True when the episode ended through the secret portal. */
	viaPortal?: boolean;
};

/** Bumps into the wall left of the start cell needed to tear the portal open. */
export const PORTAL_BUMPS = 5;
const PORTAL_WALL: Direction = 'left';
export type PortalPhase = 'idle' | 'charging' | 'travel' | 'arrived';
const PORTAL_CHARGE_MS = 2250;
const PORTAL_TRAVEL_MS = 2850;
const PORTAL_BURST_MS = 1650;

type DifficultyInfo = {
	label: string;
	/** Probability of slipping to each side of the intended direction. */
	slip: number;
	tagline: string;
	description: string;
};

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard'];

export const DIFFICULTIES: Record<Difficulty, DifficultyInfo> = {
	easy: {
		label: 'Easy',
		slip: 0,
		tagline: 'Deterministic',
		description: 'You always move where you aim.'
	},
	medium: {
		label: 'Medium',
		slip: 0.1,
		tagline: 'Slippery',
		description: '80% of moves land as aimed; 10% drift to each side.'
	},
	hard: {
		label: 'Hard',
		slip: 1 / 3,
		tagline: 'Treacherous',
		description: 'Only 1 move in 3 goes as planned — the rest slip left or right.'
	}
};

const DELTA: Record<Direction, [number, number]> = {
	up: [-1, 0],
	down: [1, 0],
	left: [0, -1],
	right: [0, 1]
};

/** Directions 90 degrees counter-clockwise / clockwise from the intended one. */
const LEFT_OF: Record<Direction, Direction> = {
	up: 'left',
	left: 'down',
	down: 'right',
	right: 'up'
};
const RIGHT_OF: Record<Direction, Direction> = {
	up: 'right',
	right: 'down',
	down: 'left',
	left: 'up'
};

export const ARROW: Record<Direction, string> = { up: '↑', down: '↓', left: '←', right: '→' };

export type MoveEvent = {
	intended: Direction;
	actual: Direction;
	slipped: boolean;
	bumped: boolean;
	reward: number;
};

export type CellView = {
	key: string;
	r: number;
	c: number;
	/** `void` cells have never been near the player and stay unrendered. */
	kind: 'void' | 'wall' | 'frontier' | 'floor';
	terminal?: number;
	isPlayer: boolean;
	isStart: boolean;
	onPath: boolean;
};

export class GameSession {
	playerName = $state('');
	difficulty = $state<Difficulty>('easy');

	row = $state(START.r);
	col = $state(START.c);
	moves = $state(0);
	reward = $state(0);
	status = $state<'playing' | Outcome>('playing');
	episodeNumber = $state(1);
	lastMove = $state<MoveEvent | null>(null);

	portalPhase = $state<PortalPhase>('idle');
	/** Consecutive bumps into the left wall while standing on the start cell. */
	portalCharge = $state(0);
	private portalTimers: ReturnType<typeof setTimeout>[] = [];

	/** Every cell stepped on this episode, for drawing the trail. */
	path = new SvelteSet<string>([cellKey(START.r, START.c)]);
	/** Every cell stepped on this session — map knowledge outlives an episode. */
	revealed = new SvelteSet<string>([cellKey(START.r, START.c)]);

	history = $state<EpisodeResult[]>([]);
	private episodeStart = Date.now();

	constructor(playerName: string, difficulty: Difficulty = 'easy') {
		this.playerName = playerName;
		this.difficulty = difficulty;
	}

	readonly slip = $derived(DIFFICULTIES[this.difficulty].slip);
	readonly playing = $derived(this.status === 'playing');
	readonly exploredPct = $derived((this.revealed.size / TOTAL_FLOOR_CELLS) * 100);

	readonly bestReward = $derived.by(() => {
		const mine = this.history.filter((e) => e.difficulty === this.difficulty);
		return mine.length ? Math.max(...mine.map((e) => e.totalReward)) : null;
	});

	readonly goalsFound = $derived(this.history.filter((e) => e.outcome === 'goal').length);

	/**
	 * Fog of war: cells you have stood on are fully lit, open cells adjacent to
	 * those are visible but unidentified, and walls show up once you are next to
	 * them. Trap and goal values are only legible after you land on them.
	 */
	readonly cells = $derived.by<CellView[]>(() => {
		const frontier = new Set<string>();
		const knownWalls = new Set<string>();

		for (const key of this.revealed) {
			const [r, c] = key.split(',').map(Number);
			for (const [dr, dc] of [
				[-1, 0],
				[1, 0],
				[0, -1],
				[0, 1]
			]) {
				const nr = r + dr;
				const nc = c + dc;
				if (isFloor(nr, nc) && !this.revealed.has(cellKey(nr, nc))) frontier.add(cellKey(nr, nc));
			}
			// Walls all around (including diagonals) so corridors read as corridors.
			for (let dr = -1; dr <= 1; dr++) {
				for (let dc = -1; dc <= 1; dc++) {
					if (isWall(r + dr, c + dc)) knownWalls.add(cellKey(r + dr, c + dc));
				}
			}
		}

		const out: CellView[] = [];
		for (let r = 0; r < ROWS; r++) {
			for (let c = 0; c < COLS; c++) {
				const key = cellKey(r, c);
				const lit = this.revealed.has(key);
				const kind = lit
					? 'floor'
					: frontier.has(key)
						? 'frontier'
						: knownWalls.has(key)
							? 'wall'
							: 'void';
				out.push({
					key,
					r,
					c,
					kind,
					terminal: lit ? terminalReward(r, c) : undefined,
					isPlayer: r === this.row && c === this.col,
					isStart: r === START.r && c === START.c,
					onPath: this.path.has(key)
				});
			}
		}
		return out;
	});

	/** Resolve a keypress into an actual move, applying the difficulty's slip. */
	move(intended: Direction): MoveEvent | null {
		if (this.status !== 'playing' || this.portalPhase !== 'idle') return null;

		let actual = intended;
		if (this.slip > 0) {
			const roll = Math.random();
			if (roll < this.slip) actual = LEFT_OF[intended];
			else if (roll < 2 * this.slip) actual = RIGHT_OF[intended];
		}

		const [dr, dc] = DELTA[actual];
		const nr = this.row + dr;
		const nc = this.col + dc;
		const bumped = isWall(nr, nc);

		if (!bumped) {
			this.row = nr;
			this.col = nc;
		}

		const landed = terminalReward(this.row, this.col);
		const reward = STEP_COST + (landed ?? 0);

		this.moves += 1;
		this.reward += reward;
		this.path.add(cellKey(this.row, this.col));
		this.revealed.add(cellKey(this.row, this.col));

		const event: MoveEvent = { intended, actual, slipped: actual !== intended, bumped, reward };
		this.lastMove = event;

		if (landed !== undefined) this.finish(landed);
		else this.chargePortal(bumped ? actual : null);

		return event;
	}

	private finish(terminalValue: number, viaPortal = false) {
		this.status = terminalValue > 0 ? 'goal' : 'trap';
		this.history = [
			...this.history,
			{
				episodeNumber: this.episodeNumber,
				difficulty: this.difficulty,
				outcome: this.status,
				totalReward: this.reward,
				moves: this.moves,
				terminalValue,
				durationMs: Date.now() - this.episodeStart,
				...(viaPortal ? { viaPortal } : {})
			}
		];
	}

	/**
	 * Easter egg: bang into the wall to the left of the start cell five times in
	 * a row and it gives way, dropping you straight onto the treasure.
	 */
	private chargePortal(wall: Direction | null) {
		const atStart = this.row === START.r && this.col === START.c;
		if (!atStart || wall !== PORTAL_WALL) {
			this.portalCharge = 0;
			return;
		}

		this.portalCharge += 1;
		if (this.portalCharge >= PORTAL_BUMPS) this.openPortal();
	}

	private openPortal() {
		this.portalPhase = 'charging';

		this.portalTimers.push(
			setTimeout(() => {
				this.portalPhase = 'travel';
				this.row = GOAL.r;
				this.col = GOAL.c;
				this.path.add(cellKey(GOAL.r, GOAL.c));
				this.revealed.add(cellKey(GOAL.r, GOAL.c));
			}, PORTAL_CHARGE_MS),
			setTimeout(() => (this.portalPhase = 'arrived'), PORTAL_CHARGE_MS + PORTAL_TRAVEL_MS),
			setTimeout(
				() => {
					const treasure = terminalReward(GOAL.r, GOAL.c) ?? 0;
					this.reward += treasure;
					this.finish(treasure, true);
				},
				PORTAL_CHARGE_MS + PORTAL_TRAVEL_MS + PORTAL_BURST_MS
			)
		);
	}

	private resetPortal() {
		for (const timer of this.portalTimers) clearTimeout(timer);
		this.portalTimers = [];
		this.portalPhase = 'idle';
		this.portalCharge = 0;
	}

	/** Start a fresh episode. Map knowledge carries over; the trail does not. */
	nextEpisode() {
		if (this.status !== 'playing') this.episodeNumber += 1;
		this.resetPortal();
		this.row = START.r;
		this.col = START.c;
		this.moves = 0;
		this.reward = 0;
		this.status = 'playing';
		this.lastMove = null;
		this.episodeStart = Date.now();
		this.path.clear();
		this.path.add(cellKey(START.r, START.c));
		this.revealed.add(cellKey(START.r, START.c));
	}

	/** Switching difficulty abandons the current episode without recording it. */
	setDifficulty(difficulty: Difficulty) {
		if (difficulty === this.difficulty) return;
		this.difficulty = difficulty;
		this.nextEpisode();
	}
}

export const KEY_TO_DIRECTION: Record<string, Direction> = {
	ArrowUp: 'up',
	ArrowDown: 'down',
	ArrowLeft: 'left',
	ArrowRight: 'right',
	w: 'up',
	W: 'up',
	s: 'down',
	S: 'down',
	a: 'left',
	A: 'left',
	d: 'right',
	D: 'right',
	k: 'up',
	j: 'down',
	h: 'left',
	l: 'right'
};
