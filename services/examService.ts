import { auth, db } from "@/config/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import Realm from "realm";
import { ExamPreviewData } from "../types/exam";
import { AuditLogService } from "./auditLogService";
import { NetworkService } from "./networkService";
import { OfflineStorageService } from "./offlineStorageService";
import { OfflineQuiz, QuizCache, RealmService } from "./realmService";

export class ExamService {
  private static formatErrorForLog(error: any) {
    return {
      message: error?.message ?? String(error),
      code: error?.code ?? "",
      name: error?.name ?? "",
      stack: error?.stack ?? "",
    };
  }

  /**
   * Get all exams for the current user (Local-First: Cache + Staging)
   */
  static async getExamsByUser(): Promise<any[]> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return [];

      // 1. Load from Staging & Cache Realm - FASTEST
      const stagingRealm = await RealmService.getStagingRealm();
      const staging = stagingRealm.objects<OfflineQuiz>("OfflineQuiz");

      const cacheRealm = await RealmService.getCacheRealm();
      const cached = cacheRealm.objects<QuizCache>("QuizCache");

      const localExams: any[] = [];

      cached.forEach((q) => {
        localExams.push({
          id: q.id,
          title: q.title,
          class: q.subject,
          classId: q.classId || "",
          className: q.className || "",
          isArchived: q.isArchived || false,
          date: q.createdAt.toLocaleDateString(),
          createdAt: q.createdAt,
          updatedAt: q.updatedAt,
          papers: q.papersCount,
          status: q.status,
          num_items: q.questionCount,
          choices_per_item: q.choicesPerItem || 4,
          isDownloaded: true,
          isStaging: false,
        });
      });

      staging.forEach((s) => {
        localExams.push({
          id: `staging_${s._id.toHexString()}`,
          title: s.title,
          class: s.subject,
          classId: (s as any).classId || "",
          date: s.createdAt.toLocaleDateString(),
          createdAt: s.createdAt,
          updatedAt: s.createdAt,
          papers: 0,
          status: s.status,
          num_items: s.questionCount,
          choices_per_item: s.choicesPerItem || 4,
          isStaging: true,
          isDownloaded: true,
        });
      });

      const { NetworkService } = await import("./networkService");
      const isOnline = await NetworkService.isOnline();

