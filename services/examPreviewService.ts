import * as FileSystem from 'expo-file-system/legacy';

import {
  AuditLogEntry,
  EditableExamFields,
  ExamPreviewData,
  ExamPreviewError,
  ExamPreviewResult,
} from '@/types/exam';
import { MOCK_EXAM_PREVIEWS, updateMockExamPreview } from '@/utils/mockExamPreviewData';

import { AppSession, isSessionValid } from './sessionService';

const STORAGE_DIR = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '';
const EXAM_CACHE_FILE_URI = `${STORAGE_DIR}gcsc-exam-preview-cache.json`;
const EDIT_QUEUE_FILE_URI = `${STORAGE_DIR}gcsc-exam-edit-queue.json`;
const DEFAULT_TIMEOUT_MS = 3000;

type CacheMap = Record<string, ExamPreviewData>;

type ExamEditQueueItem = {
  examId: string;
  changes: EditableExamFields;
  expectedVersion: number;
  queuedAt: string;
};

export interface UpdateExamResult {
  data: ExamPreviewData;
  queued: boolean;
}

function hasStorageUri(): boolean {
  return STORAGE_DIR.length > 0;
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    if (!hasStorageUri()) return fallback;
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return fallback;
    const raw = await FileSystem.readAsStringAsync(path);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  if (!hasStorageUri()) return;
  await FileSystem.writeAsStringAsync(path, JSON.stringify(value));
}

async function readCacheMap(): Promise<CacheMap> {
  return readJson<CacheMap>(EXAM_CACHE_FILE_URI, {});
}

async function writeCacheMap(map: CacheMap): Promise<void> {
  await writeJson(EXAM_CACHE_FILE_URI, map);
}

async function readEditQueue(): Promise<ExamEditQueueItem[]> {
  return readJson<ExamEditQueueItem[]>(EDIT_QUEUE_FILE_URI, []);
}

async function writeEditQueue(items: ExamEditQueueItem[]): Promise<void> {
  await writeJson(EDIT_QUEUE_FILE_URI, items);
}

export async function getCachedExamPreview(examId: string): Promise<ExamPreviewData | null> {
  const map = await readCacheMap();
  return map[examId] ?? null;
}

async function upsertCachedExamPreview(data: ExamPreviewData): Promise<void> {
  const map = await readCacheMap();
  map[data.id] = data;
  await writeCacheMap(map);
}

export async function clearExamPreviewCache(): Promise<void> {
  if (!hasStorageUri()) return;
  const [cacheInfo, queueInfo] = await Promise.all([
    FileSystem.getInfoAsync(EXAM_CACHE_FILE_URI),
    FileSystem.getInfoAsync(EDIT_QUEUE_FILE_URI),
  ]);

  if (cacheInfo.exists) {
    await FileSystem.deleteAsync(EXAM_CACHE_FILE_URI, { idempotent: true });
  }
  if (queueInfo.exists) {
    await FileSystem.deleteAsync(EDIT_QUEUE_FILE_URI, { idempotent: true });
  }
}

export function validateExamPreviewPermission(session: AppSession | null): AppSession {
  if (!isSessionValid(session)) {
    throw new ExamPreviewError('UNAUTHORIZED', 'Please sign in first.');
  }

  const validSession = session as AppSession;
  const allowed = validSession.role === 'instructor' || validSession.role === 'admin';
  if (!allowed) {
    throw new ExamPreviewError('FORBIDDEN', 'You are not authorized to preview exams.');
  }

  return validSession;
}

function validatePreviewState(exam: ExamPreviewData): void {
  // Preview is available for any status; edit restrictions are still Draft-only.
  void exam;
}

function validateDraftState(exam: ExamPreviewData): void {
  if (exam.status !== 'Draft') {
    throw new ExamPreviewError('STATUS_CHANGED', 'Editing is only allowed while exam is Draft.');
  }
}

function validateEditableFields(changes: EditableExamFields): void {
  const title = changes.title?.trim() ?? '';
  if (title.length < 3 || title.length > 120) {
    throw new ExamPreviewError('VALIDATION', 'Title must be between 3 and 120 characters.');
  }

  const dt = Date.parse(changes.examDate);
  if (Number.isNaN(dt)) {
    throw new ExamPreviewError('VALIDATION', 'Please enter a valid exam date.');
  }
}

