import type { Difficulty, Outcome } from './game.svelte';
import type { StoredEpisode } from './stats';

/** Typing this anywhere in the name field opens the dashboard instead of the maze. */
export const ADMIN_KEYWORD = 'admin';

export const isAdminName = (name: string) => name.trim().toLowerCase().includes(ADMIN_KEYWORD);

export type LeaderboardRow = {
	playerName: string;
	bestReward: number;
	moves: number;
	outcome: Outcome;
	episodes: number;
	goals: number;
	lastPlayed: Date | null;
};

/** Best single episode per player, ranked by reward then by fewest moves. */
export function leaderboardFor(episodes: StoredEpisode[], difficulty: Difficulty): LeaderboardRow[] {
	const byPlayer = new Map<string, LeaderboardRow>();

	for (const ep of episodes) {
		if (ep.difficulty !== difficulty) continue;

		const current = byPlayer.get(ep.playerNameLower);
		if (!current) {
			byPlayer.set(ep.playerNameLower, {
				playerName: ep.playerName,
				bestReward: ep.totalReward,
				moves: ep.moves,
				outcome: ep.outcome,
				episodes: 1,
				goals: ep.outcome === 'goal' ? 1 : 0,
				lastPlayed: ep.endedAt
			});
			continue;
		}

		current.episodes += 1;
		if (ep.outcome === 'goal') current.goals += 1;
		if (ep.endedAt && (!current.lastPlayed || ep.endedAt > current.lastPlayed)) {
			current.lastPlayed = ep.endedAt;
		}

		const better =
			ep.totalReward > current.bestReward ||
			(ep.totalReward === current.bestReward && ep.moves < current.moves);
		if (better) {
			current.bestReward = ep.totalReward;
			current.moves = ep.moves;
			current.outcome = ep.outcome;
		}
	}

	return [...byPlayer.values()].sort(
		(a, b) => b.bestReward - a.bestReward || a.moves - b.moves
	);
}

export type DifficultyStats = {
	episodes: number;
	players: number;
	goals: number;
	goalRate: number;
	avgReward: number;
	avgMoves: number;
	bestReward: number | null;
	fewestMovesToGoal: number | null;
};

export function statsFor(episodes: StoredEpisode[], difficulty: Difficulty): DifficultyStats {
	const rows = episodes.filter((e) => e.difficulty === difficulty);
	const goalRuns = rows.filter((e) => e.outcome === 'goal');
	const mean = (values: number[]) =>
		values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

	return {
		episodes: rows.length,
		players: new Set(rows.map((e) => e.playerNameLower)).size,
		goals: goalRuns.length,
		goalRate: rows.length ? goalRuns.length / rows.length : 0,
		avgReward: mean(rows.map((e) => e.totalReward)),
		avgMoves: mean(rows.map((e) => e.moves)),
		bestReward: rows.length ? Math.max(...rows.map((e) => e.totalReward)) : null,
		fewestMovesToGoal: goalRuns.length ? Math.min(...goalRuns.map((e) => e.moves)) : null
	};
}
