import * as FileSystem from 'expo-file-system/legacy';

export type UserRole = 'instructor' | 'admin' | 'guest';

export interface AppSession {
  token: string;
  userEmail: string;
  userName: string;
  role: UserRole;
  expiresAt: string;
}

const STORAGE_DIR = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '';
const SESSION_FILE_URI = `${STORAGE_DIR}gcsc-session.json`;

function hasStorageUri(): boolean {
  return STORAGE_DIR.length > 0;
}

export function isSessionValid(session: AppSession | null): boolean {
  if (!session) return false;
  return Date.parse(session.expiresAt) > Date.now() && !!session.token;
}

export async function getSession(): Promise<AppSession | null> {
  try {
    if (!hasStorageUri()) return null;
    const info = await FileSystem.getInfoAsync(SESSION_FILE_URI);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(SESSION_FILE_URI);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppSession;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveSession(session: AppSession): Promise<void> {
  if (!hasStorageUri()) return;
  await FileSystem.writeAsStringAsync(SESSION_FILE_URI, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  try {
    if (!hasStorageUri()) return;
    const info = await FileSystem.getInfoAsync(SESSION_FILE_URI);
    if (info.exists) {
      await FileSystem.deleteAsync(SESSION_FILE_URI, { idempotent: true });
    }
  } catch {
    // Ignore clear-session failures in frontend-only mode.
  }
}

export function buildDemoSession(input: {
  email: string;
  name: string;
  role: UserRole;
}): AppSession {
  const now = Date.now();
  return {
    token: `demo-token-${now}`,
    userEmail: input.email,
    userName: input.name,
    role: input.role,
    expiresAt: new Date(now + 1000 * 60 * 60 * 8).toISOString(),
  };
}