function toExamPreviewData(raw: any): ExamPreviewData {
  return {
    id: String(raw.id),
    title: String(raw.title ?? ''),
    subject: String(raw.subject ?? ''),
    section: String(raw.section ?? ''),
    examDate: String(raw.examDate ?? ''),
    status: raw.status,
    questionCount: Number(raw.questionCount ?? 0),
    choicesFormat: raw.choicesFormat,
    answerKey: Array.isArray(raw.answerKey) ? raw.answerKey.map((v: string) => String(v)) : [],
    examCode: String(raw.examCode ?? ''),
    template: {
      id: String(raw.template?.id ?? ''),
      name: String(raw.template?.name ?? ''),
      omrLayout: String(raw.template?.omrLayout ?? ''),
      columns: Number(raw.template?.columns ?? 0),
      questionsPerColumn: Number(raw.template?.questionsPerColumn ?? 0),
      totalQuestions: Number(raw.template?.totalQuestions ?? 0),
    },
    description: raw.description ? String(raw.description) : undefined,
    notes: raw.notes ? String(raw.notes) : undefined,
    version: Number(raw.version ?? 1),
    lastModified: String(raw.lastModified ?? new Date().toISOString()),
  };
}

async function fetchPreviewFromApi(examId: string, token: string, timeoutMs: number): Promise<ExamPreviewData> {
  const baseUrl = process.env.EXPO_PUBLIC_EXAM_API_BASE_URL;
  if (!baseUrl) {
    const local = MOCK_EXAM_PREVIEWS.find((e) => e.id === examId);
    await new Promise((resolve) => setTimeout(resolve, 650));
    if (!local) {
      throw new ExamPreviewError('NOT_FOUND', 'Exam not found.');
    }
    return local;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fields = [
      'id',
      'title',
      'subject',
      'section',
      'examDate',
      'status',
      'questionCount',
      'choicesFormat',
      'answerKey',
      'examCode',
      'template',
      'description',
      'notes',
      'version',
      'lastModified',
    ].join(',');

    const res = await fetch(`${baseUrl}/exams/${encodeURIComponent(examId)}?fields=${fields}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (res.status === 401) {
      throw new ExamPreviewError('UNAUTHORIZED', 'Your session token is invalid or expired.');
    }
    if (res.status === 403) {
      throw new ExamPreviewError('FORBIDDEN', 'You are not allowed to access this exam.');
    }
    if (res.status === 404) {
      throw new ExamPreviewError('NOT_FOUND', 'Exam not found.');
    }
    if (res.status >= 500) {
      throw new ExamPreviewError('SERVER_ERROR', 'Server error while loading exam preview.');
    }
    if (!res.ok) {
      throw new ExamPreviewError('UNKNOWN', 'Failed to load exam preview.');
    }

    const json = await res.json();
    return toExamPreviewData(json);
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new ExamPreviewError('TIMEOUT', 'Request timed out. Please try again.');
    }
    if (error instanceof ExamPreviewError) {
      throw error;
    }
    throw new ExamPreviewError('UNKNOWN', 'Unexpected error while loading preview.');
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastErr = error;
      if (i === retries) break;
    }
  }
  throw lastErr;
}

async function postAuditLog(baseUrl: string, token: string, entry: AuditLogEntry): Promise<void> {
  const res = await fetch(`${baseUrl}/audit/logs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(entry),
  });

  if (!res.ok) {
    throw new ExamPreviewError('SERVER_ERROR', 'Audit logging failed. Please retry.');
  }
}

function applyOptimisticPatch(exam: ExamPreviewData, changes: EditableExamFields): ExamPreviewData {
  const nowIso = new Date().toISOString();
  return {
    ...exam,
    title: changes.title.trim(),
    examDate: changes.examDate,
    description: changes.description,
    notes: changes.notes,
    version: exam.version + 1,
    lastModified: nowIso,
  };
}

async function queueOfflineEdit(item: ExamEditQueueItem): Promise<void> {
  const queue = await readEditQueue();
  queue.push(item);
  await writeEditQueue(queue);
}

async function updateDraftViaApi(input: {
  baseUrl: string;
  token: string;
  examId: string;
  changes: EditableExamFields;
  expectedVersion: number;
}): Promise<ExamPreviewData> {
  const res = await fetch(`${input.baseUrl}/exams/${encodeURIComponent(input.examId)}/draft-fields`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${input.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'If-Match': String(input.expectedVersion),
    },
    body: JSON.stringify(input.changes),
  });

  if (res.status === 409) {
    throw new ExamPreviewError('CONFLICT', 'This exam was edited on web. Please refresh and retry.');
  }
  if (res.status === 412) {
    throw new ExamPreviewError('CONFLICT', 'Version conflict detected. Refresh then save again.');
  }
  if (res.status === 422 || res.status === 400) {
    throw new ExamPreviewError('VALIDATION', 'Invalid title or exam date.');
  }
  if (res.status === 401) {
    throw new ExamPreviewError('UNAUTHORIZED', 'Session expired. Please sign in again.');
  }
  if (res.status === 403) {
    throw new ExamPreviewError('FORBIDDEN', 'You do not have edit permission for this exam.');
  }
  if (!res.ok) {
    throw new ExamPreviewError('SERVER_ERROR', 'Unable to save exam changes right now.');
  }

  const json = await res.json();
  return toExamPreviewData(json);
}

