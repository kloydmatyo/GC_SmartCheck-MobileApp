import {
  androidStatusBarHeight,
  horizontalPadding,
  isAndroid,
  rf,
  rp,
  rs,
} from '@/utils/responsive';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

import { COLORS, RADIUS } from '../../constants/theme';
import StatusModal from '@/components/common/StatusModal';
import { getSession } from '../../services/sessionService';

const TEMPLATES = [
  { key: 'standard20', label: '20 Questions', totalQuestions: 20 },
  { key: 'standard50', label: '50 Questions', totalQuestions: 50 },
  { key: 'standard100', label: '100 Questions', totalQuestions: 100 },
] as const;

type TemplateKey = (typeof TEMPLATES)[number]['key'];
const VERSIONS = ['A', 'B', 'C', 'D'] as const;
type Version = (typeof VERSIONS)[number];

const LOGO_URI = 'https://gordoncollege.edu.ph/wp-content/uploads/2022/09/cropped-GC-Logo.png';

function buildFallbackHtml(templateKey: TemplateKey, examName: string, section: string, version: Version): string {
  const total = TEMPLATES.find((t) => t.key === templateKey)?.totalQuestions ?? 50;
  const rows = Array.from({ length: total }, (_, i) => i + 1)
    .map(
      (q) =>
        `<div style="display:flex;align-items:center;gap:8px;font-size:10px;margin:2px 0;">` +
        `<span style="width:24px;text-align:right;">${q}.</span>` +
        `A ? B ? C ? D ? E ?</div>`
    )
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    body{font-family:Arial,sans-serif;margin:16px;color:#222}
    .row{display:flex;justify-content:space-between;align-items:center}
    .logo{height:42px}
    .title{font-size:13px;font-weight:700}
    .box{border:1px solid #333;border-radius:6px;padding:8px;margin-top:8px}
    .muted{font-size:10px;color:#555}
    .grid{display:grid;grid-template-columns:repeat(8,1fr);gap:4px;margin-top:8px}
    .bubble{border:1px solid #222;border-radius:50%;width:14px;height:14px;display:inline-block}
  </style></head><body>
  <div class="row">
    <img class="logo" src="${LOGO_URI}"/>
    <div class="title">GC SmartCheck OMR Answer Sheet</div>
  </div>
  <div class="box">
    <div><b>Exam:</b> ${examName || 'Untitled Exam'}</div>
    <div><b>Section:</b> ${section || 'N/A'} &nbsp;&nbsp; <b>Version:</b> ${version}</div>
    <div><b>Exam Code:</b> ${String(examName || 'GCSC').replace(/\s+/g, '-').toUpperCase()}-${version}</div>
    <div class="muted">Student ID Bubble Grid</div>
    <div class="grid">${Array.from({ length: 80 }).map(() => '<span class="bubble"></span>').join('')}</div>
  </div>
  <div class="box" style="margin-top:10px">
    <div class="muted">Questions</div>
    ${rows}
  </div>
  </body></html>`;
}

async function createPdfFromHtml(html: string, baseName: string): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 });
  const dest = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ''}${baseName}.pdf`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

async function fetchBackendPdf(input: {
  templateKey: TemplateKey;
  examName: string;
  section: string;
  version: Version;
}): Promise<string | null> {
  const baseUrl = process.env.EXPO_PUBLIC_EXAM_API_BASE_URL;
  if (!baseUrl) return null;

  const session = await getSession();
  if (!session?.token) {
    throw new Error('Missing API security token. Please sign in again.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${baseUrl}/exams/answer-sheet/pdf`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        examName: input.examName,
        section: input.section,
        version: input.version,
        templateKey: input.templateKey,
        optimizeForMobile: true,
        maxFileSizeKb: 1500,
        includeLogo: true,
      }),
      signal: controller.signal,
    });

    if (res.status === 401) throw new Error('Token expired. Please sign in again.');
    if (!res.ok) throw new Error('PDF generation failed from backend.');

    const data = (await res.json()) as { fileUrl?: string; pdfBase64?: string; fileName?: string };
    const fileName = data.fileName || `answer-sheet-${Date.now()}.pdf`;
    const dest = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ''}${fileName}`;

    if (data.fileUrl) {
      const downloaded = await FileSystem.downloadAsync(data.fileUrl, dest, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      return downloaded.uri;
    }

    if (data.pdfBase64) {
      await FileSystem.writeAsStringAsync(dest, data.pdfBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return dest;
    }

    throw new Error('Backend returned no PDF payload.');
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('PDF load timeout (>5s). Please retry.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export default function PrintAnswerSheetScreen() {
  const router = useRouter();
  const goToQuizzes = () => router.replace("/(tabs)/quizzes");

  const [templateKey, setTemplateKey] = useState<TemplateKey>('standard50');
  const [examName, setExamName] = useState('');
  const [section, setSection] = useState('');
  const [version, setVersion] = useState<Version>('A');
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [statusModal, setStatusModal] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  const selected = useMemo(() => TEMPLATES.find((t) => t.key === templateKey)!, [templateKey]);

  async function handleGeneratePreview() {
    setLoading(true);
    setErrorText(null);

    try {
      const backendUri = await fetchBackendPdf({ templateKey, examName, section, version });
      if (backendUri) {
        setPdfUri(backendUri);
        return;
      }

      const html = buildFallbackHtml(templateKey, examName, section, version);
      const local = await createPdfFromHtml(html, `omr-preview-${templateKey}-${version}-${Date.now()}`);
      setPdfUri(local);
    } catch (error: any) {
      setPdfUri(null);
      setErrorText(error?.message ?? 'Failed to load PDF preview.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    if (!pdfUri) return;
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, { mimeType: 'application/pdf', dialogTitle: 'Download / Share PDF' });
      } else {
        setStatusModal({
          visible: true,
          type: 'success',
          title: 'Saved',
          message: `PDF saved to:\n${pdfUri}`,
        });
      }
    } catch (error: any) {
      setStatusModal({
        visible: true,
        type: 'error',
        title: 'Download Failed',
        message: error?.message ?? 'Unable to download PDF.',
      });
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} translucent={false} />

      <View style={styles.header}>
        <TouchableOpacity onPress={goToQuizzes} style={styles.headerBack}>
          <Ionicons name="chevron-back" size={rs(24)} color={COLORS.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>OMR PDF Preview</Text>
        <View style={styles.headerBack} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: horizontalPadding }]}>
        <View style={styles.stepCard}>
          <Text style={styles.stepTitle}>Template</Text>
          <View style={styles.templateRow}>
            {TEMPLATES.map((t) => {
              const active = t.key === templateKey;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.templateBtn, active && styles.templateBtnActive]}
                  onPress={() => setTemplateKey(t.key)}
                >
                  <Text style={[styles.templateText, active && styles.templateTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>Exam Title</Text>
          <TextInput style={styles.input} value={examName} onChangeText={setExamName} placeholder="Exam title" />

          <Text style={styles.fieldLabel}>Section/Block</Text>
          <TextInput style={styles.input} value={section} onChangeText={setSection} placeholder="e.g., BSIT-3B" />

          <Text style={styles.fieldLabel}>Version</Text>
          <View style={styles.versionRow}>
            {VERSIONS.map((v) => {
              const active = version === v;
              return (
                <TouchableOpacity key={v} style={[styles.versionBtn, active && styles.versionBtnActive]} onPress={() => setVersion(v)}>
                  <Text style={[styles.versionText, active && styles.versionTextActive]}>{v}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.previewBtn} onPress={handleGeneratePreview} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={styles.previewBtnText}>Generate PDF Preview</Text>}
          </TouchableOpacity>

          <Text style={styles.infoText}>Expected load: within 5 seconds (normal connection).</Text>
          <Text style={styles.infoText}>Questions: {selected.totalQuestions} • Includes exam code + ID bubble grid + logo</Text>
        </View>

        {errorText ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>PDF Preview Failed</Text>
            <Text style={styles.errorText}>{errorText}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={handleGeneratePreview}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {pdfUri ? (
          <View style={styles.viewerCard}>
            <View style={styles.viewerHeader}>
              <Text style={styles.viewerTitle}>PDF Preview</Text>
              <TouchableOpacity style={styles.downloadBtn} onPress={handleDownload}>
                <Ionicons name="download-outline" size={rs(16)} color={COLORS.white} />
                <Text style={styles.downloadText}>Download</Text>
              </TouchableOpacity>
            </View>

            <WebView
              source={{ uri: pdfUri }}
              style={styles.webview}
              javaScriptEnabled
              domStorageEnabled
              scalesPageToFit
              setBuiltInZoomControls
              setDisplayZoomControls={false}
              originWhitelist={['*']}
            />
          </View>
        ) : null}

        <View style={{ height: rp(20) }} />
      </ScrollView>

      <StatusModal
        visible={statusModal.visible}
        type={statusModal.type}
        title={statusModal.title}
        message={statusModal.message}
        onClose={() =>
          setStatusModal({
            visible: false,
            type: 'info',
            title: '',
            message: '',
          })
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    paddingTop: isAndroid ? androidStatusBarHeight + rp(12) : rp(12),
    paddingBottom: rp(12),
    paddingHorizontal: horizontalPadding,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2 },
    }),
  },
  headerBack: { width: rs(28), alignItems: 'center' },
  headerTitle: { fontSize: rf(18), fontWeight: '700', color: COLORS.textDark },
  content: { paddingVertical: rp(14), gap: rp(12) },

  stepCard: {
    backgroundColor: COLORS.white,
    borderRadius: rs(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: rp(14),
  },
  stepTitle: { fontSize: rf(15), fontWeight: '700', color: COLORS.textDark, marginBottom: rp(8) },
  templateRow: { flexDirection: 'row', gap: rp(8), marginBottom: rp(10), flexWrap: 'wrap' },
  templateBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: rs(RADIUS.sm),
    paddingVertical: rp(7),
    paddingHorizontal: rp(10),
    backgroundColor: '#f3f7f4',
  },
  templateBtnActive: { backgroundColor: COLORS.primaryMid, borderColor: COLORS.primaryMid },
  templateText: { fontSize: rf(12), color: COLORS.textDark, fontWeight: '600' },
  templateTextActive: { color: COLORS.white },

  fieldLabel: { fontSize: rf(12), color: COLORS.textMid, marginBottom: rp(4), marginTop: rp(8) },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: rs(RADIUS.sm),
    backgroundColor: COLORS.white,
    fontSize: rf(13),
    color: COLORS.textDark,
    paddingHorizontal: rp(10),
    paddingVertical: rp(9),
  },
  versionRow: { flexDirection: 'row', gap: rp(8), marginTop: rp(4) },
  versionBtn: {
    width: rs(42),
    height: rs(34),
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: rs(RADIUS.sm),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f7f4',
  },
  versionBtnActive: { backgroundColor: COLORS.primaryMid, borderColor: COLORS.primaryMid },
  versionText: { color: COLORS.textDark, fontSize: rf(13), fontWeight: '700' },
  versionTextActive: { color: COLORS.white },

  previewBtn: {
    marginTop: rp(12),
    backgroundColor: COLORS.primaryMid,
    borderRadius: rs(RADIUS.sm),
    paddingVertical: rp(11),
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBtnText: { color: COLORS.white, fontSize: rf(13), fontWeight: '700' },
  infoText: { marginTop: rp(6), color: COLORS.textMuted, fontSize: rf(11) },

  errorBox: {
    backgroundColor: '#fff4f3',
    borderColor: '#ffd5d1',
    borderWidth: 1,
    borderRadius: rs(RADIUS.md),
    padding: rp(12),
  },
  errorTitle: { color: COLORS.danger, fontSize: rf(13), fontWeight: '700' },
  errorText: { color: COLORS.textMid, fontSize: rf(12), marginTop: rp(4) },
  retryBtn: {
    marginTop: rp(8),
    alignSelf: 'flex-start',
    borderRadius: rs(RADIUS.sm),
    backgroundColor: COLORS.primaryMid,
    paddingHorizontal: rp(10),
    paddingVertical: rp(7),
  },
  retryText: { color: COLORS.white, fontSize: rf(12), fontWeight: '700' },

  viewerCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: rs(RADIUS.md),
    overflow: 'hidden',
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f9f6',
    paddingHorizontal: rp(10),
    paddingVertical: rp(8),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  viewerTitle: { fontSize: rf(13), color: COLORS.textDark, fontWeight: '700' },
  downloadBtn: {
    backgroundColor: COLORS.primaryMid,
    borderRadius: rs(RADIUS.sm),
    paddingHorizontal: rp(10),
    paddingVertical: rp(6),
    flexDirection: 'row',
    alignItems: 'center',
    gap: rp(6),
  },
  downloadText: { color: COLORS.white, fontSize: rf(12), fontWeight: '700' },
  webview: { height: rp(480), backgroundColor: '#efefef' },
});

