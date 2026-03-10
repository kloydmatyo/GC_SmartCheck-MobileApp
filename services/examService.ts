import { auth, db } from "@/config/firebase";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import Realm from "realm";
import { ExamPreviewData } from "../types/exam";
import { AuditLogService } from "./auditLogService";
import { OfflineQuiz, QuizCache, RealmService } from "./realmService";

export class ExamService {
  /**
   * Get all exams for the current user (Cache + Staging)
   */
  static async getExamsByUser(): Promise<any[]> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return [];

      const { NetworkService } = await import("./networkService");
      const isOnline = await NetworkService.isOnline();

      const stagingRealm = await RealmService.getStagingRealm();
      const staging = stagingRealm.objects<OfflineQuiz>("OfflineQuiz");

      if (isOnline) {
        console.log("[ExamService] Online. Fetching from Firestore...");
        const q = query(collection(db, "exams"), where("createdBy", "==", currentUser.uid));
        const snap = await getDocs(q);
        const cacheRealm = await RealmService.getCacheRealm();

        const examIds = snap.docs.map(doc => doc.id);
        const answerKeysMap: Record<string, any> = {};

        // Firestore 'in' queries are limited to 30 elements.
        const chunkArray = (arr: string[], size: number) =>
          Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, i * size + size)
          );

        const chunks = chunkArray(examIds, 30);

        for (const chunk of chunks) {
          if (chunk.length === 0) continue;
          const akQuery = query(collection(db, "answerKeys"), where("examId", "in", chunk));
          const akSnap = await getDocs(akQuery);
          akSnap.docs.forEach(doc => {
            const data = doc.data();
            const eId = data.examId;
            // Keep the latest version if multiple exist
            if (!answerKeysMap[eId] || (data.version || 0) > (answerKeysMap[eId].version || 0)) {
              answerKeysMap[eId] = data;
            }
          });
        }

        // Cache the newly fetched data in realmdb.primary
        cacheRealm.write(() => {
          snap.docs.forEach(docSnap => {
            const data = docSnap.data();
            const eId = docSnap.id;
            const akJson = answerKeysMap[eId] ? JSON.stringify(answerKeysMap[eId]) : "";

            cacheRealm.create("QuizCache", {
              id: eId,
              title: data.title || "Untitled Exam",
              subject: data.subject || data.className || "No Subject",
              status: data.status || "Draft",
              papersCount: data.scanned_papers || 0,
              questionCount: data.num_items || 0,
              answerKey: akJson,
              createdBy: data.createdBy,
              createdAt: data.createdAt?.toDate?.() || new Date(),
              updatedAt: data.updatedAt?.toDate?.() || new Date(),
              instructorId: data.instructorId || "",
              examCode: data.examCode || data.room || "",
              choicesPerItem: data.choices_per_item || 4,
            }, Realm.UpdateMode.Modified);
          });
        });

        // Map data for UI components
        const firestoreExams = snap.docs.map(doc => {
          return {
            id: doc.id,
            ...doc.data(),
            title: doc.data().title || "Untitled Exam",
            class: doc.data().subject || doc.data().className || "No Subject",
            date: doc.data().created_at || "No Date",
            papers: doc.data().scanned_papers || 0,
            status: doc.data().status || "Draft",
            isDownloaded: true, // Always true now because we just cached it!
            isStaging: false,
          };
        });

        const results = [...firestoreExams];
        // Add staging exams that aren't synced yet
        staging.forEach(s => {
          results.push({
            id: `staging_${s._id.toHexString()}`,
            title: s.title,
            class: s.subject,
            date: s.createdAt.toLocaleDateString(),
            papers: 0,
            status: s.status,
            isStaging: true,
            isDownloaded: true, // Staging is local, so it's "downloaded"
          } as any);
        });
        return results;
      }

      console.log("[ExamService] Offline. Falling back to Realm Cache...");
      const cacheRealm = await RealmService.getCacheRealm();
      const cached = cacheRealm.objects<QuizCache>("QuizCache");

      const localExams: any[] = [];

      cached.forEach(q => {
        localExams.push({
          id: q.id,
          title: q.title,
          class: q.subject,
          date: q.createdAt.toLocaleDateString(),
          papers: q.papersCount,
          status: q.status,
          isDownloaded: true,
          isStaging: false,
        });
      });

      staging.forEach(s => {
        localExams.push({
          id: `staging_${s._id.toHexString()}`,
          title: s.title,
          class: s.subject,
          date: s.createdAt.toLocaleDateString(),
          papers: 0,
          status: s.status,
          isDownloaded: true, // Staging is local
          isStaging: true,
        });
      });

      return localExams;
    } catch (err) {
      console.error("Error in getExamsByUser:", err);
      return [];
    }
  }

  /**
   * Update answer key for an exam
   */
  static async updateAnswerKey(examId: string, answers: string[]): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Not authenticated");

      const { NetworkService } = await import("./networkService");
      const isOnline = await NetworkService.isOnline();

      if (examId.startsWith("staging_")) {
        console.log("[ExamService] Updating Staging Answer Key:", examId);
        const stagingRealm = await RealmService.getStagingRealm();
        const hexId = examId.replace("staging_", "");
        const sQuiz = stagingRealm.objectForPrimaryKey<OfflineQuiz>("OfflineQuiz", new Realm.BSON.ObjectId(hexId));

        if (sQuiz) {
          stagingRealm.write(() => {
            sQuiz.answerKey = JSON.stringify({ answers });
          });
          return;
        }
        throw new Error("Staging quiz not found");
      }

      if (!isOnline) {
        // Queue for sync if it's a Firestore ID but we're offline
        console.log("[ExamService] Offline. Queueing answer key update...");
        const stagingRealm = await RealmService.getStagingRealm();
        // We'll reuse OfflineQuiz staging if possible, or we need a new PendingUpdate schema
        // For now, let's just use the existing OfflineStorageService for updates if it's not a staging quiz
        const { OfflineStorageService } = await import("./offlineStorageService");
        await OfflineStorageService.queueUpdate(examId, "update", {
          answerKey: { answers, locked: false }
        });
        return;
      }

      // Online - Sync to Firestore
      const { collection, doc, query, where, getDocs, setDoc, serverTimestamp } = await import("firebase/firestore");

      // Find correctly resolving answer key ID
      const q = query(collection(db, "answerKeys"), where("examId", "==", examId));
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
          points: 1
        }))
      };

      await setDoc(akRef, answerKeyData, { merge: true });
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

      const { addDoc, collection, serverTimestamp } = await import("firebase/firestore");
      const docRef = await addDoc(collection(db, "exams"), {
        ...examData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
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

      const { NetworkService } = await import("./networkService");
      const isOnline = await NetworkService.isOnline();

      // 0. Handle Staging IDs directly
      if (examId.startsWith("staging_")) {
        console.log("[ExamService] Resolving Staging Exam ID:", examId);
        const stagingRealm = await RealmService.getStagingRealm();
        const hexId = examId.replace("staging_", "");
        const sQuiz = stagingRealm.objectForPrimaryKey<OfflineQuiz>("OfflineQuiz", new Realm.BSON.ObjectId(hexId));

        if (sQuiz) {
          const answerKeyData = sQuiz.answerKey ? JSON.parse(sQuiz.answerKey) : null;
          const totalQuestions = sQuiz.questionCount || 20;

          const extractedAnswers: string[] = [];
          if (answerKeyData?.questionSettings) {
            for (let i = 0; i < totalQuestions; i++) {
              const setting = answerKeyData.questionSettings.find((qs: any) => qs.questionNumber === i + 1);
              extractedAnswers.push(setting?.correctAnswer || "");
            }
          } else if (answerKeyData?.answers && Array.isArray(answerKeyData.answers)) {
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
            answerKey: answerKeyData ? {
              id: `ak_${examId}`,
              examId: examId,
              answers: extractedAnswers,
              questionSettings: answerKeyData.questionSettings || [],
              locked: false,
              createdAt: sQuiz.createdAt,
              updatedAt: sQuiz.createdAt,
              createdBy: sQuiz.createdBy,
              version: 1,
            } : null as any,
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
      if (!isOnline) {
        const cacheRealm = await RealmService.getCacheRealm();
        const cachedQuiz = cacheRealm.objectForPrimaryKey<QuizCache>("QuizCache", examId);

        if (cachedQuiz) {
          console.log("[ExamService] Found exam in Cache Realm (Offline)");
          const answerKeyData = cachedQuiz.answerKey ? JSON.parse(cachedQuiz.answerKey) : null;
          const totalQuestions = cachedQuiz.questionCount || 20;

          const extractedAnswers: string[] = [];
          if (answerKeyData?.questionSettings) {
            for (let i = 0; i < totalQuestions; i++) {
              const setting = answerKeyData.questionSettings.find((qs: any) => qs.questionNumber === i + 1);
              extractedAnswers.push(setting?.correctAnswer || "");
            }
          } else if (answerKeyData?.answers && Array.isArray(answerKeyData.answers)) {
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
              section: "", // Optional
              date: cachedQuiz.createdAt.toISOString(),
              examCode: cachedQuiz.examCode || "N/A",
              status: cachedQuiz.status as any,
              createdAt: cachedQuiz.createdAt,
              updatedAt: cachedQuiz.updatedAt,
              createdBy: cachedQuiz.createdBy,
              version: 1,
            },
            answerKey: answerKeyData ? {
              id: answerKeyData.id || "",
              examId: examId,
              answers: extractedAnswers,
              questionSettings: answerKeyData.questionSettings || [],
              locked: answerKeyData.locked || false,
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: "",
              version: 1,
            } : null as any,
            templateLayout: {
              name: "Standard Template",
              totalQuestions: totalQuestions,
              choiceFormat: "A-D", // Default
              columns: 2,
              questionsPerColumn: Math.ceil(totalQuestions / 2),
            },
            totalQuestions: totalQuestions,
            choiceFormat: "A-D",
            lastModified: cachedQuiz.updatedAt,
          };
        }
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
        const { collection, query, where, getDocs } = await import(
          "firebase/firestore"
        );
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
          console.log("[ExamService] Found latest answer key via query:", answerKeyId);
        } else {
<<<<<<< HEAD
          console.log("[ExamService] No answer key found for exam:", examId);

          // Strategy 3: Try to find by ID pattern (for web app compatibility)
          console.log("[ExamService] Trying Strategy 3: Search by ID pattern");
          const allAnswerKeysSnapshot = await getDocs(
            collection(db, "answerKeys"),
=======
          // Strategy 2: Query for answer key by examId
          console.log(
            "[ExamService] Timestamp-based ID not found, querying by examId:",
            examId,
>>>>>>> 22747b7 (implemented the offline mode adding new classes and exams now saved to realmdb)
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
            console.log("[ExamService] Found answer key via query:", answerKeyId);
            console.log("[ExamService] Answer key examId:", answerKeyData.examId);
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
            console.log("[ExamService] Trying Strategy 3: Search by ID pattern");
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

<<<<<<< HEAD
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
=======
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
        console.warn("[ExamService] Firestore fetch failed, falling back to cache:", fbError);
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
  private static async fetchFromCache(examId: string): Promise<ExamPreviewData | null> {
    const cacheRealm = await RealmService.getCacheRealm();
    const cachedQuiz = cacheRealm.objectForPrimaryKey<QuizCache>("QuizCache", examId);

    if (cachedQuiz) {
      console.log("[ExamService] Found exam in Cache Realm");
      const answerKeyData = cachedQuiz.answerKey ? JSON.parse(cachedQuiz.answerKey) : null;
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
          createdAt: cachedQuiz.createdAt,
          updatedAt: cachedQuiz.updatedAt,
          createdBy: cachedQuiz.createdBy,
          version: 1,
        },
        answerKey: answerKeyData ? {
          id: answerKeyData.id || "",
          examId: examId,
          answers: answerKeyData.answers || [],
          questionSettings: answerKeyData.questionSettings || [],
          locked: answerKeyData.locked || false,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: "",
          version: 1,
        } : {
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
>>>>>>> 22747b7 (implemented the offline mode adding new classes and exams now saved to realmdb)
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
      if (!currentUser) {
        return false;
      }

      const examRef = doc(db, "exams", examId);
      const examSnap = await getDoc(examRef);

      if (!examSnap.exists()) {
        return false;
      }

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

      // Check if exam is in Draft status
      if (examData.status !== "Draft") {
        throw new Error("Only Draft exams can be edited");
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
        throw new Error("Network error: " + error.message);
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
    },
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

      // Check if exam is in Draft status
      if (examData.status !== "Draft") {
        throw new Error("Only Draft exams can be edited");
      }

      // Check for version conflicts (optimistic locking)
      const currentVersion = examData.version || 1;

      // Prepare update
      const { updateDoc, serverTimestamp } = await import("firebase/firestore");
      const newVersion = currentVersion + 1;

      try {
        await updateDoc(examRef, {
          ...updateData,
          version: newVersion,
          updatedAt: serverTimestamp(),
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
        throw new Error("Network error: " + error.message);
      }

      throw error;
    }
  }

  /**
   * Check if exam has active scan session
   */
  static async hasActiveScanSession(examId: string): Promise<boolean> {
    try {
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
      // Return false if collection doesn't exist or no permissions
      // This allows the edit functionality to continue working
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
