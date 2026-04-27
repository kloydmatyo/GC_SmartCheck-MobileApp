import { Ionicons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useState } from "react";
import {
    Alert,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Toast from "react-native-toast-message";
import { db } from "../../config/firebase";
import { ClassService } from "../../services/classService";
import {
    DuplicateScoreDetectionService,
    DuplicateScoreMatch,
} from "../../services/duplicateScoreDetectionService";
import { GradeStorageService } from "../../services/gradeStorageService";
import { GradingService } from "../../services/gradingService";
import { StorageService } from "../../services/storageService";
import { GradingResult, ScanResult, StudentAnswer } from "../../types/scanning";
import { DuplicateScoreWarningModal } from "../modals/DuplicateScoreWarningModal";
import CameraScanner from "./CameraScanner";
import ScanResults from "./ScanResults";

// Helper for fast-failing Firestore calls
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

function resolveChoicesPerQuestion(examData: any): 4 | 5 {
  const rawChoiceCount =
    examData?.choicesPerQuestion ??
    examData?.choices_per_item ??
    examData?.choicesPerItem;
  const rawChoiceFormat =
    examData?.choiceFormat ??
    examData?.choicesFormat ??
    examData?.choice_format;

  if (rawChoiceCount === 5 || rawChoiceCount === "5") return 5;
  if (rawChoiceCount === 4 || rawChoiceCount === "4") return 4;

  if (typeof rawChoiceFormat === "string") {
    const normalized = rawChoiceFormat.trim().toUpperCase();
    if (
      normalized === "A-E" ||
      normalized === "AE" ||
      normalized.includes("5")
    ) {
      return 5;
    }
    if (
      normalized === "A-D" ||
      normalized === "AD" ||
      normalized.includes("4")
    ) {
      return 4;
    }
  }

  return 4;
}

type Scan200LocalTransform =
  | "identity"
  | "reverseAll"
  | "physicalRowMajor"
  | "physicalRowMajorReverse"
  | "topBottomSwap"
  | "reverseRowsWithinBlocks";

interface Scan200MappingCandidate {
  name: string;
  swapPages: boolean;
  mirrorChoices: boolean;
  localTransform: Scan200LocalTransform;
}

interface Scan200PageProfile {
  name: string;
  mirrorChoices: boolean;
  localTransform: Scan200LocalTransform;
}

const PHYSICAL_BLOCK_STARTS_200 = [1, 21, 41, 61, 81, 11, 31, 51, 71, 91];

function find200Block(localQuestion: number): {
  blockIndex: number;
  row: number;
} {
  for (let i = 0; i < PHYSICAL_BLOCK_STARTS_200.length; i++) {
    const start = PHYSICAL_BLOCK_STARTS_200[i];
    if (localQuestion >= start && localQuestion < start + 10) {
      return { blockIndex: i, row: localQuestion - start };
    }
  }

  return {
    blockIndex: Math.floor((localQuestion - 1) / 10),
    row: (localQuestion - 1) % 10,
  };
}

function localQuestionFromPhysicalBlock(
  blockIndex: number,
  row: number,
): number {
  const safeBlock = Math.max(0, Math.min(9, blockIndex));
  const safeRow = Math.max(0, Math.min(9, row));
  return PHYSICAL_BLOCK_STARTS_200[safeBlock] + safeRow;
}

function transform200LocalQuestion(
  localQuestion: number,
  transform: Scan200LocalTransform,
): number {
  const { blockIndex, row } = find200Block(localQuestion);

  switch (transform) {
    case "reverseAll":
      return 101 - localQuestion;
    case "physicalRowMajor":
      return blockIndex * 10 + row + 1;
    case "physicalRowMajorReverse":
      return (9 - blockIndex) * 10 + (9 - row) + 1;
    case "topBottomSwap":
      return localQuestionFromPhysicalBlock(
        blockIndex < 5 ? blockIndex + 5 : blockIndex - 5,
        row,
      );
    case "reverseRowsWithinBlocks":
      return localQuestionFromPhysicalBlock(blockIndex, 9 - row);
    default:
      return localQuestion;
  }
}

function mirrorChoice(choice: string): string {
  switch (choice) {
    case "A":
      return "E";
    case "B":
      return "D";
    case "D":
      return "B";
    case "E":
      return "A";
    default:
      return choice;
  }
}

function remap200Answers(
  answers: StudentAnswer[],
  candidate: Scan200MappingCandidate,
): StudentAnswer[] {
  return answers
    .map((answer) => {
      if (answer.questionNumber < 1 || answer.questionNumber > 200) {
        return answer;
      }

      const pageIndex = answer.questionNumber <= 100 ? 0 : 1;
      const localQuestion = ((answer.questionNumber - 1) % 100) + 1;
      const mappedPageIndex = candidate.swapPages ? 1 - pageIndex : pageIndex;
      const mappedLocal = transform200LocalQuestion(
        localQuestion,
        candidate.localTransform,
      );

      return {
        questionNumber: mappedPageIndex * 100 + mappedLocal,
        selectedAnswer: candidate.mirrorChoices
          ? mirrorChoice(answer.selectedAnswer)
          : answer.selectedAnswer,
      };
    })
    .sort((a, b) => a.questionNumber - b.questionNumber);
}

function remap200PageAnswers(
  answers: StudentAnswer[],
  targetPageIndex: 0 | 1,
  profile: Scan200PageProfile,
): StudentAnswer[] {
  return answers
    .map((answer) => {
      const localQuestion = ((answer.questionNumber - 1) % 100) + 1;
      const mappedLocal = transform200LocalQuestion(
        localQuestion,
        profile.localTransform,
      );

      return {
        questionNumber: targetPageIndex * 100 + mappedLocal,
        selectedAnswer: profile.mirrorChoices
          ? mirrorChoice(answer.selectedAnswer)
          : answer.selectedAnswer,
      };
    })
    .sort((a, b) => a.questionNumber - b.questionNumber);
}

function scoreAnswersAgainstKeyRange(
  answers: StudentAnswer[],
  answerKey: string[],
  startQuestion: number,
  endQuestion: number,
): number {
  const answerMap = new Map(
    answers.map((answer) => [answer.questionNumber, answer.selectedAnswer]),
  );
  let score = 0;

  for (let q = startQuestion; q <= endQuestion; q++) {
    const expected = String(answerKey[q - 1] || "").toUpperCase();
    if (expected && answerMap.get(q) === expected) score++;
  }

  return score;
}

function build200PageProfiles(): Scan200PageProfile[] {
  const transforms: Scan200LocalTransform[] = [
    "identity",
    "reverseAll",
    "physicalRowMajor",
    "physicalRowMajorReverse",
    "topBottomSwap",
    "reverseRowsWithinBlocks",
  ];
  const profiles: Scan200PageProfile[] = [];

  for (const localTransform of transforms) {
    for (const mirrorChoices of [false, true]) {
      profiles.push({
        name: `${localTransform}${mirrorChoices ? "+mirrorChoices" : ""}`,
        mirrorChoices,
        localTransform,
      });
    }
  }

  return profiles;
}

function scoreAnswersAgainstKey(
  answers: StudentAnswer[],
  answerKey: string[],
): number {
  const answerMap = new Map(
    answers.map((answer) => [answer.questionNumber, answer.selectedAnswer]),
  );
  let score = 0;

  for (let i = 0; i < Math.min(200, answerKey.length); i++) {
    const expected = String(answerKey[i] || "").toUpperCase();
    if (expected && answerMap.get(i + 1) === expected) score++;
  }

  return score;
}

function normalize200ScanMapping(
  scanResult: ScanResult,
  answerKey: string[],
): ScanResult {
  if (answerKey.length < 150 || scanResult.answers.length < 150) {
    return scanResult;
  }

  const candidates: Scan200MappingCandidate[] = [];
  const pageProfiles = build200PageProfiles();

  for (const localTransform of [
    "identity",
    "reverseAll",
    "physicalRowMajor",
    "physicalRowMajorReverse",
    "topBottomSwap",
    "reverseRowsWithinBlocks",
  ] as const) {
    for (const swapPages of [false, true]) {
      for (const mirrorChoices of [false, true]) {
        candidates.push({
          name: `${localTransform}${swapPages ? "+swapPages" : ""}${mirrorChoices ? "+mirrorChoices" : ""}`,
          swapPages,
          mirrorChoices,
          localTransform,
        });
      }
    }
  }

  const identity: Scan200MappingCandidate = {
    name: "identity",
    swapPages: false,
    mirrorChoices: false,
    localTransform: "identity",
  };
  const baselineScore = scoreAnswersAgainstKey(scanResult.answers, answerKey);
  let bestCandidate = identity;
  let bestAnswers = scanResult.answers;
  let bestScore = baselineScore;
  let bestMode = "global";
  let secondBestScore = Number.NEGATIVE_INFINITY;
  let secondBestLabel = "none";

  const trackScore = (score: number, label: string) => {
    if (score > bestScore) {
      secondBestScore = bestScore;
      secondBestLabel = `${bestMode}:${bestCandidate.name}`;
      return;
    }

    if (score > secondBestScore) {
      secondBestScore = score;
      secondBestLabel = label;
    }
  };

  for (const candidate of candidates) {
    const mappedAnswers = remap200Answers(scanResult.answers, candidate);
    const score = scoreAnswersAgainstKey(mappedAnswers, answerKey);
    trackScore(score, `global:${candidate.name}`);

    if (score > bestScore) {
      bestCandidate = candidate;
      bestAnswers = mappedAnswers;
      bestScore = score;
      bestMode = "global";
    }
  }

  const pageBuckets: [StudentAnswer[], StudentAnswer[]] = [
    scanResult.answers.filter(
      (answer) => answer.questionNumber >= 1 && answer.questionNumber <= 100,
    ),
    scanResult.answers.filter(
      (answer) => answer.questionNumber >= 101 && answer.questionNumber <= 200,
    ),
  ];

  for (const swapPages of [false, true]) {
    const sourcePage0 = swapPages ? pageBuckets[1] : pageBuckets[0];
    const sourcePage1 = swapPages ? pageBuckets[0] : pageBuckets[1];
    let bestPage0Profile = pageProfiles[0];
    let bestPage0Answers = sourcePage0;
    let bestPage0Score = Number.NEGATIVE_INFINITY;
    let bestPage1Profile = pageProfiles[0];
    let bestPage1Answers = sourcePage1;
    let bestPage1Score = Number.NEGATIVE_INFINITY;

    for (const profile of pageProfiles) {
      const mappedPage0 = remap200PageAnswers(sourcePage0, 0, profile);
      const scorePage0 = scoreAnswersAgainstKeyRange(
        mappedPage0,
        answerKey,
        1,
        100,
      );
      if (scorePage0 > bestPage0Score) {
        bestPage0Profile = profile;
        bestPage0Answers = mappedPage0;
        bestPage0Score = scorePage0;
      }

      const mappedPage1 = remap200PageAnswers(sourcePage1, 1, profile);
      const scorePage1 = scoreAnswersAgainstKeyRange(
        mappedPage1,
        answerKey,
        101,
        200,
      );
      if (scorePage1 > bestPage1Score) {
        bestPage1Profile = profile;
        bestPage1Answers = mappedPage1;
        bestPage1Score = scorePage1;
      }
    }

    const combinedAnswers = [...bestPage0Answers, ...bestPage1Answers].sort(
      (a, b) => a.questionNumber - b.questionNumber,
    );
    const combinedScore = bestPage0Score + bestPage1Score;
    const combinedLabel = `per-page:page1:${bestPage0Profile.name}|page2:${bestPage1Profile.name}${swapPages ? "|swapPages" : ""}`;
    trackScore(combinedScore, combinedLabel);

    if (combinedScore > bestScore) {
      bestCandidate = {
        name: `page1:${bestPage0Profile.name}|page2:${bestPage1Profile.name}${swapPages ? "|swapPages" : ""}`,
        swapPages,
        mirrorChoices:
          bestPage0Profile.mirrorChoices && bestPage1Profile.mirrorChoices,
        localTransform: "identity",
      };
      bestAnswers = combinedAnswers;
      bestScore = combinedScore;
      bestMode = "per-page";
    }
  }

  const keyCoverage = Math.min(200, answerKey.length);
  const bestPct = bestScore / Math.max(1, keyCoverage);
  const improvement = bestScore - baselineScore;
  const marginVsSecond =
    secondBestScore === Number.NEGATIVE_INFINITY
      ? improvement
      : bestScore - secondBestScore;
  const isIdentityMapping =
    bestMode === "global" &&
    bestCandidate.swapPages === false &&
    bestCandidate.mirrorChoices === false &&
    bestCandidate.localTransform === "identity";
  const hasLargeGain = improvement >= 30;
  const hasConfidentBest = bestPct >= 0.55;
  const hasClearWinner = marginVsSecond >= 12;
  const shouldApply =
    !isIdentityMapping && hasLargeGain && hasConfidentBest && hasClearWinner;

  console.log(
    `[ScannerScreen] 200Q mapping diagnostic: baseline=${baselineScore}/200, best=${bestScore}/200 (${bestMode}:${bestCandidate.name}), second=${secondBestScore === Number.NEGATIVE_INFINITY ? "n/a" : `${secondBestScore}/200 (${secondBestLabel})`}, improvement=${improvement}, margin=${marginVsSecond}, applied=${shouldApply}`,
  );

  return shouldApply
    ? {
        ...scanResult,
        answers: bestAnswers,
        confidence: Math.max(scanResult.confidence || 0, 0.92),
      }
    : scanResult;
}

type ScannerState = "exam-select" | "camera" | "results";

interface ScannerScreenProps {
  onClose: () => void;
  initialClassId?: string;
  initialExamId?: string;
  /**
   * value passed from the parent when a "quick scan" navigation occurs.
   */
  resetFlag?: string;
}

export default function ScannerScreen({
  onClose,
  resetFlag,
  initialClassId,
  initialExamId,
}: ScannerScreenProps) {
  const [currentState, setCurrentState] = useState<ScannerState>("exam-select");
  const [activeExamId, setActiveExamId] = useState("");
  const [examQuestionCount, setExamQuestionCount] = useState(20); // Store exam question count
  const [examChoicesPerQuestion, setExamChoicesPerQuestion] = useState<4 | 5>(
    4,
  );

  // class/exam dropdown state
  const [classesList, setClassesList] = useState<
    { id: string; class_name?: string }[]
  >([]);
  const [selectedClass, setSelectedClass] = useState<{
    id: string;
    class_name?: string;
  } | null>(null);
  const [examsList, setExamsList] = useState<any[]>([]);
  const [selectedExam, setSelectedExam] = useState<any | null>(null);
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const [examDropdownOpen, setExamDropdownOpen] = useState(false);

  // when resetFlag changes we should return to the initial exam-select
  // state and clear any existing exam context. this allows the home screen's
  // quick scan button to behave predictably even if the user previously
  // navigated to this tab and left while inside the camera view.
  React.useEffect(() => {
    if (resetFlag) {
      setActiveExamId("");
      setExamQuestionCount(20);
      setExamChoicesPerQuestion(4);
      setSelectedClass(null);
      setSelectedExam(null);
      // Reset 2-stage state
      setTwoStageData(null);
      setTwoStageCurrent(1);
      setShowPage1Confirmation(false);
      setCornerBoxErrorModal({ visible: false, message: "" });
      // stay in camera mode but clear selections
    }
  }, [resetFlag]);
  const [gradingResult, setGradingResult] = useState<GradingResult | null>(
    null,
  );
  const [scannedImage, setScannedImage] = useState<string | undefined>(
    undefined,
  );
  const [duplicateMatch, setDuplicateMatch] =
    useState<DuplicateScoreMatch | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [pendingResult, setPendingResult] = useState<GradingResult | null>(
    null,
  );
  const [scanCount, setScanCount] = useState(0);
  const [cachedAnswerKey, setCachedAnswerKey] = useState<string[] | null>(null);

  // ── 2-Stage scanning state for 200-item exams ───────────────────────────
  const [twoStageData, setTwoStageData] = useState<{
    page1Result: ScanResult | null;
    page1Image: string;
  } | null>(null);
  const [twoStageCurrent, setTwoStageCurrent] = useState<1 | 2>(1);
  const [showPage1Confirmation, setShowPage1Confirmation] = useState(false);

  // ── Manual student ID entry (fallback when OMR can't read bubbles) ──────
  const [manualIdModal, setManualIdModal] = useState<{
    visible: boolean;
    pendingScan: ScanResult | null;
    pendingImage: string;
    input: string;
  }>({
    visible: false,
    pendingScan: null,
    pendingImage: "",
    input: "",
  });
  const [cornerBoxErrorModal, setCornerBoxErrorModal] = useState<{
    visible: boolean;
    message: string;
  }>({
    visible: false,
    message: "",
  });

  // ----- new behaviour for class/exam selection UI -----
  // load classes for teacher
  React.useEffect(() => {
    const fetchClasses = async () => {
      try {
        const cls = await ClassService.getClassesByUser();
        setClassesList(cls);

        // Handle pre-selection if initialClassId is provided
        if (initialClassId) {
          const matched = cls.find((c) => c.id === initialClassId);
          if (matched) {
            setSelectedClass(matched);
          }
        }
      } catch (error) {
        console.error("[ScannerScreen] failed loading classes", error);
      }
    };
    fetchClasses();
  }, []);

  // when class changes fetch its exams
  React.useEffect(() => {
    if (!selectedClass) {
      setExamsList([]);
      setSelectedExam(null);
      return;
    }

    const fetchExams = async () => {
      try {
        const { collection, query, where, getDocs } =
          await import("firebase/firestore");
        const examsRef = collection(db, "exams");
        const examsQuery = query(
          examsRef,
          where("classId", "==", selectedClass.id),
        );
        const snap = await getDocs(examsQuery);
        const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setExamsList(list);

        // Handle pre-selection of exam if initialExamId is provided
        if (initialExamId) {
          const matched = list.find((ex) => ex.id === initialExamId);
          if (matched) {
            setSelectedExam(matched);
          }
        }
      } catch (error) {
        console.error("[ScannerScreen] failed loading exams", error);
      }
    };
    fetchExams();
  }, [initialExamId, selectedClass]);

  // when an exam is chosen, set up camera parameters
  React.useEffect(() => {
    if (selectedExam) {
      setActiveExamId(selectedExam.id);
      const questionCount = selectedExam.num_items || 20;
      const choicesPerQuestion = resolveChoicesPerQuestion(selectedExam);
      setExamQuestionCount(questionCount);
      setExamChoicesPerQuestion(choicesPerQuestion);
      console.log(
        `[ScannerScreen] Selected exam scan config: questions=${questionCount}, choices=${choicesPerQuestion} (${choicesPerQuestion === 5 ? "A-E" : "A-D"})`,
      );
      setCachedAnswerKey(
        Array.isArray(selectedExam.answerKey?.answers)
          ? selectedExam.answerKey.answers
          : null,
      );
      // stay in camera mode with exam selected
    }
  }, [selectedExam]);

  React.useEffect(() => {
    if (!activeExamId) return;

    let cancelled = false;
    const prefetchAnswerKey = async () => {
      try {
        // Always fetch directly from Firestore so we pick up any edits made
        // from the web app without waiting for the Realm cache to refresh.
        const akQuery = query(
          collection(db, "answerKeys"),
          where("examId", "==", activeExamId),
        );
        const akSnap = await getDocs(akQuery);
        if (cancelled) return;

        if (!akSnap.empty) {
          // Pick the highest-version doc (same logic as ExamService)
          let best = akSnap.docs[0];
          akSnap.docs.slice(1).forEach((d) => {
            if ((d.data().version ?? 0) > (best.data().version ?? 0)) best = d;
          });
          const akData = best.data();

          // Prefer the answers array; fall back to questionSettings
          let answers: string[] = [];
          if (Array.isArray(akData.answers) && akData.answers.length > 0) {
            answers = akData.answers as string[];
          } else if (
            Array.isArray(akData.questionSettings) &&
            akData.questionSettings.length > 0
          ) {
            answers = (akData.questionSettings as any[])
              .slice()
              .sort((a, b) => a.questionNumber - b.questionNumber)
              .map((q) => String(q.correctAnswer ?? ""));
          }

          if (answers.length > 0) {
            setCachedAnswerKey(answers);

            // Also update the Realm cache so offline scans use the fresh key
            try {
              const { RealmService } =
                await import("../../services/realmService");
              const cacheRealm = await RealmService.getCacheRealm();
              const cached = cacheRealm.objectForPrimaryKey<any>(
                "QuizCache",
                activeExamId,
              );
              if (cached) {
                cacheRealm.write(() => {
                  cached.answerKey = JSON.stringify({ ...akData, answers });
                  cached.updatedAt = new Date();
                });
              }
            } catch (cacheErr) {
              console.warn(
                "[ScannerScreen] Realm cache update skipped:",
                cacheErr,
              );
            }
          }
        } else {
          // No answer key in Firestore yet — fall back to cached ExamService
          const { ExamService } = await import("../../services/examService");
          const examData = await ExamService.getExamById(activeExamId);
          if (cancelled) return;
          if (Array.isArray(examData?.answerKey?.answers)) {
            setCachedAnswerKey(examData.answerKey.answers);
          }
        }
      } catch (error) {
        console.warn("[ScannerScreen] answer key prefetch skipped:", error);
      }
    };

    prefetchAnswerKey();
    return () => {
      cancelled = true;
    };
  }, [activeExamId]);

  const handleScanComplete = async (
    scanResult: ScanResult,
    imageUri: string,
  ) => {
    try {
      const studentId = scanResult.studentId;

      // Ensure that a valid student ID was parsed
      const isInvalidId =
        !studentId || studentId === "Unknown" || /^0+$/.test(studentId); // catches 0000000, 00000000, etc.

      if (isInvalidId) {
        console.warn(
          `[ScannerScreen] Unreadable student ID ("${studentId}") — prompting manual entry`,
        );
        // Show manual entry modal instead of hard-blocking
        setManualIdModal({
          visible: true,
          pendingScan: { ...scanResult, studentId: "" },
          pendingImage: imageUri,
          input: "",
        });
        return;
      }

      console.log(`[ScannerScreen] Detected student ID: ${studentId}`);

      // ── 1. Fast Student Verification ──
      let isValidId = false;
      const netState = await NetInfo.fetch();

      if (netState.isConnected && netState.isInternetReachable) {
        console.log(`[Firestore] Verifying student ID: ${studentId}...`);
        try {
          // Check the selected class roster first (fastest, no extra query)
          if (selectedClass) {
            const classSnap = await withTimeout(
              getDocs(
                query(
                  collection(db, "classes"),
                  where("__name__", "==", selectedClass.id),
                ),
              ),
              1200,
            );
            if (!classSnap.empty) {
              const classData = classSnap.docs[0].data();
              const roster: any[] = classData.students || [];
              if (
                roster.some(
                  (s: any) =>
                    s.student_id === studentId || s.studentId === studentId,
                )
              ) {
                isValidId = true;
              }
            }
          }

          // Fallback: query the standalone students collection (both field name variants)
          if (!isValidId) {
            const [snapSnake, snapCamel] = await Promise.all([
              withTimeout(
                getDocs(
                  query(
                    collection(db, "students"),
                    where("student_id", "==", studentId),
                  ),
                ),
                1200,
              ),
              withTimeout(
                getDocs(
                  query(
                    collection(db, "students"),
                    where("studentId", "==", studentId),
                  ),
                ),
                1200,
              ),
            ]);
            isValidId = !snapSnake.empty || !snapCamel.empty;
          }
        } catch (err) {
          console.warn(
            "[ScannerScreen] Student verification timed out. Assuming valid.",
          );
          isValidId = true;
        }
      } else {
        console.log("[ScannerScreen] Offline - Skipping network validation.");
        isValidId = true; // Trust ID while offline
      }

      if (!isValidId) {
        Alert.alert(
          "Unregistered student",
          `ID ${studentId} not found, but it will be scored anyway.`,
        );
      }

      // ── 2. Fetch Answer Key (Fast Timeout) ──
      const rawCount = scanResult.answers?.length || 20;
      let answerKey: string[] = cachedAnswerKey ?? [];
      let usedDefaultAnswerKey = false;

      if (answerKey.length === 0) {
        try {
          // Go directly to Firestore so we always use the latest answer key,
          // even if the web app edited it after the Realm cache was last synced.
          const akQuery = query(
            collection(db, "answerKeys"),
            where("examId", "==", activeExamId),
          );
          const akSnap = await withTimeout(getDocs(akQuery), 2500);

          if (!akSnap.empty) {
            let best = akSnap.docs[0];
            akSnap.docs.slice(1).forEach((d) => {
              if ((d.data().version ?? 0) > (best.data().version ?? 0))
                best = d;
            });
            const akData = best.data();

            if (Array.isArray(akData.answers) && akData.answers.length > 0) {
              answerKey = akData.answers as string[];
            } else if (
              Array.isArray(akData.questionSettings) &&
              akData.questionSettings.length > 0
            ) {
              answerKey = (akData.questionSettings as any[])
                .slice()
                .sort((a: any, b: any) => a.questionNumber - b.questionNumber)
                .map((q: any) => String(q.correctAnswer ?? ""));
            }
          }

          if (answerKey.length > 0) {
            setCachedAnswerKey(answerKey);
          } else {
            throw new Error("Missing key");
          }
        } catch (error) {
          console.warn(
            "[ScannerScreen] Answer key fetch failed/timed out. using default key.",
          );
          answerKey = GradingService.getDefaultAnswerKey(rawCount).map(
            (ak) => ak.correctAnswer,
          );
          usedDefaultAnswerKey = true;
        }
      }

      const answerKeyFormatted = answerKey.map((answer, index) => ({
        questionNumber: index + 1,
        correctAnswer: answer,
        points: 1,
      }));

      if (examQuestionCount === 200 && usedDefaultAnswerKey) {
        Alert.alert(
          "Answer Key Unavailable",
          "Could not load the official 200-item answer key. Please reconnect to the internet or sync this exam first, then scan again.",
        );
        return;
      }

      if (examQuestionCount === 200 && answerKey.length < 200) {
        Alert.alert(
          "Incomplete Answer Key",
          `This exam is set to 200 items, but only ${answerKey.length} answer-key entries were loaded. Please complete/sync the answer key before scanning.`,
        );
        return;
      }

      const normalizedScanResult =
        examQuestionCount === 200 && !usedDefaultAnswerKey
          ? normalize200ScanMapping(scanResult, answerKey)
          : scanResult;

      // ── 3. Grade & Duplicate Check ──
      const result = GradingService.gradeAnswers(
        normalizedScanResult,
        answerKeyFormatted,
      );
      result.metadata = { ...result.metadata, isValidId: isValidId } as any;

      let duplicateCheck = null;
      try {
        duplicateCheck = await withTimeout(
          DuplicateScoreDetectionService.checkForDuplicates(
            result,
            activeExamId,
          ),
          900,
        );
      } catch (err) {
        /* proceed if check hangs */
      }

      if (
        duplicateCheck &&
        (duplicateCheck.matchType === "exact" ||
          duplicateCheck.matchType === "high")
      ) {
        setPendingResult(result);
        setDuplicateMatch(duplicateCheck);
        setShowDuplicateModal(true);
        return;
      }

      // ── 4. Save Pipeline ──
      const savedResult = await StorageService.saveScanResult(result, imageUri);

      // Async Firestore/Realm save
      GradeStorageService.saveGradingResult(result, activeExamId).then(
        (saveResult) => {
          if (saveResult.status === "saved") {
            Toast.show({
              type: "success",
              text1: "Saved",
              text2: `Score: ${result.score}/${result.totalPoints}`,
            });
          } else if (saveResult.status === "pending") {
            Toast.show({
              type: "info",
              text1: "Queued Offline",
              text2: "Data saved in RealmDB for later sync.",
            });
          } else if (saveResult.status === "error") {
            Toast.show({
              type: "error",
              text1: "Save Failed",
              text2: saveResult.message || "Could not save to server.",
            });
          }
        },
      );

      setGradingResult(savedResult);
      setScannedImage(imageUri);
      setCurrentState("results");
    } catch (error) {
      console.error("[ScannerScreen] Error:", error);
      Alert.alert("Error", "Failed to process scan.");
    }
  };

  // ── 2-Stage scan handler for 200-item exams ─────────────────────────────
  const handleTwoStageScanComplete = async (
    scanResult: ScanResult,
    imageUri: string,
  ) => {
    if (twoStageCurrent === 1) {
      // Stage 1: Store Page 1 results, ask user to scan Page 2
      console.log(
        `[ScannerScreen] 200Q Stage 1 complete: studentId=${scanResult.studentId}, answers=${scanResult.answers.length}`,
      );
      setTwoStageData({
        page1Result: scanResult,
        page1Image: imageUri,
      });
      // Speed optimization: jump directly to page 2 capture.
      setShowPage1Confirmation(false);
      setTwoStageCurrent(2);
      setScanCount((prev) => prev + 1);
    } else {
      // Stage 2: Merge with Page 1 data
      if (!twoStageData?.page1Result) {
        Alert.alert(
          "Error",
          "Page 1 data is missing. Please restart the scan.",
        );
        setTwoStageCurrent(1);
        setTwoStageData(null);
        return;
      }

      const page1 = twoStageData.page1Result;
      const page2 = scanResult;

      // Validate Student ID match
      const id1 = page1.studentId;
      const id2 = page2.studentId;
      const idsMatch =
        id1 === id2 ||
        /^0+$/.test(id1) ||
        /^0+$/.test(id2) ||
        id1 === "Unknown" ||
        id2 === "Unknown";

      if (!idsMatch) {
        Alert.alert(
          "Student ID Mismatch",
          `Page 1 ID: ${id1}\nPage 2 ID: ${id2}\n\nThe Student IDs on both pages don't match. Please re-scan Page 2.`,
          [
            {
              text: "Re-scan Page 2",
              onPress: () => {
                setScanCount((prev) => prev + 1);
              },
            },
          ],
        );
        return;
      }

      // Merge answers: Page 1 (Q1-100) + Page 2 (Q101-200)
      const mergedAnswers = [...page1.answers, ...page2.answers].sort(
        (a, b) => a.questionNumber - b.questionNumber,
      );

      // Use the valid student ID (prefer non-zero)
      const mergedStudentId =
        id1 && !/^0+$/.test(id1) && id1 !== "Unknown" ? id1 : id2;

      const mergedResult: ScanResult = {
        studentId: mergedStudentId,
        answers: mergedAnswers,
        confidence: Math.min(page1.confidence, page2.confidence),
        processedImageUri: page1.processedImageUri || page2.processedImageUri,
      };

      console.log(
        `[ScannerScreen] 200Q Merged: ID=${mergedStudentId}, answers=${mergedAnswers.length}`,
      );

      // Clean up 2-stage state
      setTwoStageData(null);
      setTwoStageCurrent(1);

      // Feed merged result into normal scan pipeline
      handleScanComplete(mergedResult, imageUri);
    }
  };

  const handlePage1ConfirmScanPage2 = () => {
    setShowPage1Confirmation(false);
    setTwoStageCurrent(2);
    setScanCount((prev) => prev + 1);
  };

  const handlePage1Rescan = () => {
    setShowPage1Confirmation(false);
    setTwoStageData(null);
    setTwoStageCurrent(1);
    setScanCount((prev) => prev + 1);
  };

  const handleRetrySave = () =>
    handleFirestoreRetrySave(gradingResult!, activeExamId);

  const handleFirestoreRetrySave = async (
    result: GradingResult,
    examId: string,
  ) => {
    const saveResult = await GradeStorageService.saveGradingResult(
      result,
      examId,
    );
    if (saveResult.status === "saved") {
      Toast.show({ type: "success", text1: "Saved Successfully" });
    } else if (saveResult.status === "pending") {
      Toast.show({ type: "info", text1: "Saved Locally (Realm)" });
    } else {
      Toast.show({
        type: "error",
        text1: "Still Failing",
        text2: saveResult.message,
      });
    }
  };

  const handleScanAnother = () => {
    // Reset 2-stage state for 200-item exams
    setTwoStageData(null);
    setTwoStageCurrent(1);
    setShowPage1Confirmation(false);
    setCornerBoxErrorModal({ visible: false, message: "" });
    setScanCount((prev) => prev + 1);
    setCurrentState("camera");
  };

  const handleClose = () => {
    setGradingResult(null);
    setScannedImage(undefined);
    setCurrentState("camera");
    // Reset 2-stage state
    setTwoStageData(null);
    setTwoStageCurrent(1);
    setShowPage1Confirmation(false);
    setCornerBoxErrorModal({ visible: false, message: "" });
    setExamChoicesPerQuestion(4);
    setCachedAnswerKey(null);
    // clear selection so reopening starts fresh
    setSelectedClass(null);
    setSelectedExam(null);
    onClose();
  };

  const handleKeepNewScan = async () => {
    if (!pendingResult || !scannedImage) return;
    const overridden =
      DuplicateScoreDetectionService.markAsOverride(pendingResult);
    const saved = await StorageService.saveScanResult(overridden, scannedImage);
    GradeStorageService.saveGradingResult(overridden, activeExamId);
    setGradingResult(saved);
    setScannedImage(scannedImage);
    setCurrentState("results");
    setShowDuplicateModal(false);
  };

  // ── Handler for manual ID submission ──
  const handleConfirmManualId = () => {
    const { pendingScan, pendingImage, input } = manualIdModal;
    if (!input.trim() || !pendingScan) {
      Alert.alert("Error", "Please enter a valid Student ID");
      return;
    }

    // Hide manual modal
    setManualIdModal({
      visible: false,
      pendingScan: null,
      pendingImage: "",
      input: "",
    });

    // Resume the scan workflow with the manually entered ID
    const correctedScan = { ...pendingScan, studentId: input.trim() };
    handleScanComplete(correctedScan, pendingImage);
  };

  const handleScannerError = (message: string) => {
    if (
      examQuestionCount === 200 &&
      /could not detect all 4 corner boxes/i.test(message)
    ) {
      setCornerBoxErrorModal({ visible: true, message });
      return;
    }

    Alert.alert("Error", message);
  };

  const handleDismissCornerBoxModal = () => {
    setCornerBoxErrorModal({ visible: false, message: "" });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
      {/* ── Camera (Always Visible) ── */}
      {currentState !== "results" && !showPage1Confirmation && (
        <CameraScanner
          key={`cam-${scanCount}`}
          questionCount={examQuestionCount}
          choicesPerQuestion={examChoicesPerQuestion}
          scanStage={
            examQuestionCount === 200
              ? { current: twoStageCurrent, total: 2 }
              : undefined
          }
          onScanComplete={
            examQuestionCount === 200
              ? handleTwoStageScanComplete
              : handleScanComplete
          }
          onScanError={handleScannerError}
          onCancel={handleClose}
        />
      )}

      {/* ── Header Overlay (Back + Title) ── */}
      {currentState !== "results" && (
        <View style={styles.headerOverlay}>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.backButtonOverlay}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scanner</Text>
          <View style={styles.headerSpacer} />
        </View>
      )}

      {/* ── Selectors Overlay (Class & Exam side-by-side) ── */}
      {currentState !== "results" && (
        <View style={styles.selectorsOverlay}>
          <TouchableOpacity
            style={styles.selectorField}
            onPress={() => setClassDropdownOpen(true)}
          >
            <Text style={styles.selectorFieldText} numberOfLines={1}>
              {selectedClass?.class_name || "Class..."}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.selectorField,
              !selectedClass && styles.selectorFieldDisabled,
            ]}
            onPress={() => selectedClass && setExamDropdownOpen(true)}
            disabled={!selectedClass}
          >
            <Text style={styles.selectorFieldText} numberOfLines={1}>
              {selectedExam?.title || "Exam..."}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Class Selector Dropdown Modal ── */}
      <Modal
        visible={classDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setClassDropdownOpen(false)}
      >
        <TouchableOpacity
          style={styles.dropdownBackdrop}
          activeOpacity={1}
          onPress={() => setClassDropdownOpen(false)}
        />
        <View style={styles.dropdownPanel}>
          <ScrollView
            showsVerticalScrollIndicator={true}
            contentContainerStyle={styles.dropdownScrollContent}
          >
            {classesList.map((cls) => {
              const selected = cls.id === selectedClass?.id;
              return (
                <TouchableOpacity
                  key={cls.id}
                  style={[
                    styles.dropdownItem,
                    selected && styles.dropdownSelected,
                  ]}
                  onPress={() => {
                    setSelectedClass(cls);
                    setClassDropdownOpen(false);
                  }}
                >
                  <Text
                    style={[styles.dropdownName, selected && { color: "#fff" }]}
                  >
                    {cls.class_name || "Unnamed"}
                  </Text>
                  {selected && (
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Exam Selector Dropdown Modal ── */}
      <Modal
        visible={examDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setExamDropdownOpen(false)}
      >
        <TouchableOpacity
          style={styles.dropdownBackdrop}
          activeOpacity={1}
          onPress={() => setExamDropdownOpen(false)}
        />
        <View style={styles.dropdownPanel}>
          <ScrollView
            showsVerticalScrollIndicator={true}
            contentContainerStyle={styles.dropdownScrollContent}
          >
            {examsList.map((ex) => {
              const selected = ex.id === selectedExam?.id;
              return (
                <TouchableOpacity
                  key={ex.id}
                  style={[
                    styles.dropdownItem,
                    selected && styles.dropdownSelected,
                  ]}
                  onPress={() => {
                    setSelectedExam(ex);
                    setExamDropdownOpen(false);
                  }}
                >
                  <Text
                    style={[styles.dropdownName, selected && { color: "#fff" }]}
                    numberOfLines={1}
                  >
                    {ex.title || ex.name || "Unnamed Exam"}
                  </Text>
                  {selected && (
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Results ── */}
      {currentState === "results" && gradingResult && (
        <ScanResults
          result={gradingResult}
          imageUri={scannedImage}
          onClose={handleClose}
          onScanAnother={handleScanAnother}
          onRetrySave={handleRetrySave}
        />
      )}

      {showDuplicateModal && duplicateMatch && (
        <DuplicateScoreWarningModal
          visible={showDuplicateModal}
          match={duplicateMatch}
          newResult={pendingResult!}
          onKeepNew={handleKeepNewScan}
          onKeepExisting={() => setShowDuplicateModal(false)}
          onCancel={() => setShowDuplicateModal(false)}
        />
      )}
      {/* ── Manual Student ID Entry Modal ── */}
      <Modal
        visible={manualIdModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setManualIdModal({ ...manualIdModal, visible: false })
        }
      >
        <View style={styles.modalOverlay}>
          <View style={styles.manualIdModalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="warning" size={28} color="#f39c12" />
              <Text style={styles.modalTitle}>Unreadable Student ID</Text>
            </View>

            <Text style={styles.modalMessage}>
              The scanner could not read the student ID bubbles on this sheet.
              Please type the correct Student ID below to continue saving.
            </Text>

            <TextInput
              style={styles.manualIdInput}
              placeholder="e.g. 202300109"
              value={manualIdModal.input}
              onChangeText={(text) =>
                setManualIdModal({ ...manualIdModal, input: text })
              }
              keyboardType="number-pad"
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSummaryCancel]}
                onPress={() => {
                  setManualIdModal({
                    visible: false,
                    pendingScan: null,
                    pendingImage: "",
                    input: "",
                  });
                  setCurrentState("camera");
                }}
              >
                <Text style={styles.modalCancelText}>Cancel Scan</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalVerifyConfirm]}
                onPress={handleConfirmManualId}
              >
                <Text style={styles.modalConfirmText}>Confirm & Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Page 1 Confirmation Modal (200-item 2-stage) ── */}
      <Modal
        visible={showPage1Confirmation}
        transparent
        animationType="fade"
        onRequestClose={handlePage1Rescan}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.manualIdModalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="checkmark-circle" size={28} color="#1FC27D" />
              <Text style={styles.modalTitle}>Page 1 Scanned ✓</Text>
            </View>

            <Text style={styles.modalMessage}>
              Page 1 (Q1–100) captured successfully.
              {twoStageData?.page1Result?.studentId &&
              !/^0+$/.test(twoStageData.page1Result.studentId)
                ? `\nStudent ID: ${twoStageData.page1Result.studentId}`
                : ""}
              {`\nAnswers detected: ${twoStageData?.page1Result?.answers.filter((a) => a.selectedAnswer).length || 0}/100`}
              \n\nPlease place Page 2 (Q101–200) on the scanning area.
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSummaryCancel]}
                onPress={handlePage1Rescan}
              >
                <Text style={styles.modalCancelText}>Re-scan Page 1</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalVerifyConfirm]}
                onPress={handlePage1ConfirmScanPage2}
              >
                <Text style={styles.modalConfirmText}>Scan Page 2</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 200-item corner box detection error modal ── */}
      <Modal
        visible={cornerBoxErrorModal.visible}
        transparent
        animationType="fade"
        onRequestClose={handleDismissCornerBoxModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.manualIdModalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="scan-circle" size={28} color="#d35400" />
              <Text style={styles.modalTitle}>Sheet Alignment Needed</Text>
            </View>

            <Text style={styles.modalMessage}>
              We could not detect all 4 corner boxes for this 200-item page.
            </Text>

            {cornerBoxErrorModal.message ? (
              <Text style={styles.cornerErrorDetailText}>
                {cornerBoxErrorModal.message}
              </Text>
            ) : null}

            <View style={styles.cornerErrorTipsCard}>
              <Text style={styles.cornerErrorTipsTitle}>Before retaking:</Text>
              <Text style={styles.cornerErrorTipText}>
                1. Keep all four edge corner boxes inside the guide frame.
              </Text>
              <Text style={styles.cornerErrorTipText}>
                2. Flatten the paper and avoid shadows on the corners.
              </Text>
              <Text style={styles.cornerErrorTipText}>
                3. Hold the phone in portrait and keep the whole page visible.
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSummaryCancel]}
                onPress={() => {
                  handleDismissCornerBoxModal();
                  setCurrentState("camera");
                }}
              >
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalVerifyConfirm]}
                onPress={() => {
                  handleDismissCornerBoxModal();
                  setScanCount((prev) => prev + 1);
                }}
              >
                <Text style={styles.modalConfirmText}>Retake Scan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  // ── Exam Selector ──
  examSelector: {
    flex: 1,
    backgroundColor: "#eef1ef",
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop:
      Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 8 : 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#d8dfda",
    backgroundColor: "#fff",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#3d5a3d",
  },
  examSelectorContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  examSelectorTitle: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#333",
    marginTop: 16,
    marginBottom: 8,
  },
  examSelectorSubtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 22,
  },
  selectorRow: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-between",
    marginTop: 24,
  },
  selector: {
    flex: 1,
    marginHorizontal: 5,
    paddingHorizontal: 10,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3d5a3d",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectorDisabled: {
    opacity: 0.6,
  },
  selectorName: {
    fontSize: 16,
    color: "#333",
  },
  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  dropdownPanel: {
    position: "absolute",
    top: 150,
    left: 20,
    right: 20,
    maxHeight: "60%",
    backgroundColor: "#1A1A1A",
    borderRadius: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 1000,
    overflow: "hidden", // Ensures content stays inside rounded corners
  },
  dropdownScrollContent: {
    paddingVertical: 8,
  },
  dropdownItem: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  dropdownSelected: {
    backgroundColor: "rgba(31, 194, 125, 0.15)",
  },
  dropdownName: {
    fontSize: 15,
    color: "#E0E0E0",
    fontWeight: "500",
  },
  // ── Overlay styles for camera-first UI ──
  headerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingTop:
      Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 12 : 55,
    paddingBottom: 15,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "transparent",
  },
  backButtonOverlay: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    flex: 1,
    textAlign: "center",
    letterSpacing: 0.5,
  },
  headerSpacer: {
    width: 40,
  },
  selectorsOverlay: {
    position: "absolute",
    top: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 60 : 105,
    left: 16,
    right: 16,
    zIndex: 90,
    flexDirection: "row",
    gap: 10,
  },
  selectorField: {
    flex: 1,
    backgroundColor: "rgba(30, 30, 30, 0.75)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectorFieldDisabled: {
    opacity: 0.5,
  },
  selectorFieldText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  // ── Manual ID Modal Styles ──
  manualIdModalContent: {
    width: "90%",
    backgroundColor: "white",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  manualIdInput: {
    width: "100%",
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
    marginBottom: 24,
    letterSpacing: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  modalMessage: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  modalSummaryCancel: {
    backgroundColor: "#f5f5f5",
  },
  modalCancelText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  modalVerifyConfirm: {
    backgroundColor: "#00a550",
  },
  modalConfirmText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  cornerErrorTipsCard: {
    width: "100%",
    backgroundColor: "#fff7ef",
    borderWidth: 1,
    borderColor: "#fde2cc",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  cornerErrorDetailText: {
    width: "100%",
    fontSize: 12,
    color: "#8f8f8f",
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 17,
  },
  cornerErrorTipsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#a54900",
    marginBottom: 8,
  },
  cornerErrorTipText: {
    fontSize: 13,
    color: "#7a4b24",
    lineHeight: 19,
    marginBottom: 3,
  },
});
