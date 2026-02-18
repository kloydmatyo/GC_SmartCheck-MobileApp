import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const MOCK_QUIZZES = [
  { id: '1', name: 'Midterms Exam - BSIT - 3A', status: 'ACTIVE SESSION' },
  { id: '2', name: 'Midterms Exam - BSIT - 3B', status: 'ACTIVE SESSION' },
  { id: '3', name: 'Midterms Exam - BSIT - 3C', status: 'ACTIVE SESSION' },
  { id: '4', name: 'Quiz 2 - BSIT - 3B', status: 'ACTIVE SESSION' },
  { id: '5', name: 'Quiz 3 - BSIT - 3B', status: 'ACTIVE SESSION' },
];

type ScanState = 'idle' | 'scanning' | 'success' | 'failed';

const FRAME_W = SCREEN_W * 0.82;
const FRAME_H = SCREEN_H * 0.54;
const FRAME_TOP = SCREEN_H * 0.18;

export default function ScannerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [selectedQuiz, setSelectedQuiz] = useState(MOCK_QUIZZES[0]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [lastResult, setLastResult] = useState<{ studentId: string; score: string } | null>(null);

  useEffect(() => {
    if (params.from !== 'home') {
      router.replace('/(tabs)');
    }
  }, [params.from, router]);

  if (params.from !== 'home') {
    return null;
  }

  if (!permission) {
    return (
      <View style={styles.permWrap}>
        <ActivityIndicator size="large" color="#2D6A4F" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permWrap}>
        <TouchableOpacity style={styles.permBack} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.permTitle}>Camera permission is required.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Enable Camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  async function handleScan() {
    if (scanState === 'scanning') return;
    setScanState('scanning');
    setLastResult(null);

    try {
      await new Promise<void>((res) => setTimeout(res, 1000));
      const success = Math.random() > 0.2;
      if (success) {
        const score = Math.floor(Math.random() * 20) + 30;
        setLastResult({
          studentId: `2023${Math.floor(Math.random() * 90000) + 10000}`,
          score: `${score}/50`,
        });
        setScanState('success');
      } else {
        setScanState('failed');
      }
      setTimeout(() => setScanState('idle'), 2500);
    } catch {
      setScanState('failed');
      setTimeout(() => setScanState('idle'), 2500);
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#020913" translucent />

      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      <View style={styles.overlay} pointerEvents="box-none">
        <SafeAreaView style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color="#d8e6fa" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.selector} onPress={() => setDropdownOpen(true)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.selectorTop}>QUIZ</Text>
              <Text style={styles.selectorName} numberOfLines={1}>{selectedQuiz.name}</Text>
            </View>
            <Ionicons name="chevron-down" size={15} color="#9ec3ef" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="flash-outline" size={18} color="#d8e6fa" />
          </TouchableOpacity>
        </SafeAreaView>

        {scanState === 'success' && lastResult && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={24} color="#fff" />
            <View>
              <Text style={styles.bannerTitle}>SCAN SUCCESSFUL</Text>
              <Text style={styles.bannerSub}>ID: {lastResult.studentId}    Score: {lastResult.score}</Text>
            </View>
          </View>
        )}

        {scanState === 'failed' && (
          <View style={styles.failBanner}>
            <Ionicons name="close-circle" size={24} color="#fff" />
            <View>
              <Text style={styles.bannerTitle}>SCAN FAILED</Text>
              <Text style={styles.bannerSub}>PLEASE TRY AGAIN</Text>
            </View>
          </View>
        )}

        <View style={styles.frame} pointerEvents="none">
          <LinearGradient
            colors={['rgba(5,45,28,0.62)', 'rgba(12,72,44,0.48)', 'rgba(5,34,58,0.62)']}
            start={{ x: 0.1, y: 0.2 }}
            end={{ x: 1, y: 1 }}
            style={styles.frameTint}
          />
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />

          <View style={styles.hintWrap}>
            <Text style={styles.hintTitle}>Align Answer Sheet</Text>
            <Text style={styles.hintSub}>Ensure the black markers are{'\n'}within the frame</Text>
          </View>
        </View>

        <View style={styles.bottomPanel}>
          <TouchableOpacity
            style={[styles.shutterOuter, scanState === 'scanning' && { opacity: 0.65 }]}
            onPress={handleScan}
            disabled={scanState === 'scanning'}
          >
            {scanState === 'scanning' ? (
              <ActivityIndicator size="large" color="#2D6A4F" />
            ) : (
              <View style={styles.shutterInner} />
            )}
          </TouchableOpacity>

          <Text style={styles.brandText}>Gordon College Smart Checker</Text>
        </View>
      </View>

      <Modal visible={dropdownOpen} transparent animationType="fade" onRequestClose={() => setDropdownOpen(false)}>
        <TouchableOpacity style={styles.dropdownBackdrop} activeOpacity={1} onPress={() => setDropdownOpen(false)} />
        <View style={styles.dropdownPanel}>
          {MOCK_QUIZZES.map((q) => {
            const selected = q.id === selectedQuiz.id;
            return (
              <TouchableOpacity
                key={q.id}
                style={[styles.dropdownItem, selected && styles.dropdownSelected]}
                onPress={() => {
                  setSelectedQuiz(q);
                  setDropdownOpen(false);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dropdownName, selected && { color: '#fff' }]}>{q.name}</Text>
                  <Text style={[styles.dropdownStatus, selected && { color: 'rgba(255,255,255,0.75)' }]}>{q.status}</Text>
                </View>
                {selected && <Ionicons name="checkmark" size={16} color="#fff" />}
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  permWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  permBack: { position: 'absolute', top: 48, left: 14, padding: 8 },
  permTitle: { fontSize: 16, fontWeight: '700', color: '#24313d' },
  permBtn: { marginTop: 16, backgroundColor: '#2D6A4F', paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10 },
  permBtnText: { color: '#fff', fontWeight: '700' },

  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 32 : 0,
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: 'rgba(3,10,18,0.82)',
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f2137',
    borderWidth: 1,
    borderColor: '#1f467a',
  },
  selector: {
    flex: 1,
    marginHorizontal: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#0f2137',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1f467a',
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectorTop: { color: '#9fc1ec', fontSize: 8, fontWeight: '700', letterSpacing: 1 },
  selectorName: { color: '#e8f1fb', fontSize: 11, fontWeight: '700', marginTop: 1 },

  successBanner: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 84 : 74,
    left: 8,
    right: 8,
    zIndex: 20,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#39e286',
    backgroundColor: 'rgba(15,170,90,0.87)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  failBanner: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 84 : 74,
    left: 8,
    right: 8,
    zIndex: 20,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#ff4369',
    backgroundColor: 'rgba(178,15,45,0.90)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bannerTitle: { color: '#f6fff8', fontSize: 10, fontWeight: '800' },
  bannerSub: { color: '#f6fff8', fontSize: 11, fontWeight: '700' },

  frame: {
    position: 'absolute',
    top: FRAME_TOP,
    left: (SCREEN_W - FRAME_W) / 2,
    width: FRAME_W,
    height: FRAME_H,
    borderRadius: 6,
    overflow: 'hidden',
  },
  frameTint: { ...StyleSheet.absoluteFillObject },
  corner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: '#3a7fff',
    borderWidth: 0,
  },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  hintWrap: { position: 'absolute', left: 0, right: 0, bottom: 18, alignItems: 'center' },
  hintTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  hintSub: { color: 'rgba(255,255,255,0.62)', fontSize: 10, textAlign: 'center', marginTop: 4, lineHeight: 14 },

  bottomPanel: {
    backgroundColor: '#071a31',
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'android' ? 22 : 34,
    alignItems: 'center',
  },
  shutterOuter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#f7f7f7',
    borderWidth: 2,
    borderColor: '#848a92',
  },
  brandText: { marginTop: 10, color: 'rgba(255,255,255,0.35)', fontSize: 9 },

  dropdownBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  dropdownPanel: {
    position: 'absolute',
    top: 78,
    left: 30,
    right: 30,
    backgroundColor: '#0a1830',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f467a',
    overflow: 'hidden',
  },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  dropdownSelected: { backgroundColor: '#1a62d8' },
  dropdownName: { color: '#d9e8fb', fontSize: 11, fontWeight: '700' },
  dropdownStatus: { color: '#7f9fc4', fontSize: 9, fontWeight: '700', marginTop: 1 },
});
