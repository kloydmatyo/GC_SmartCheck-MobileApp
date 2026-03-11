import { auth, db } from "@/config/firebase";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
  startAfter,
  Unsubscribe,
  where,
} from "firebase/firestore";
import { GradingService } from "./gradingService";

const SCANNED_RESULTS = "scannedResults";
const EXAMS_COLLECTION = "exams";
const PAGE_SIZE = 20;
const CACHE_TTL_MS = 60_000; // 1 minute in-memory cache

// ── In-memory stats cache ─────────────────────────────────────────────────
let _homeCache: { stats: HomeDashboardStats | null; ts: number } = {
  stats: null,
  ts: 0,
};
const _examCache = new Map<string, { stats: ExamDashboardStats; ts: number }>();

// ── Types ─────────────────────────────────────────────────────────────────

export interface GradeDistribution {
  A: number; // >= 90%
  B: number; // 80–89%
  C: number; // 70–79%
  D: number; // 60–69%
  F: number; // < 60%
}

export interface ExamDashboardStats {
  examId: string;
  examTitle: string;
  totalGraded: number;
  classAverage: number; // percentage (0–100)
  highestScore: number; // raw score
  lowestScore: number; // raw score
  highestPercentage: number;
  lowestPercentage: number;
  passCount: number;
  failCount: number;
  passRate: number; // percentage (0–100)
  distribution: GradeDistribution;
  lastUpdated: Date;
}

export interface HomeDashboardStats {
  scannedToday: number;
  avgScoreToday: number; // percentage
  passRateToday: number; // percentage
  totalAllTime: number;
  totalStudentsGraded: number; // all-time total graded by this instructor
  highestScore: number; // highest percentage all-time
  lowestScore: number; // lowest percentage all-time
  distribution: GradeDistribution; // all-time grade distribution
}

export interface PagedScanResult {
  items: ScanResultRow[];
  hasMore: boolean;
  lastDoc: QueryDocumentSnapshot | null;
}

export interface ScanResultRow {
  docId: string;
  studentId: string;
  examId: string;
  score: number;
  totalPoints: number;
  percentage: number;
  gradeEquivalent: string;
  isPassing: boolean;
  dateScanned: string;
  status: string;
}

export type DashboardDateFilter = "all" | "today" | "week";

// ── Helpers ────────────────────────────────────────────────────────────────

function buildDistribution(percentages: number[]): GradeDistribution {
  const dist: GradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const p of percentages) {
    const grade = GradingService.computeGradeEquivalent(
      p,
    ) as keyof GradeDistribution;
    dist[grade]++;
  }
  return dist;
}

function rowFromDoc(docSnap: QueryDocumentSnapshot): ScanResultRow {
  const d = docSnap.data();
  const score = d.score ?? 0;
  // Firestore stores totalQuestions; fall back to totalPoints for legacy docs
  const totalQuestions = d.totalQuestions ?? d.totalPoints ?? 1;
  // percentage may not be stored — compute from score/totalQuestions
  const percentage =
    d.percentage != null
      ? d.percentage
      : Math.round((score / Math.max(totalQuestions, 1)) * 100);
  // scannedAt is a Firestore Timestamp; dateScanned is a legacy ISO string
  let dateScanned = "";
  if (d.scannedAt) {
    dateScanned =
      typeof d.scannedAt === "string"
        ? d.scannedAt
        : (d.scannedAt.toDate?.()?.toISOString() ?? "");
  } else if (d.dateScanned) {
    dateScanned =
      typeof d.dateScanned === "string"
        ? d.dateScanned
        : (d.dateScanned.toDate?.()?.toISOString() ?? "");
  }
  return {
    docId: docSnap.id,
    studentId: d.studentId ?? "",
    examId: d.examId ?? "",
    score,
    totalPoints: totalQuestions,
    percentage,
    gradeEquivalent:
      d.gradeEquivalent ?? GradingService.computeGradeEquivalent(percentage),
    isPassing: GradingService.isPassing(percentage),
    dateScanned,
    status: d.status ?? "saved",
  };
}

// ── DashboardService ───────────────────────────────────────────────────────

export class DashboardService {
  /**
   * Compute full performance stats for a single exam.
   * Queries scannedResults filtered by examId.
   */
  static async getExamStats(examId: string): Promise<ExamDashboardStats> {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      return {
        examId,
        examTitle: examId,
        totalGraded: 0,
        classAverage: 0,
        highestScore: 0,
        lowestScore: 0,
        highestPercentage: 0,
        lowestPercentage: 0,
        passCount: 0,
        failCount: 0,
        passRate: 0,
        distribution: { A: 0, B: 0, C: 0, D: 0, F: 0 },
        lastUpdated: new Date(),
      };
    }
    const q = query(
      collection(db, SCANNED_RESULTS),
      where("examId", "==", examId),
    );
    const snap = await getDocs(q);
    const rows = snap.docs.map(rowFromDoc);