      // When online, always fetch fresh from Firestore to avoid stale cache.
      // Offline-created (staging) exams are merged in below.
      if (!isOnline && localExams.length > 0) {
        console.log(
          `[ExamService] Offline - returning ${localExams.length} cached exams.`,
        );
        return localExams.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );
      }

      if (isOnline) {
        console.log("[ExamService] Online - fetching fresh from Firestore...");
        const q = query(
          collection(db, "exams"),
          where("createdBy", "==", currentUser.uid),
        );
        const snap = await getDocs(q);

        const examIds = snap.docs.map((doc) => doc.id);
        const answerKeysMap: Record<string, any> = {};

        // Firestore 'in' queries are limited to 30 elements.
        const chunkArray = (arr: string[], size: number) =>
          Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, i * size + size),
          );

        const chunks = chunkArray(examIds, 30);

        for (const chunk of chunks) {
          if (chunk.length === 0) continue;
          const akQuery = query(
            collection(db, "answerKeys"),
            where("examId", "in", chunk),
          );
          const akSnap = await getDocs(akQuery);
          akSnap.docs.forEach((doc) => {
            const data = doc.data();
            const eId = data.examId;
            if (
              !answerKeysMap[eId] ||
              (data.version || 0) > (answerKeysMap[eId].version || 0)
            ) {
              answerKeysMap[eId] = data;
            }
          });
        }

        // Update cache
        cacheRealm.write(() => {
          snap.docs.forEach((docSnap) => {
            const data = docSnap.data();
            const eId = docSnap.id;
            const akJson = answerKeysMap[eId]
              ? JSON.stringify(answerKeysMap[eId])
              : "";

            cacheRealm.create(
              "QuizCache",
              {
                id: eId,
                title: data.title || "Untitled Exam",
                subject: data.subject || data.className || "No Subject",
                className: data.className || "",
                classId: data.classId || "",
                isArchived: data.isArchived || false,
                status: data.status || "Draft",
                structureLocked: Boolean(data.structureLocked),
                papersCount: data.scanned_papers || 0,
                questionCount: data.num_items || 0,
                answerKey: akJson,
                createdBy: data.createdBy,
                createdAt: data.createdAt?.toDate?.() || new Date(),
                updatedAt: data.updatedAt?.toDate?.() || new Date(),
                version: data.version || 1,
                instructorId: data.instructorId || "",
                examCode: data.examCode || data.room || "",
                choicesPerItem: data.choices_per_item || 4,
              },
              Realm.UpdateMode.Modified,
            );
          });
        });

        // Map results for UI
        const firestoreExams = snap.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            title: data.title || "Untitled Exam",
            class: data.subject || data.className || "No Subject",
            isArchived: data.isArchived || false,
            date:
              data.created_at ||
              data.createdAt?.toDate?.().toLocaleDateString() ||
              "No Date",
            papers: data.scanned_papers || 0,
            status: data.status || "Draft",
            isDownloaded: true,
            isStaging: false,
          };
        });

        const combined = [...firestoreExams];
        staging.forEach((s) => {
          combined.push({
            id: `staging_${s._id.toHexString()}`,
            title: s.title,
            class: s.subject,
            date: s.createdAt.toLocaleDateString(),
            papers: 0,
            status: s.status,
            isStaging: true,
            isDownloaded: true,
          } as any);
        });
        return combined;
      }

      return localExams;
    } catch (error) {
      console.error("Error fetching exams:", error);
      throw error;
    }
  }

  /**
   * Background sync exams and answer keys from Firestore to Realm Cache
   */
  private static async backgroundSyncExams(userId: string): Promise<void> {
    try {
      const cacheRealm = await RealmService.getCacheRealm();
      const q = query(
        collection(db, "exams"),
        where("createdBy", "==", userId),
      );
      const snap = await getDocs(q);

      const examIds = snap.docs.map((doc) => doc.id);
      const answerKeysMap: Record<string, any> = {};

      // Fetch answer keys in chunks of 30
      const chunkArray = (arr: string[], size: number) =>
        Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
          arr.slice(i * size, i * size + size),
        );

      const chunks = chunkArray(examIds, 30);
      for (const chunk of chunks) {
        if (chunk.length === 0) continue;
        const akQuery = query(
          collection(db, "answerKeys"),
          where("examId", "in", chunk),
        );
        const akSnap = await getDocs(akQuery);
        akSnap.docs.forEach((doc) => {
          const data = doc.data();
          const eId = data.examId;
          if (
            !answerKeysMap[eId] ||
            (data.version || 0) > (answerKeysMap[eId].version || 0)
          ) {
            answerKeysMap[eId] = data;
          }
        });
      }

      cacheRealm.write(() => {
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const eId = docSnap.id;
          const akJson = answerKeysMap[eId]
            ? JSON.stringify(answerKeysMap[eId])
            : "";

          cacheRealm.create(
            "QuizCache",
            {
              id: eId,
              title: data.title || "Untitled Exam",
              subject: data.subject || data.className || "No Subject",
              className: data.className || "",
              classId: data.classId || "",
              isArchived: data.isArchived || false,
              status: data.status || "Draft",
              structureLocked: Boolean(data.structureLocked),
              papersCount: data.scanned_papers || 0,
              questionCount: data.num_items || 0,
              answerKey: akJson,
              createdBy: data.createdBy,
              createdAt: data.createdAt?.toDate?.() || new Date(),
              updatedAt: data.updatedAt?.toDate?.() || new Date(),
              version: data.version || 1,
              instructorId: data.instructorId || "",
              examCode: data.examCode || data.room || "",
              choicesPerItem: data.choices_per_item || 4,
            },
            Realm.UpdateMode.Modified,
          );
        });
      });
      console.log("[ExamService] Background sync complete.");
    } catch (error) {
      console.warn("[ExamService] Background sync failed:", error);
    }
  }

  /**
   * Update answer key for an exam
   */
  static async updateAnswerKey(
    examId: string,
    answers: string[],
  ): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Not authenticated");

      const { NetworkService } = await import("./networkService");
      const isOnline = await NetworkService.isOnline();

      if (examId.startsWith("staging_")) {
        console.log("[ExamService] Updating Staging Answer Key:", examId);
        const stagingRealm = await RealmService.getStagingRealm();
        const hexId = examId.replace("staging_", "");
        const sQuiz = stagingRealm.objectForPrimaryKey<OfflineQuiz>(
          "OfflineQuiz",
          new Realm.BSON.ObjectId(hexId),
        );

        if (sQuiz) {
          stagingRealm.write(() => {
            const currentAnswers = JSON.parse(
              sQuiz.answerKey || '{"questionSettings":[]}',
            );
            const questionSettings = answers.map((ans, idx) => {
              const existing = (currentAnswers.questionSettings || []).find(
                (q: any) => q.questionNumber === idx + 1,
              );
              return {
                questionNumber: idx + 1,
                correctAnswer: ans,
                points: existing?.points ?? 1,
                choiceLabels: existing?.choiceLabels ?? {},
              };
            });

            sQuiz.answerKey = JSON.stringify({
              answers,
              questionSettings,
              numItems: answers.length,
              version: (currentAnswers.version || 1) + 1,
              updatedAt: new Date().toISOString(),
            });
          });
          return;
        }
        throw new Error("Staging quiz not found");
      }

      const updateCachedAnswerKey = async (
        resolvedExamId: string,
        answerKeyPayload: Record<string, any>,
      ) => {
        const cacheRealm = await RealmService.getCacheRealm();
        const cachedQuiz = cacheRealm.objectForPrimaryKey<QuizCache>(
          "QuizCache",
          resolvedExamId,
        );
        if (!cachedQuiz) return;

        cacheRealm.write(() => {
          cachedQuiz.answerKey = JSON.stringify(answerKeyPayload);
          cachedQuiz.updatedAt = new Date();
        });
      };

      if (!isOnline) {
        // Queue for sync if it's a Firestore ID but we're offline
        console.log("[ExamService] Offline. Queueing answer key update...");
        const stagingRealm = await RealmService.getStagingRealm();
        // We'll reuse OfflineQuiz staging if possible, or we need a new PendingUpdate schema
        // For now, let's just use the existing OfflineStorageService for updates if it's not a staging quiz
        await OfflineStorageService.queueUpdate(examId, "update", {
          answerKey: { answers, locked: false },
        });

        await updateCachedAnswerKey(examId, {
          examId,
          answers,
          locked: false,
          version: 1,
          questionSettings: answers.map((a, i) => ({
            questionNumber: i + 1,
            correctAnswer: a,
            points: 1,
          })),
        });
        return;
      }

      // Online - Sync to Firestore
      const {
        collection,
        doc,
        query,
        where,
        getDocs,
        setDoc,
        serverTimestamp,
      } = await import("firebase/firestore");

      // Find correctly resolving answer key ID
      const q = query(
        collection(db, "answerKeys"),
        where("examId", "==", examId),
      );
      const snap = await getDocs(q);

      let akRef;
      let version = 1;

      if (!snap.empty) {
        akRef = doc(db, "answerKeys", snap.docs[0].id);
        version = (snap.docs[0].data().version || 1) + 1;
      } else {
        akRef = doc(collection(db, "answerKeys"));
      }

      const answerKeyData = {
        examId,
        answers,
        version,
        updatedAt: serverTimestamp(),
        createdBy: currentUser.uid,
        locked: false,
        questionSettings: answers.map((a, i) => ({
          questionNumber: i + 1,
          correctAnswer: a,
          points: 1,
        })),
      };

      await setDoc(akRef, answerKeyData, { merge: true });
      await updateCachedAnswerKey(examId, {
        id: akRef.id,
        ...answerKeyData,
        updatedAt: new Date().toISOString(),
      });
      console.log("[ExamService] Answer key updated online");
    } catch (err) {
      console.error("Error in updateAnswerKey:", err);
      throw err;
    }
  }

  /**
   * Create a new exam with offline staging support
   */
  static async createExam(examData: any): Promise<string> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Not authenticated");

      const { NetworkService } = await import("./networkService");
      const isOnline = await NetworkService.isOnline();

      if (!isOnline) {
        console.log("[ExamService] Offline. Queueing exam to staging...");
        const stagingRealm = await RealmService.getStagingRealm();
        let newId = "";
        stagingRealm.write(() => {
          const sQuiz = stagingRealm.create<OfflineQuiz>("OfflineQuiz", {
            title: examData.title,
            subject: examData.subject || examData.className || "General",
            questionCount: examData.num_items,
            status: "Draft",
            createdBy: currentUser.uid,
            createdAt: new Date(),
            answerKey: examData.answerKeyJson || "",
            instructorId: examData.instructorId || "",
            examCode: examData.examCode || "",
            choicesPerItem: examData.choices_per_item || 4,
          });
          newId = (sQuiz as any)._id.toHexString();
        });
        return `staging_${newId}`;
      }

      const { addDoc, collection, serverTimestamp } =
        await import("firebase/firestore");
      const docRef = await addDoc(collection(db, "exams"), {
        ...examData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Write to local cache immediately so it shows up without a full sync
      const cacheRealm = await RealmService.getCacheRealm();
      cacheRealm.write(() => {
        cacheRealm.create(
          "QuizCache",
          {
            id: docRef.id,
            title: examData.title || "Untitled Exam",
            subject: examData.subject || examData.className || "General",
            className: examData.className || "",
            classId: examData.classId || "",
            status: "Draft",
            structureLocked: Boolean(examData.structureLocked),
            papersCount: 0,
            questionCount: examData.num_items || 0,
            answerKey: "",
            createdBy: currentUser.uid,
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1,
            instructorId: examData.instructorId || "",
            examCode: examData.examCode || "",
            choicesPerItem: examData.choices_per_item || 4,
          },
          Realm.UpdateMode.Modified,
        );
      });

      return docRef.id;
    } catch (err) {
      console.error("Error in createExam:", err);
      throw err;
    }
  }
  private static isNetworkRelatedError(error: any): boolean {
    const text = [
      error?.message ?? "",
      error?.code ?? "",
      error?.name ?? "",
      String(error ?? ""),
    ]
      .join(" ")
      .toLowerCase();

    return (
      text.includes("network") ||
      text.includes("offline") ||
      text.includes("unavailable") ||
      text.includes("deadline-exceeded") ||
      text.includes("loadbundlefromserverrequesterror") ||
      text.includes("could not load bundle")
    );
  }

  /**
   * Fetch exam configuration by ID from Firebase
   */
  static async getExamById(examId: string): Promise<ExamPreviewData | null> {
    try {
      console.log("[ExamService] ===== FETCHING EXAM =====");
      console.log("[ExamService] Exam ID:", examId);

      // 0. Handle Staging IDs directly - FASTEST & HIGHEST PRIORITY
      if (examId.startsWith("staging_")) {
        console.log("[ExamService] Resolving Staging Exam ID:", examId);
        const stagingRealm = await RealmService.getStagingRealm();
        const hexId = examId.replace("staging_", "");
        const sQuiz = stagingRealm.objectForPrimaryKey<OfflineQuiz>(
          "OfflineQuiz",
          new Realm.BSON.ObjectId(hexId),
        );

        if (sQuiz) {
          const answerKeyData = sQuiz.answerKey
            ? JSON.parse(sQuiz.answerKey)
            : null;
          const totalQuestions = sQuiz.questionCount || 20;

          const extractedAnswers: string[] = [];
          if (answerKeyData?.questionSettings) {
            for (let i = 0; i < totalQuestions; i++) {
              const setting = answerKeyData.questionSettings.find(
                (qs: any) => qs.questionNumber === i + 1,
              );
              extractedAnswers.push(setting?.correctAnswer || "");
            }
          } else if (
            answerKeyData?.answers &&
            Array.isArray(answerKeyData.answers)
          ) {
            for (let i = 0; i < totalQuestions; i++) {
              extractedAnswers.push(answerKeyData.answers[i] || "");
            }
          } else {
            for (let i = 0; i < totalQuestions; i++) {
              extractedAnswers.push("");
            }
          }

          return {
            metadata: {
              examId: examId,
              title: sQuiz.title,
              subject: sQuiz.subject,
              section: "",
              date: sQuiz.createdAt.toISOString(),
              examCode: sQuiz.examCode || "PENDING",
              status: sQuiz.status as any,
              createdAt: sQuiz.createdAt,
              updatedAt: sQuiz.createdAt,
              createdBy: sQuiz.createdBy,
              version: 1,
            },
            answerKey: answerKeyData
              ? {
                  id: `ak_${examId}`,
                  examId: examId,
                  answers: extractedAnswers,
                  questionSettings: answerKeyData.questionSettings || [],
                  locked: false,
                  createdAt: sQuiz.createdAt,
                  updatedAt: sQuiz.createdAt,
                  createdBy: sQuiz.createdBy,
                  version: 1,
                }
              : (null as any),
            templateLayout: {
              name: "Standard Template",
              totalQuestions: totalQuestions,
              choiceFormat: sQuiz.choicesPerItem === 5 ? "A-E" : "A-D",
              columns: 2,
              questionsPerColumn: Math.ceil(totalQuestions / 2),
            },
            totalQuestions: totalQuestions,
            choiceFormat: sQuiz.choicesPerItem === 5 ? "A-E" : "A-D",
            lastModified: sQuiz.createdAt,
          };
        }
      }

      // 1. Check Cache Realm (Local Mirror) - FAST
      const cacheRealm = await RealmService.getCacheRealm();
      const cachedQuiz = cacheRealm.objectForPrimaryKey<QuizCache>(
        "QuizCache",
        examId,
      );

      if (cachedQuiz) {
        console.log("[ExamService] Found exam in Cache Realm (Fast Path)");
        const answerKeyData = cachedQuiz.answerKey
          ? JSON.parse(cachedQuiz.answerKey)
          : null;
        const totalQuestions = cachedQuiz.questionCount || 20;

        const extractedAnswers: string[] = [];
        if (answerKeyData?.questionSettings) {
          for (let i = 0; i < totalQuestions; i++) {
            const setting = answerKeyData.questionSettings.find(
              (qs: any) => qs.questionNumber === i + 1,
            );
            extractedAnswers.push(setting?.correctAnswer || "");
          }
        } else if (
          answerKeyData?.answers &&
          Array.isArray(answerKeyData.answers)
        ) {
          for (let i = 0; i < totalQuestions; i++) {
            extractedAnswers.push(answerKeyData.answers[i] || "");
          }
        } else {
          for (let i = 0; i < totalQuestions; i++) {
            extractedAnswers.push("");
          }
        }

        return {
          metadata: {
            examId: cachedQuiz.id,
            title: cachedQuiz.title,
            subject: cachedQuiz.subject,
            section: "",
            date: cachedQuiz.createdAt.toISOString(),
            examCode: cachedQuiz.examCode || "N/A",
            status: cachedQuiz.status as any,
            structureLocked: Boolean(cachedQuiz.structureLocked),
            createdAt: cachedQuiz.createdAt,
            updatedAt: cachedQuiz.updatedAt,
            createdBy: cachedQuiz.createdBy,
            version: cachedQuiz.version || 1,
          },
          answerKey: answerKeyData
            ? {
                id: answerKeyData.id || "",
                examId: examId,
                answers: extractedAnswers,
                questionSettings: answerKeyData.questionSettings || [],
                locked: answerKeyData.locked || false,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: "",
                version: 1,
              }
            : (null as any),
          templateLayout: {
            name: "Standard Template",
            totalQuestions: totalQuestions,
            choiceFormat: cachedQuiz.choicesPerItem === 5 ? "A-E" : "A-D",
            columns: 2,
            questionsPerColumn: Math.ceil(totalQuestions / 2),
          },
          totalQuestions: totalQuestions,
          choiceFormat: cachedQuiz.choicesPerItem === 5 ? "A-E" : "A-D",
          lastModified: cachedQuiz.updatedAt,
        };
      }

      // 1.5. Check OfflineStorageService (Legacy/Persistence Fallback) - FAST
      const offlineExam = await OfflineStorageService.getDownloadedExam(examId);
      if (offlineExam) {
        console.log(
          "[ExamService] Found exam in OfflineStorageService (Persistence Path)",
        );
        return {
          metadata: {
            examId: examId,
            examCode: String((offlineExam as any).examCode || examId),
            title: offlineExam.title,
            subject: "",
            section: "",
            date: offlineExam.createdAt.toISOString(),
            status: "Active",
            version: offlineExam.version,
            createdAt: offlineExam.createdAt,
            updatedAt: offlineExam.updatedAt,
            createdBy: offlineExam.createdBy || "",
          },
          totalQuestions: offlineExam.questions?.length || 0,
          choiceFormat: "A-D",
          answerKey: {
            id: `ak_${examId}_offline`,
            examId,
            answers: offlineExam.answerKey?.answers || [],
            questionSettings: [],
            locked: true,
            createdAt: offlineExam.createdAt,
            updatedAt: offlineExam.updatedAt,
            createdBy: offlineExam.createdBy || "",
            version: offlineExam.version || 1,
          },
          lastModified: offlineExam.updatedAt,
        };
      }

      const { NetworkService } = await import("./networkService");
      const isOnline = await NetworkService.isOnline();

      if (!isOnline) {
        console.log(
          "[ExamService] Device offline and no cache found for:",
          examId,
        );
        return null;
      }

      // 2. Fetch from Firebase (Always if online, or fallback if cache miss)
      try {
        const examRef = doc(db, "exams", examId);
        const examSnap = await getDoc(examRef);

        if (!examSnap.exists()) {
          console.log("[ExamService] Exam document not found in Firestore");
          // Final fallback to cache if online but not found (could be a sync delay)
          return await this.fetchFromCache(examId);
        }

        const examData = examSnap.data();
        console.log("[ExamService] Exam document found in Firestore");
        console.log("[ExamService] Exam title:", examData.title);
        console.log("[ExamService] Exam num_items:", examData.num_items);
        console.log(
          "[ExamService] Exam createdAt:",
          examData.createdAt?.toMillis(),
        );
        console.log("[ExamService] Exam examId field:", examData.examId);
        console.log("[ExamService] Exam document ID:", examSnap.id);

        // Fetch answer key - prefer the most recently updated answer key for this exam
        let answerKeyData = null;
        let answerKeyId = null;
        const { collection, query, where, getDocs } =
          await import("firebase/firestore");
        const answerKeysQuery = query(
          collection(db, "answerKeys"),
          where("examId", "==", examId),
        );
        const answerKeysSnapshot = await getDocs(answerKeysQuery);

        if (!answerKeysSnapshot.empty) {
          let selected = answerKeysSnapshot.docs[0];
          let selectedScore =
            Number(selected.data().updatedAt?.toMillis?.() ?? 0) * 1_000_000 +
            Number(selected.data().version ?? 1);

          answerKeysSnapshot.docs.slice(1).forEach((candidate) => {
            const data = candidate.data();
            const score =
              Number(data.updatedAt?.toMillis?.() ?? 0) * 1_000_000 +
              Number(data.version ?? 1);
            if (score > selectedScore) {
              selected = candidate;
              selectedScore = score;
            }
          });

          answerKeyData = selected.data();
          answerKeyId = selected.id;
          console.log(
            "[ExamService] Found latest answer key via query:",
            answerKeyId,
          );
        } else {
          // Strategy 2: Query for answer key by examId
          console.log(
            "[ExamService] Timestamp-based ID not found, querying by examId:",
            examId,
          );
          const { collection, query, where, getDocs } =
            await import("firebase/firestore");
          const answerKeysQuery = query(
            collection(db, "answerKeys"),
            where("examId", "==", examId),
          );
          const answerKeysSnapshot = await getDocs(answerKeysQuery);

          console.log(
            "[ExamService] Query returned",
            answerKeysSnapshot.size,
            "documents",
          );

          if (!answerKeysSnapshot.empty) {
            const firstDoc = answerKeysSnapshot.docs[0];
            answerKeyData = firstDoc.data();
            answerKeyId = firstDoc.id;
            console.log(
              "[ExamService] Found answer key via query:",
              answerKeyId,
            );
            console.log(
              "[ExamService] Answer key examId:",
              answerKeyData.examId,
            );
            console.log(
              "[ExamService] Answer key has questionSettings:",
              !!answerKeyData.questionSettings,
            );
            if (answerKeyData.questionSettings) {
              console.log(
                "[ExamService] questionSettings length:",
                answerKeyData.questionSettings.length,
              );
              console.log(
                "[ExamService] First 3 answers:",
                answerKeyData.questionSettings.slice(0, 3).map((qs: any) => ({
                  q: qs.questionNumber,
                  a: qs.correctAnswer,
                })),
              );
            }
          } else {
            console.log("[ExamService] No answer key found for exam:", examId);

            // Strategy 3: Try to find by ID pattern (for web app compatibility)
            console.log(
              "[ExamService] Trying Strategy 3: Search by ID pattern",
            );
            const allAnswerKeysSnapshot = await getDocs(
              collection(db, "answerKeys"),
            );

            console.log(
              "[ExamService] Total answer keys in collection:",
              allAnswerKeysSnapshot.size,
            );

            // Look for answer keys that start with our exam ID
            for (const docSnap of allAnswerKeysSnapshot.docs) {
              if (docSnap.id.startsWith(`ak_${examId}`)) {
                answerKeyData = docSnap.data();
                answerKeyId = docSnap.id;
                console.log(
                  "[ExamService] Found answer key by ID pattern:",
                  answerKeyId,
                );
                break;
              }
            }

            if (!answerKeyData) {
              console.log(
                "[ExamService] Strategy 3 failed - no matching answer key found",
              );
            }
          }
        }

        // Determine choice format
        const choiceFormat = examData.choices_per_item === 5 ? "A-E" : "A-D";
        const totalQuestions =
          answerKeyData?.questionSettings?.length ||
          answerKeyData?.answers?.length ||
          examData.num_items ||
          20;

        // Extract answers - support both mobile and web formats
        const extractedAnswers: string[] = [];

        if (answerKeyData?.questionSettings) {
          // Mobile app format: questionSettings array
          console.log(
            "[ExamService] Using mobile format (questionSettings):",
            answerKeyData.questionSettings.length,
          );
          for (let i = 0; i < totalQuestions; i++) {
            const setting = answerKeyData.questionSettings.find(
              (qs: any) => qs.questionNumber === i + 1,
            );
            const answer = setting?.correctAnswer || "";
            extractedAnswers.push(answer);
            if (i < 5) {
              console.log(`[ExamService] Q${i + 1}: ${answer}`);
            }
          }
          console.log(
            "[ExamService] Total answers extracted:",
            extractedAnswers.filter((a) => a).length,
          );
        } else if (
          answerKeyData?.answers &&
          Array.isArray(answerKeyData.answers)
        ) {
          // Web app format: answers array
          console.log(
            "[ExamService] Using web format (answers array):",
            answerKeyData.answers.length,
          );
          for (let i = 0; i < totalQuestions; i++) {
            const answer = answerKeyData.answers[i] || "";
            extractedAnswers.push(answer);
            if (i < 5) {
              console.log(`[ExamService] Q${i + 1}: ${answer}`);
            }
          }
          console.log(
            "[ExamService] Total answers extracted:",
            extractedAnswers.filter((a) => a).length,
          );
        } else {
          // No answers found - use empty array
          console.log(
            "[ExamService] No questionSettings or answers array found, using empty answers",
          );
          for (let i = 0; i < totalQuestions; i++) {
            extractedAnswers.push("");
          }
        }

        // Transform to ExamPreviewData format
        return {
          metadata: {
            examId: examSnap.id,
            title: examData.title || "Untitled Exam",
            subject: examData.subject,
            section: examData.section,
            date: examData.created_at,
            examCode: examData.examCode || examData.room || "N/A",
            status: examData.status || "Draft",
            structureLocked: Boolean(examData.structureLocked),
            createdAt: examData.createdAt?.toDate() || new Date(),
            updatedAt: examData.updatedAt?.toDate() || new Date(),
            createdBy: examData.createdBy || "",
            version: examData.version || 1,
          },
          answerKey: answerKeyData
            ? {
                id: answerKeyId || "",
                examId: examData.examId || examSnap.id,
                answers: extractedAnswers, // Use extracted answers
                questionSettings: answerKeyData.questionSettings || [],
                locked: answerKeyData.locked || false,
                createdAt: answerKeyData.createdAt?.toDate() || new Date(),
                updatedAt: answerKeyData.updatedAt?.toDate() || new Date(),
                createdBy: answerKeyData.createdBy || "",
                version: answerKeyData.version || 1,
              }
            : {
                id: "",
                examId: examSnap.id,
                answers: extractedAnswers, // Use extracted answers (empty)
                questionSettings: [],
                locked: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: "",
                version: 1,
              },
          templateLayout: {
            name: "Standard Template",
            totalQuestions: totalQuestions,
            choiceFormat: choiceFormat,
            columns: 2,
            questionsPerColumn: Math.ceil(totalQuestions / 2),
          },
          totalQuestions: totalQuestions,
          choiceFormat: choiceFormat,
          lastModified:
            examData.updatedAt?.toDate() ||
            examData.createdAt?.toDate() ||
            new Date(),
        };
      } catch (fbError) {
        console.warn(
          "[ExamService] Firestore fetch failed, falling back to cache:",
          fbError,
        );
        return await this.fetchFromCache(examId);
      }
    } catch (err) {
      console.error("Error in getExamById:", err);
      return null;
    }
  }

  /**
   * Private helper to fetch from cache only
   */
  private static async fetchFromCache(
    examId: string,
  ): Promise<ExamPreviewData | null> {
    const cacheRealm = await RealmService.getCacheRealm();
    const cachedQuiz = cacheRealm.objectForPrimaryKey<QuizCache>(
      "QuizCache",
      examId,
    );

    if (cachedQuiz) {
      console.log("[ExamService] Found exam in Cache Realm");
      const answerKeyData = cachedQuiz.answerKey
        ? JSON.parse(cachedQuiz.answerKey)
        : null;
      const totalQuestions = cachedQuiz.questionCount || 20;

      return {
        metadata: {
          examId: cachedQuiz.id,
          title: cachedQuiz.title,
          subject: cachedQuiz.subject,
          section: "",
          date: cachedQuiz.createdAt.toISOString(),
          examCode: "",
          status: cachedQuiz.status as any,
          structureLocked: Boolean(cachedQuiz.structureLocked),
          createdAt: cachedQuiz.createdAt,
          updatedAt: cachedQuiz.updatedAt,
          createdBy: cachedQuiz.createdBy,
          version: cachedQuiz.version || 1,
        },
        answerKey: answerKeyData
          ? {
              id: answerKeyData.id || "",
              examId: examId,
              answers: answerKeyData.answers || [],
              questionSettings: answerKeyData.questionSettings || [],
              locked: answerKeyData.locked || false,
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: "",
              version: 1,
            }
          : {
              id: "",
              examId: examId,
              answers: Array(totalQuestions).fill(""),
              questionSettings: [],
              locked: false,
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: "",
              version: 1,
            },
        templateLayout: {
          name: "Standard Template",
          totalQuestions: totalQuestions,
          choiceFormat: cachedQuiz.choicesPerItem === 5 ? "A-E" : "A-D",
          columns: 2,
          questionsPerColumn: Math.ceil(totalQuestions / 2),
        },
        totalQuestions: totalQuestions,
        choiceFormat: cachedQuiz.choicesPerItem === 5 ? "A-E" : "A-D",
        lastModified: cachedQuiz.updatedAt,
      };
    }
    return null;
  }

  /**
   * Check if user is authorized to view exam
   */
  static async isAuthorized(userId: string, examId: string): Promise<boolean> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return false;

      // 1. Check Staging Realm (Offline creation)
      if (examId.startsWith("staging_")) {
        const stagingRealm = await RealmService.getStagingRealm();
        const hexId = examId.replace("staging_", "");
        try {
          const sQuiz = stagingRealm.objectForPrimaryKey<OfflineQuiz>(
            "OfflineQuiz",
            new Realm.BSON.ObjectId(hexId),
          );
          return sQuiz ? sQuiz.createdBy === currentUser.uid : false;
        } catch (e) {
          console.warn(
            "[ExamService] Failed to find staging exam in isAuthorized:",
            e,
          );
          return false;
        }
      }

      // 2. Check Cache Realm (Synced data)
      const cacheRealm = await RealmService.getCacheRealm();
      const cachedQuiz = cacheRealm.objectForPrimaryKey<QuizCache>(
        "QuizCache",
        examId,
      );
      if (cachedQuiz) {
        return cachedQuiz.createdBy === currentUser.uid;
      }

      // 3. Fallback to Firestore ONLY if online
      const { NetworkService } = await import("./networkService");
      const isOnline = await NetworkService.isOnline();

      if (!isOnline) {
        console.log(
          "[ExamService] Offline and not found in cache. Access denied by default.",
        );
        return false;
      }

      const examSnap = await getDoc(doc(db, "exams", examId));
      if (!examSnap.exists()) return false;

      const examData = examSnap.data();
      return examData.createdBy === currentUser.uid;
    } catch (error) {
      console.error("Error checking authorization:", error);
      return false;
    }
  }

  /**
   * Format date for display
   */
  static formatDate(date: Date): string {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  }

  /**
   * Format timestamp for display
   */
  static formatTimestamp(date: Date): string {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  /**
   * Get status color
   */
  static getStatusColor(status: string): string {
    switch (status) {
      case "Draft":
        return "#9e9e9e";
      case "Final":
        return "#20BE7B";
      case "Scheduled":
        return "#ff9800";
      case "Active":
        return "#00a550";
      case "Completed":
        return "#4a90e2";
      default:
        return "#666";
    }
  }

  /**
   * Update exam metadata with version conflict checking
   */
  static async updateExamWithVersionCheck(
    examId: string,
    updateData: {
      title?: string;
      subject?: string | null;
      section?: string | null;
      date?: string | null;
      num_items?: number;
      choices_per_item?: 4 | 5;
      structureLocked?: boolean;
      isArchived?: boolean;
    },
    expectedVersion: number,
  ): Promise<number> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const examRef = doc(db, "exams", examId);
      const examSnap = await getDoc(examRef);

      if (!examSnap.exists()) {
        throw new Error("Exam not found");
      }

      const examData = examSnap.data();

      // Check if user is authorized
      if (examData.createdBy !== currentUser.uid) {
        throw new Error("Not authorized to update this exam");
      }

      // Check for version conflicts (optimistic locking)
      const currentVersion = examData.version || 1;

      if (currentVersion !== expectedVersion) {
        throw new Error(
          `Version conflict detected: Expected version ${expectedVersion}, but current version is ${currentVersion}. The exam was modified by another user.`,
        );
      }

      // Prepare update
      const { updateDoc, serverTimestamp } = await import("firebase/firestore");
      const newVersion = currentVersion + 1;

      try {
        await updateDoc(examRef, {
          ...updateData,
          version: newVersion,
          updatedAt: serverTimestamp(),
        });

        const cacheRealm = await RealmService.getCacheRealm();
        const existingCachedExam = cacheRealm.objectForPrimaryKey<QuizCache>(
          "QuizCache",
          examId,
        );
        cacheRealm.write(() => {
          cacheRealm.create(
            "QuizCache",
            {
              id: examId,
              status: examData.status || "Draft",
              structureLocked:
                updateData.structureLocked ?? Boolean(examData.structureLocked),
              questionCount: updateData.num_items ?? examData.num_items ?? 0,
              updatedAt: new Date(),
              version: newVersion,
              choicesPerItem:
                updateData.choices_per_item ?? examData.choices_per_item ?? 4,
              title: updateData.title ?? examData.title ?? "Untitled Exam",
              subject: examData.subject || examData.className || "No Subject",
              className: examData.className || "",
              classId: examData.classId || "",
              isArchived: updateData.isArchived ?? examData.isArchived ?? false,
              papersCount: examData.scanned_papers || 0,
              answerKey: existingCachedExam?.answerKey || "",
              createdBy: examData.createdBy || currentUser.uid,
              createdAt: examData.createdAt?.toDate?.() || new Date(),
              instructorId: examData.instructorId || "",
              examCode: examData.examCode || examData.room || "",
            },
            Realm.UpdateMode.Modified,
          );
        });

        return newVersion;
      } catch (updateError: any) {
        // Handle network errors specifically
        if (this.isNetworkRelatedError(updateError)) {
          throw new Error(
            "Network error: Unable to save changes. Please check your internet connection.",
          );
        }
        throw updateError;
      }
    } catch (error: any) {
      console.error("Error updating exam:", error);

      // Re-throw with more context
      if (this.isNetworkRelatedError(error)) {
        console.warn(
          "[ExamService] Network failed before update completed. Falling back to offline queue.",
          error,
        );
        await OfflineStorageService.queueUpdate(
          examId,
          "update",
          updateData,
          "exams",
        );

        const cacheRealm = await RealmService.getCacheRealm();
        const existingCachedExam = cacheRealm.objectForPrimaryKey<QuizCache>(
          "QuizCache",
          examId,
        );
        if (existingCachedExam) {
          cacheRealm.write(() => {
            if (updateData.title !== undefined)
              existingCachedExam.title = updateData.title;
            if (updateData.subject !== undefined && updateData.subject !== null)
              existingCachedExam.subject = updateData.subject;
            if (updateData.isArchived !== undefined)
              existingCachedExam.isArchived = updateData.isArchived;
            if (updateData.num_items !== undefined)
              existingCachedExam.questionCount = updateData.num_items;
            if (updateData.choices_per_item !== undefined)
              existingCachedExam.choicesPerItem = updateData.choices_per_item;
            if (updateData.structureLocked !== undefined)
              existingCachedExam.structureLocked = updateData.structureLocked;
            existingCachedExam.updatedAt = new Date();
            existingCachedExam.version = (existingCachedExam.version || 1) + 1;
          });
        }

        return (existingCachedExam?.version || 1) + 1;
      }

      throw error;
    }
  }

  /**
   * Update exam metadata (legacy method - use updateExamWithVersionCheck for conflict detection)
   */
  static async updateExam(
    examId: string,
    updateData: {
      title?: string;
      subject?: string | null;
      section?: string | null;
      date?: string | null;
      num_items?: number;
      choices_per_item?: 4 | 5;
      structureLocked?: boolean;
      isArchived?: boolean;
    },
  ): Promise<number> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const isOnline = await NetworkService.isOnline();
      const cacheRealm = await RealmService.getCacheRealm();
      const existingCachedExam = cacheRealm.objectForPrimaryKey<QuizCache>(
        "QuizCache",
        examId,
      );

      // OFFLINE: Queue update and update cache immediately (same as ClassService)
      if (!isOnline) {
        try {
          console.log("\n[ExamService] 📱 OFFLINE MODE - Queuing exam update");
          console.log(`  examId: ${examId}`);
          console.log(`  updateData:`, updateData);

          await OfflineStorageService.queueUpdate(
            examId,
            "update",
            updateData,
            "exams",
          );

          console.log("[ExamService] ✅ Update queued to AsyncStorage");

          if (existingCachedExam) {
            console.log("[ExamService] 📝 Updating local cache...");
            cacheRealm.write(() => {
              if (updateData.title !== undefined)
                existingCachedExam.title = updateData.title;
              if (
                updateData.subject !== undefined &&
                updateData.subject !== null
              )
                existingCachedExam.subject = updateData.subject;
              if (updateData.isArchived !== undefined) {
                console.log(
                  `  Setting isArchived to: ${updateData.isArchived}`,
                );
                existingCachedExam.isArchived = updateData.isArchived;
              }
              if (updateData.num_items !== undefined)
                existingCachedExam.questionCount = updateData.num_items;
              if (updateData.choices_per_item !== undefined)
                existingCachedExam.choicesPerItem = updateData.choices_per_item;
              if (updateData.structureLocked !== undefined)
                existingCachedExam.structureLocked = updateData.structureLocked;
              existingCachedExam.updatedAt = new Date();
              existingCachedExam.version =
                (existingCachedExam.version || 1) + 1;
            });
            console.log("[ExamService] ✅ Cache updated");
          } else {
            console.log("[ExamService] ⚠️  No cached exam found to update");
          }

          const newVersion = (existingCachedExam?.version || 1) + 1;
          console.log(
            `[ExamService] ✅ Offline update complete (version: ${newVersion})\n`,
          );
          return newVersion;
        } catch (offlineError) {
          console.error("\n❌ [ExamService] OFFLINE UPDATE FAILED:");
          console.error("Error:", offlineError);
          console.error(
            "Stack:",
            offlineError instanceof Error ? offlineError.stack : "N/A",
          );
          console.error();
          throw offlineError;
        }
      }

      // ONLINE: Update Firebase
      console.log("\n[ExamService] 🌐 ONLINE MODE - Updating Firebase");
      console.log(`  examId: ${examId}`);
      console.log(`  updateData:`, updateData);

      const examRef = doc(db, "exams", examId);
      const examSnap = await getDoc(examRef);

      if (!examSnap.exists()) {
        throw new Error("Exam not found");
      }

      const examData = examSnap.data();

      // Check if user is authorized
      if (examData.createdBy !== currentUser.uid) {
        throw new Error("Not authorized to update this exam");
      }

      // Check for version conflicts (optimistic locking)
      const currentVersion = examData.version || 1;

      // Prepare update
      const { updateDoc, serverTimestamp } = await import("firebase/firestore");
      const newVersion = currentVersion + 1;

      try {
        console.log(
          `[ExamService] 📤 Uploading to Firebase (version ${currentVersion} → ${newVersion})...`,
        );
        await updateDoc(examRef, {
          ...updateData,
          version: newVersion,
          updatedAt: serverTimestamp(),
        });
        console.log("[ExamService] ✅ Firebase update successful");

        console.log("[ExamService] 📝 Updating local cache...");
        cacheRealm.write(() => {
          cacheRealm.create(
            "QuizCache",
            {
              id: examId,
              status: examData.status || "Draft",
              structureLocked:
                updateData.structureLocked ?? Boolean(examData.structureLocked),
              questionCount: updateData.num_items ?? examData.num_items ?? 0,
              updatedAt: new Date(),
              version: newVersion,
              choicesPerItem:
                updateData.choices_per_item ?? examData.choices_per_item ?? 4,
              title: updateData.title ?? examData.title ?? "Untitled Exam",
              subject: examData.subject || examData.className || "No Subject",
              className: examData.className || "",
              classId: examData.classId || "",
              isArchived: updateData.isArchived ?? examData.isArchived ?? false,
              papersCount: examData.scanned_papers || 0,
              answerKey: existingCachedExam?.answerKey || "",
              createdBy: examData.createdBy || currentUser.uid,
              createdAt: examData.createdAt?.toDate?.() || new Date(),
              instructorId: examData.instructorId || "",
              examCode: examData.examCode || examData.room || "",
            },
            Realm.UpdateMode.Modified,
          );
        });
        console.log("[ExamService] ✅ Cache updated");
        console.log(
          `[ExamService] ✅ Online update complete (version: ${newVersion})\n`,
        );

        return newVersion;
      } catch (updateError: any) {
        console.error("\n❌ [ExamService] Firebase update failed:");
        console.error("Error:", updateError);

        // Handle network errors specifically
        if (this.isNetworkRelatedError(updateError)) {
          console.warn(
            "[ExamService] 📱 Network error detected - falling back to offline queue.",
          );
          await OfflineStorageService.queueUpdate(
            examId,
            "update",
            updateData,
            "exams",
          );

          if (existingCachedExam) {
            cacheRealm.write(() => {
              if (updateData.title !== undefined)
                existingCachedExam.title = updateData.title;
              if (
                updateData.subject !== undefined &&
                updateData.subject !== null
              )
                existingCachedExam.subject = updateData.subject;
              if (updateData.isArchived !== undefined)
                existingCachedExam.isArchived = updateData.isArchived;
              if (updateData.num_items !== undefined)
                existingCachedExam.questionCount = updateData.num_items;
              if (updateData.choices_per_item !== undefined)
                existingCachedExam.choicesPerItem = updateData.choices_per_item;
              if (updateData.structureLocked !== undefined)
                existingCachedExam.structureLocked = updateData.structureLocked;
              existingCachedExam.updatedAt = new Date();
              existingCachedExam.version =
                (existingCachedExam.version || 1) + 1;
            });
          }

          console.log(
            "[ExamService] ✅ Fallback to offline queue successful\n",
          );
          return (existingCachedExam?.version || 1) + 1;
        }
        throw updateError;
      }
    } catch (error: any) {
      console.error(
        "\n❌ [ExamService] updateExam FAILED - FULL ERROR DETAILS:",
      );
      console.error("════════════════════════════════════════════════════════");
      console.error("Exam ID:", examId);
      console.error("Update Data:", updateData);

      if (error instanceof Error) {
        console.error("Error Name:", error.name);
        console.error("Error Code:", (error as any).code);
        console.error("Error Message:", error.message);
        console.error("\nStack Trace:");
        console.error(error.stack);
      } else if (typeof error === "object") {
        console.error("Error Object:", JSON.stringify(error, null, 2));
      } else {
        console.error("Error:", String(error));
      }

      console.error(
        "════════════════════════════════════════════════════════\n",
      );
      throw error;
    }
  }

  /**
   * Check if exam has active scan session
   */
  static async hasActiveScanSession(examId: string): Promise<boolean> {
    try {
      const { NetworkService } = await import("./networkService");
      const online = await NetworkService.isOnline();
      if (!online) return false;

      const { collection, query, where, getDocs } =
        await import("firebase/firestore");

      const q = query(
        collection(db, "scanSessions"),
        where("examId", "==", examId),
        where("status", "==", "active"),
      );

      const querySnapshot = await getDocs(q);
      return !querySnapshot.empty;
    } catch (error) {
      console.error("Error checking scan sessions:", error);
      return false;
    }
  }

  /**
   * Update exam status
   */
  static async updateExamStatus(
    examId: string,
    newStatus: "Draft" | "Scheduled" | "Active" | "Completed",
    scheduleDate?: Date,
  ): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      const examRef = doc(db, "exams", examId);
      const examSnap = await getDoc(examRef);

      if (!examSnap.exists()) {
        throw new Error("Exam not found");
      }

      const examData = examSnap.data();

      // Check if user is authorized
      if (examData.createdBy !== currentUser.uid) {
        throw new Error("Not authorized to update this exam");
      }

      // Validate status transitions
      const currentStatus = examData.status || "Draft";
      if (!this.isValidStatusTransition(currentStatus, newStatus)) {
        throw new Error(
          `Cannot change status from ${currentStatus} to ${newStatus}`,
        );
      }

      // Prepare update data
      const { updateDoc, serverTimestamp } = await import("firebase/firestore");
      const updateData: any = {
        status: newStatus,
        updatedAt: serverTimestamp(),
        version: (examData.version || 1) + 1,
      };

      // Add schedule date if provided
      if (scheduleDate && newStatus === "Scheduled") {
        updateData.scheduledDate = scheduleDate.toISOString();
      }

      // Add activation timestamp for Active status
      if (newStatus === "Active") {
        updateData.activatedAt = serverTimestamp();
      }

      // Add completion timestamp for Completed status
      if (newStatus === "Completed") {
        updateData.completedAt = serverTimestamp();
      }

      await updateDoc(examRef, updateData);

      // Log the status change
      await AuditLogService.logExamStatusChange(
        examId,
        currentUser.uid,
        currentStatus,
        newStatus,
        updateData.version,
      );

      console.log(`Exam status updated from ${currentStatus} to ${newStatus}`);
    } catch (error) {
      console.error("Error updating exam status:", error);
      throw error;
    }
  }

  /**
   * Check if status transition is valid
   */
  static isValidStatusTransition(
    currentStatus: string,
    newStatus: string,
  ): boolean {
    const validTransitions: Record<string, string[]> = {
      Draft: ["Scheduled", "Active"],
      Scheduled: ["Active", "Draft"],
      Active: ["Completed"],
      Completed: [], // No transitions from completed
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  /**
   * Get available status transitions for current status
   */
  static getAvailableStatusTransitions(
    currentStatus: string,
  ): { status: string; label: string; color: string }[] {
    const transitions: Record<
      string,
      { status: string; label: string; color: string }[]
    > = {
      Draft: [
        { status: "Scheduled", label: "Schedule Exam", color: "#ff9800" },
        { status: "Active", label: "Activate Now", color: "#00a550" },
      ],
      Scheduled: [
        { status: "Active", label: "Activate Now", color: "#00a550" },
        { status: "Draft", label: "Back to Draft", color: "#9e9e9e" },
      ],
      Active: [
        { status: "Completed", label: "Complete Exam", color: "#4a90e2" },
      ],
      Completed: [], // No transitions from completed
    };

    return transitions[currentStatus] || [];
  }

  /**
   * Check if exam has been printed
   */
  static async hasBeenPrinted(examId: string): Promise<boolean> {
    try {
      const { collection, query, where, getDocs } =
        await import("firebase/firestore");

      const q = query(
        collection(db, "printJobs"),
        where("examId", "==", examId),
        where("status", "==", "completed"),
      );

      const querySnapshot = await getDocs(q);
      return !querySnapshot.empty;
    } catch (error) {
      console.error("Error checking print jobs:", error);
      // Return false if collection doesn't exist or no permissions
      // This allows the edit functionality to continue working
      return false;
    }
  }
}