export async function flushOfflineExamEditQueue(session: AppSession | null): Promise<void> {
  const validSession = validateExamPreviewPermission(session);
  const baseUrl = process.env.EXPO_PUBLIC_EXAM_API_BASE_URL;
  if (!baseUrl) {
    await writeEditQueue([]);
    return;
  }

  const queue = await readEditQueue();
  if (!queue.length) return;

  const remaining: ExamEditQueueItem[] = [];
  for (const item of queue) {
    try {
      const updated = await updateDraftViaApi({
        baseUrl,
        token: validSession.token,
        examId: item.examId,
        changes: item.changes,
        expectedVersion: item.expectedVersion,
      });
      await upsertCachedExamPreview(updated);

      await postAuditLog(baseUrl, validSession.token, {
        actor: validSession.userEmail,
        action: 'exam.draft_fields.updated',
        examId: item.examId,
        changedFields: Object.keys(item.changes),
        timestamp: new Date().toISOString(),
      });
    } catch {
      remaining.push(item);
    }
  }

  await writeEditQueue(remaining);
}

export async function updateExamDraftFields(input: {
  examId: string;
  session: AppSession | null;
  changes: EditableExamFields;
  expectedVersion: number;
  isConnected: boolean;
}): Promise<UpdateExamResult> {
  const { examId, session, changes, expectedVersion, isConnected } = input;
  const validSession = validateExamPreviewPermission(session);
  validateEditableFields(changes);

  const latest = await getExamPreview({ examId, session: validSession, preferCache: !isConnected });
  validateDraftState(latest.data);

  if (latest.data.version !== expectedVersion) {
    throw new ExamPreviewError('CONFLICT', 'Exam version changed. Refresh and retry your edit.');
  }

  const optimistic = applyOptimisticPatch(latest.data, changes);
  await upsertCachedExamPreview(optimistic);

  const baseUrl = process.env.EXPO_PUBLIC_EXAM_API_BASE_URL;
  if (!isConnected || !baseUrl) {
    await queueOfflineEdit({
      examId,
      changes,
      expectedVersion,
      queuedAt: new Date().toISOString(),
    });

    updateMockExamPreview(examId, {
      ...changes,
      version: optimistic.version,
      lastModified: optimistic.lastModified,
    });

    return { data: optimistic, queued: true };
  }

  const updated = await withRetry(async () => {
    const data = await updateDraftViaApi({
      baseUrl,
      token: validSession.token,
      examId,
      changes,
      expectedVersion,
    });

    await postAuditLog(baseUrl, validSession.token, {
      actor: validSession.userEmail,
      action: 'exam.draft_fields.updated',
      examId,
      changedFields: Object.keys(changes),
      timestamp: new Date().toISOString(),
    });

    return data;
  }, 1);

  await upsertCachedExamPreview(updated);
  updateMockExamPreview(examId, {
    ...changes,
    version: updated.version,
    lastModified: updated.lastModified,
  });

  return { data: updated, queued: false };
}

export async function getExamPreview(input: {
  examId: string;
  session: AppSession | null;
  preferCache?: boolean;
  timeoutMs?: number;
}): Promise<ExamPreviewResult> {
  const { examId, session, preferCache = false, timeoutMs = DEFAULT_TIMEOUT_MS } = input;

  const validSession = validateExamPreviewPermission(session);

  if (preferCache) {
    const cached = await getCachedExamPreview(examId);
    if (cached) {
      validatePreviewState(cached);
      return { data: cached, fromCache: true };
    }
    throw new ExamPreviewError('OFFLINE_NO_CACHE', 'No cached exam data available offline.');
  }

  try {
    const data = await fetchPreviewFromApi(examId, validSession.token, timeoutMs);
    validatePreviewState(data);
    await upsertCachedExamPreview(data);
    return { data, fromCache: false };
  } catch (error) {
    const cached = await getCachedExamPreview(examId);
    if (cached) {
      validatePreviewState(cached);
      return { data: cached, fromCache: true };
    }

    if (error instanceof ExamPreviewError) {
      throw error;
    }

    throw new ExamPreviewError('UNKNOWN', 'Unable to load exam preview.');
  }
}