    // Fetch exam title from exams collection
    let examTitle = examId;
    try {
      const { getDoc, doc } = await import("firebase/firestore");
      const examSnap = await getDoc(doc(db, EXAMS_COLLECTION, examId));
      if (examSnap.exists()) {
        examTitle = examSnap.data().title ?? examId;
      }
    } catch {
      // non-blocking
    }

    if (rows.length === 0) {
      return {
        examId,
        examTitle,
        totalGraded: 0,
        classAverage: 0,
        highestScore: 0,
        lowestScore: 0,
        highestPercentage: 0,
        lowestPercentage: 0,
        passCount: 0,
        failCount: 0,
        passRate: 0,
        distribution: { A: 0, B: 0, C: 0, D: 0, F: 0 },
        lastUpdated: new Date(),
      };
    }

    const percentages = rows.map((r) => r.percentage);
    const scores = rows.map((r) => r.score);
    const passing = rows.filter((r) => r.isPassing);

    const classAverage = Math.round(
      percentages.reduce((a, b) => a + b, 0) / percentages.length,
    );
    const passCount = passing.length;
    const failCount = rows.length - passCount;

    return {
      examId,
      examTitle,
      totalGraded: rows.length,
      classAverage,
      highestScore: Math.max(...scores),
      lowestScore: Math.min(...scores),
      highestPercentage: Math.max(...percentages),
      lowestPercentage: Math.min(...percentages),
      passCount,
      failCount,
      passRate: Math.round((passCount / rows.length) * 100),
      distribution: buildDistribution(percentages),
      lastUpdated: new Date(),
    };
  }

  /**
   * Home dashboard stats: scanned today + avg score today scoped to the
   * currently logged-in instructor.
   */
  static async getHomeStats(): Promise<HomeDashboardStats> {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      return {
        scannedToday: 0,
        avgScoreToday: 0,
        passRateToday: 0,
        totalAllTime: 0,
        totalStudentsGraded: 0,
        highestScore: 0,
        lowestScore: 0,
        distribution: { A: 0, B: 0, C: 0, D: 0, F: 0 },
      };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const q = query(
      collection(db, SCANNED_RESULTS),
      where("scannedBy", "==", uid),
    );
    const snap = await getDocs(q);
    const all = snap.docs.map(rowFromDoc);

    const todayRows = all.filter(
      (r) => typeof r.dateScanned === "string" && r.dateScanned >= todayISO,
    );

    const scannedToday = todayRows.length;
    const avgScoreToday =
      scannedToday > 0
        ? Math.round(
            todayRows.reduce((s, r) => s + r.percentage, 0) / scannedToday,
          )
        : 0;
    const passingToday = todayRows.filter((r) => r.isPassing).length;
    const passRateToday =
      scannedToday > 0 ? Math.round((passingToday / scannedToday) * 100) : 0;

    const allPercentages = all.map((r) => r.percentage);
    return {
      scannedToday,
      avgScoreToday,
      passRateToday,
      totalAllTime: all.length,
      totalStudentsGraded: all.length,
      highestScore: all.length > 0 ? Math.max(...allPercentages) : 0,
      lowestScore: all.length > 0 ? Math.min(...allPercentages) : 0,
      distribution: buildDistribution(allPercentages),
    };
  }

  /**
   * Paginated list of scan results for a given exam.
   * Pass null as lastDoc for the first page.
   */
  static async getPagedResults(
    examId: string,
    lastDoc: QueryDocumentSnapshot | null = null,
  ): Promise<PagedScanResult> {
    if (!auth.currentUser?.uid) return { items: [], hasMore: false, lastDoc: null };

    const base = [
      where("examId", "==", examId),
      orderBy("scannedAt", "desc"),
    ] as const;

    let q = query(
      collection(db, SCANNED_RESULTS),
      ...base,
      limit(PAGE_SIZE + 1),
    );

    if (lastDoc) {
      q = query(
        collection(db, SCANNED_RESULTS),
        ...base,
        startAfter(lastDoc),
        limit(PAGE_SIZE + 1),
      );
    }

    const snap = await getDocs(q);
    const hasMore = snap.docs.length > PAGE_SIZE;
    const docs = hasMore ? snap.docs.slice(0, PAGE_SIZE) : snap.docs;

    return {
      items: docs.map(rowFromDoc),
      hasMore,
      lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
    };
  }

  /**
   * Real-time listener for home dashboard stats.
   * Serves cached value immediately on first call, then keeps it live.
   * Returns an unsubscribe function — call it when the component unmounts.
   */
  static subscribeHomeStats(
    onUpdate: (stats: HomeDashboardStats) => void,
    onError?: (err: Error) => void,
  ): Unsubscribe {
    // Emit cached value immediately so the UI renders something right away
    if (_homeCache.stats && Date.now() - _homeCache.ts < CACHE_TTL_MS) {
      onUpdate(_homeCache.stats);
    }

    const uid = auth.currentUser?.uid;
    if (!uid) {
      const empty: HomeDashboardStats = {
        scannedToday: 0,
        avgScoreToday: 0,
        passRateToday: 0,
        totalAllTime: 0,
        totalStudentsGraded: 0,
        highestScore: 0,
        lowestScore: 0,
        distribution: { A: 0, B: 0, C: 0, D: 0, F: 0 },
      };
      onUpdate(empty);
      return () => {};
    }

    const q = query(
      collection(db, SCANNED_RESULTS),
      where("scannedBy", "==", uid),
    );

    return onSnapshot(
      q,
      (snap) => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayISO = todayStart.toISOString();

        const all = snap.docs.map(rowFromDoc);
        const todayRows = all.filter(
          (r) => typeof r.dateScanned === "string" && r.dateScanned >= todayISO,
        );

        const scannedToday = todayRows.length;
        const avgScoreToday =
          scannedToday > 0
            ? Math.round(
                todayRows.reduce((s, r) => s + r.percentage, 0) / scannedToday,
              )
            : 0;
        const passingToday = todayRows.filter((r) => r.isPassing).length;
        const passRateToday =
          scannedToday > 0
            ? Math.round((passingToday / scannedToday) * 100)
            : 0;

        const allPercentages = all.map((r) => r.percentage);
        const result: HomeDashboardStats = {
          scannedToday,
          avgScoreToday,
          passRateToday,
          totalAllTime: all.length,
          totalStudentsGraded: all.length,
          highestScore: all.length > 0 ? Math.max(...allPercentages) : 0,
          lowestScore: all.length > 0 ? Math.min(...allPercentages) : 0,
          distribution: buildDistribution(allPercentages),
        };
        // Update cache
        _homeCache = { stats: result, ts: Date.now() };
        onUpdate(result);
      },
      (err) => onError?.(new Error(err.message)),
    );
  }

  /**
   * Real-time listener for a specific exam's stats.
   * @param dateFrom  Optional lower-bound date filter — only scans on/after this date are counted.
   * @param onError   Optional error callback.
   */
  static subscribeExamStats(
    examId: string,
    onUpdate: (stats: ExamDashboardStats) => void,
    onError?: (err: Error) => void,
    dateFrom?: Date,
  ): Unsubscribe {
    // Emit cached value immediately if fresh and no date filter active
    if (!dateFrom) {
      const cached = _examCache.get(examId);
      if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        onUpdate(cached.stats);
      }
    }

    if (!auth.currentUser?.uid) {
      onUpdate({
        examId,
        examTitle: examId,
        totalGraded: 0,
        classAverage: 0,
        highestScore: 0,
        lowestScore: 0,
        highestPercentage: 0,
        lowestPercentage: 0,
        passCount: 0,
        failCount: 0,
        passRate: 0,
        distribution: { A: 0, B: 0, C: 0, D: 0, F: 0 },
        lastUpdated: new Date(),
      });
      return () => {};
    }

    const q = query(
      collection(db, SCANNED_RESULTS),
      where("examId", "==", examId),
    );

    return onSnapshot(
      q,
      async (snap) => {
        let rows = snap.docs.map(rowFromDoc);

        // Apply optional date filter (client-side)
        if (dateFrom) {
          const fromISO = dateFrom.toISOString();
          rows = rows.filter(
            (r) =>
              typeof r.dateScanned === "string" && r.dateScanned >= fromISO,
          );
        }

        let examTitle = examId;
        try {
          const { getDoc, doc } = await import("firebase/firestore");
          const examSnap = await getDoc(doc(db, EXAMS_COLLECTION, examId));
          if (examSnap.exists()) examTitle = examSnap.data().title ?? examId;
        } catch {
          /* non-blocking */
        }

        if (rows.length === 0) {
          onUpdate({
            examId,
            examTitle,
            totalGraded: 0,
            classAverage: 0,
            highestScore: 0,
            lowestScore: 0,
            highestPercentage: 0,
            lowestPercentage: 0,
            passCount: 0,
            failCount: 0,
            passRate: 0,
            distribution: { A: 0, B: 0, C: 0, D: 0, F: 0 },
            lastUpdated: new Date(),
          });
          return;
        }

        const percentages = rows.map((r) => r.percentage);
        const scores = rows.map((r) => r.score);
        const passCount = rows.filter((r) => r.isPassing).length;

        const result: ExamDashboardStats = {
          examId,
          examTitle,
          totalGraded: rows.length,
          classAverage: Math.round(
            percentages.reduce((a, b) => a + b, 0) / rows.length,
          ),
          highestScore: Math.max(...scores),
          lowestScore: Math.min(...scores),
          highestPercentage: Math.max(...percentages),
          lowestPercentage: Math.min(...percentages),
          passCount,
          failCount: rows.length - passCount,
          passRate: Math.round((passCount / rows.length) * 100),
          distribution: buildDistribution(percentages),
          lastUpdated: new Date(),
        };
        // Update cache only when no date filter is active
        if (!dateFrom) {
          _examCache.set(examId, { stats: result, ts: Date.now() });
        }
        onUpdate(result);
      },
      (err) => onError?.(new Error(err.message)),
    );
  }
}
