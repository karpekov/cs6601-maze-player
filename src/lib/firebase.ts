import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

const config: FirebaseOptions = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
	appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId);

let cached: Firestore | null = null;

/** Firestore handle, or `null` when the app is running without credentials. */
export function getDb(): Firestore | null {
	if (!isFirebaseConfigured) return null;
	if (!cached) {
		const app = getApps().at(0) ?? initializeApp(config);
		cached = getFirestore(app);
	}
	return cached;
}
