import { auth, db } from "@/config/firebase";
import NetInfo from "@react-native-community/netinfo";
import { addDoc, collection, Timestamp } from "firebase/firestore";

export type LogLevel = "info" | "warn" | "error";

export type LogEvent =
  | "SCAN_STARTED"
  | "SCAN_SUCCESS"
  | "SCAN_FAILED"
  | "GRADE_COMPUTED"
  | "SAVE_SUCCESS"
  | "SAVE_DUPLICATE"
  | "SAVE_OFFLINE_QUEUED"
  | "SAVE_FAILED"
  | "OFFLINE_SYNC_STARTED"
  | "OFFLINE_SYNC_SUCCESS"
  | "OFFLINE_SYNC_FAILED"
  | "OFFLINE_SYNC_CYCLE_COMPLETE"
  | "OFFLINE_SYNC_CRITICAL_FAILURE"
  | "SYNC_PERMISSION_DENIED"
  | "STUDENT_ID_INVALID"
  | "EXAM_ID_INVALID"
  | "AUTH_MISSING";

export interface LogEntry {
  event: LogEvent;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
  userId?: string;
  timestamp: string; // ISO 8601
}

const LOGS_COLLECTION = "logs";

export class LogService {
 
  static async log(
    event: LogEvent,
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    const entry: LogEntry = {
      event,
      level,
      message,
      meta,
      userId: auth.currentUser?.uid ?? "anonymous",
      timestamp: new Date().toISOString(),
    };

    // Always log to console
    const prefix = `[GC SmartCheck][${level.toUpperCase()}][${event}]`;
    if (level === "error") {
      console.error(prefix, message, meta ?? "");
    } else if (level === "warn") {
      console.warn(prefix, message, meta ?? "");
    } else {
      console.log(prefix, message, meta ?? "");
    }

    
    // Skip Firestore logging if offline to prevent background retry loops
    try {
      const netState = await NetInfo.fetch();
      if (netState.isConnected && netState.isInternetReachable) {
        await addDoc(collection(db, LOGS_COLLECTION), {
          ...entry,
          createdAt: Timestamp.now(),
        });
      }
    } catch {
      // Ignore Firestore logging errors
    }
  }

  static info(
    event: LogEvent,
    message: string,
    meta?: Record<string, unknown>,
  ) {
    return LogService.log(event, "info", message, meta);
  }

  static warn(
    event: LogEvent,
    message: string,
    meta?: Record<string, unknown>,
  ) {
    return LogService.log(event, "warn", message, meta);
  }

  static error(
    event: LogEvent,
    message: string,
    meta?: Record<string, unknown>,
  ) {
    return LogService.log(event, "error", message, meta);
  }
}
