/**
 * The `complex_maze` layout from `graph_definitions.py`, ported cell-for-cell.
 *
 * 20 x 23 grid, walled border, one goal worth +1000 and eighteen traps worth
 * -5 to -20. Every terminal cell ends the episode the moment it is entered.
 */

export const ROWS = 20;
export const COLS = 23;

export type Cell = { r: number; c: number };

export const START: Cell = { r: 16, c: 3 };
export const GOAL: Cell = { r: 15, c: 17 };
export const STEP_COST = -1;

export const cellKey = (r: number, c: number) => `${r},${c}`;

function buildWalls(): Set<string> {
	const walls = new Set<string>();
	const add = (r: number, c: number) => walls.add(cellKey(r, c));
	const remove = (r: number, c: number) => walls.delete(cellKey(r, c));

	// Borders.
	for (let c = 0; c < COLS; c++) {
		add(0, c);
		add(ROWS - 1, c);
	}
	for (let r = 0; r < ROWS; r++) {
		add(r, 0);
		add(r, COLS - 1);
	}

	// Long dividing walls, each with a doorway or two punched through.
	for (let c = 0; c < COLS; c++) add(2, c);
	remove(2, 1);
	remove(2, 16);

	for (let c = 0; c < COLS; c++) add(4, c);
	remove(4, 1);
	remove(4, 6);

	for (let r = 0; r < ROWS; r++) add(r, 2);
	remove(1, 2);
	remove(18, 2);

	for (let c = 0; c < COLS; c++) add(17, c);
	remove(17, 1);
	remove(17, 21);

	// Interior obstacles, row by row.
	add(5, 10);

	for (const c of [3, 4, 5, 7, 17, 18, 19]) add(6, c);

	for (let c = 10; c < 18; c++) add(7, c);

	for (const c of [10, 16, 17]) add(8, c);

	for (const c of [10, 16, 17, 18, 20, 21]) add(9, c);

	for (const c of [6, 7, 8, 9, 10, 16]) add(10, c);

	for (const c of [4, 12, 16]) add(11, c);

	for (const c of [4, 12, 14, 16, 17, 18, 19, 20]) add(12, c);

	for (const c of [4, 5, 7, 12, 16]) add(13, c);

	for (const c of [7, 12, 16]) add(14, c);

	for (const c of [3, 4, 5, 7, 8, 9, 10, 11, 12, 19, 20, 21]) add(15, c);

	add(16, 11);

	return walls;
}

export const WALLS = buildWalls();

export const TERMINALS: ReadonlyMap<string, number> = new Map<string, number>([
	[cellKey(15, 17), 1000],

	[cellKey(6, 16), -5],
	[cellKey(8, 21), -5],
	[cellKey(10, 17), -8],
	[cellKey(13, 17), -12],

	[cellKey(9, 6), -6],
	[cellKey(7, 8), -20],
	[cellKey(8, 8), -10],

	[cellKey(11, 10), -10],
	[cellKey(12, 8), -20],
	[cellKey(13, 11), -5],
	[cellKey(14, 10), -20],

	[cellKey(10, 12), -10],
	[cellKey(10, 13), -20],
	[cellKey(10, 14), -15],
	[cellKey(9, 14), -20],
	[cellKey(12, 15), -20],
	[cellKey(14, 13), -10],
	[cellKey(15, 15), -8]
]);

export const isWall = (r: number, c: number) =>
	r < 0 || r >= ROWS || c < 0 || c >= COLS || WALLS.has(cellKey(r, c));

export const isFloor = (r: number, c: number) => !isWall(r, c);

/** Reward of a terminal cell, or `undefined` for ordinary floor. */
export const terminalReward = (r: number, c: number) => TERMINALS.get(cellKey(r, c));

export const TOTAL_FLOOR_CELLS = (() => {
	let n = 0;
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) if (isFloor(r, c)) n++;
	}
	return n;
})();
