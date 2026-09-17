import {
	addDoc,
	collection,
	doc,
	getDoc,
	getDocs,
	increment,
	limit,
	orderBy,
	query,
	serverTimestamp,
	setDoc,
	Timestamp
} from 'firebase/firestore';
import { getDb } from './firebase';
import type { Difficulty, EpisodeResult, Outcome } from './game.svelte';

export type StoredEpisode = {
	id: string;
	playerName: string;
	playerNameLower: string;
	difficulty: Difficulty;
	outcome: Outcome;
	totalReward: number;
	moves: number;
	terminalValue: number;
	durationMs: number;
	episodeNumber: number;
	exploredCells: number;
	endedAt: Date | null;
};

export type StoredPlayer = {
	id: string;
	name: string;
	sessions: number;
	firstSeenAt: Date | null;
	lastSeenAt: Date | null;
	lastDifficulty: Difficulty | null;
};

const toDate = (value: unknown) => (value instanceof Timestamp ? value.toDate() : null);

/** Firestore retries writes indefinitely when offline; the UI shouldn't wait. */
const ACK_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error('Firestore did not respond')), ACK_TIMEOUT_MS)
		)
	]);
}

const playerId = (name: string) =>
	name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60) || 'anonymous';

/** Called once when a player enters the maze. Upserts their player record. */
export async function logPlayerEntry(name: string, difficulty: Difficulty): Promise<string | null> {
	const db = getDb();
	if (!db) return null;

	const id = playerId(name);
	const ref = doc(db, 'players', id);
	const existing = await withTimeout(getDoc(ref));

	await withTimeout(
		setDoc(
			ref,
			{
				name: name.trim(),
				nameLower: name.trim().toLowerCase(),
				lastSeenAt: serverTimestamp(),
				lastDifficulty: difficulty,
				sessions: increment(1),
				...(existing.exists() ? {} : { firstSeenAt: serverTimestamp() })
			},
			{ merge: true }
		)
	);

	return id;
}

export async function saveEpisode(
	params: EpisodeResult & { playerName: string; sessionId: string; exploredCells: number }
): Promise<void> {
	const db = getDb();
	if (!db) return;

	await withTimeout(
		addDoc(collection(db, 'episodes'), {
			playerName: params.playerName.trim(),
			playerNameLower: params.playerName.trim().toLowerCase(),
			playerId: playerId(params.playerName),
			sessionId: params.sessionId,
			difficulty: params.difficulty,
			outcome: params.outcome,
			totalReward: params.totalReward,
			moves: params.moves,
			terminalValue: params.terminalValue,
			durationMs: params.durationMs,
			episodeNumber: params.episodeNumber,
			exploredCells: params.exploredCells,
			endedAt: serverTimestamp()
		})
	);
}

export async function fetchEpisodes(max = 1000): Promise<StoredEpisode[]> {
	const db = getDb();
	if (!db) return [];

	const snap = await withTimeout(
		getDocs(query(collection(db, 'episodes'), orderBy('endedAt', 'desc'), limit(max)))
	);

	return snap.docs.map((d) => {
		const data = d.data();
		return {
			id: d.id,
			playerName: data.playerName ?? 'unknown',
			playerNameLower: data.playerNameLower ?? 'unknown',
			difficulty: (data.difficulty ?? 'easy') as Difficulty,
			outcome: (data.outcome ?? 'trap') as Outcome,
			totalReward: Number(data.totalReward ?? 0),
			moves: Number(data.moves ?? 0),
			terminalValue: Number(data.terminalValue ?? 0),
			durationMs: Number(data.durationMs ?? 0),
			episodeNumber: Number(data.episodeNumber ?? 0),
			exploredCells: Number(data.exploredCells ?? 0),
			endedAt: toDate(data.endedAt)
		};
	});
}

export async function fetchPlayers(max = 500): Promise<StoredPlayer[]> {
	const db = getDb();
	if (!db) return [];

	const snap = await withTimeout(
		getDocs(query(collection(db, 'players'), orderBy('lastSeenAt', 'desc'), limit(max)))
	);

	return snap.docs.map((d) => {
		const data = d.data();
		return {
			id: d.id,
			name: data.name ?? d.id,
			sessions: Number(data.sessions ?? 1),
			firstSeenAt: toDate(data.firstSeenAt),
			lastSeenAt: toDate(data.lastSeenAt),
			lastDifficulty: (data.lastDifficulty ?? null) as Difficulty | null
		};
	});
}
