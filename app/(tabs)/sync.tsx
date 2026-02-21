import {
  androidStatusBarHeight,
  horizontalPadding,
  isAndroid,
  rf,
  rp,
  rs,
} from '@/utils/responsive';
import StatusModal from '@/components/common/StatusModal';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { COLORS } from '../../constants/theme';

const PAGE_BG = '#e9eaec';
const CARD_BG = '#d8cfb8';
const PRIMARY = '#2D6A4F';

interface PendingExam {
  id: string;
  title: string;
  subject: string;
  date: string;
  papers: number | string;
  status: 'Active' | 'Completed' | 'Upcoming';
}

const INITIAL_PENDING: PendingExam[] = [
  {
    id: '1',
    title: 'Midterm - BSIT3B',
    subject: 'Systems Integration and Architecture 1 (LEC)',
    date: 'Feb 4, 2026',
    papers: 23,
    status: 'Active',
  },
  {
    id: '2',
    title: 'Quiz 3 - BSIT3B',
    subject: 'Systems Integration and Architecture 1 (LEC)',
    date: 'Feb 4, 2026',
    papers: 32,
    status: 'Completed',
  },
  {
    id: '3',
    title: 'Quiz 4 - BSIT3B',
    subject: 'Systems Integration and Architecture 1 (LEC)',
    date: 'Feb 6, 2026',
    papers: '--',
    status: 'Completed',
  },
];

const STATUS_COLOR: Record<PendingExam['status'], string> = {
  Active: '#9dcf9f',
  Completed: '#2d3b52',
  Upcoming: '#8ca3d0',
};

export default function SyncScreen() {
  const [view, setView] = useState<'data' | 'cloud'>('data');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exams, setExams] = useState<PendingExam[]>(INITIAL_PENDING);
  const [autoSync, setAutoSync] = useState(true);
  const [offlineModalVisible, setOfflineModalVisible] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setIsConnected(Boolean(s.isConnected)));
    return () => unsub();
  }, []);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  function handleSyncNow() {
    if (!isConnected && view === 'data') {
      setOfflineModalVisible(true);
      return;
    }

    if (isSyncing) return;

    setIsSyncing(true);
    setProgress(0);

    let done = 0;
    const total = exams.length;

    const interval = setInterval(() => {
      done += 1;
      const pct = Math.round((done / total) * 100);
      setProgress(pct);
      setExams((prev) => prev.map((e, i) => (i <= done - 1 ? { ...e, status: 'Completed' as const } : e)));

      if (done >= total) {
        clearInterval(interval);
        setTimeout(() => {
          setIsSyncing(false);
        }, 500);
      }
    }, 900);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} translucent={false} />

      {view === 'data' ? (
        <>
          <View style={styles.headerCenterOnly}>
            <TouchableOpacity style={styles.backCircle} onPress={() => setView('cloud')}>
              <Ionicons name="arrow-back" size={rs(18)} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Data Sync</Text>
            <View style={{ width: rs(32) }} />
          </View>

          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPadding }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heroBlock}>
              <View style={[styles.heroIconWrap, { backgroundColor: isConnected ? '#0ed36a' : '#ece2d7' }]}>
                <Ionicons
                  name={isConnected ? 'wifi' : 'wifi-outline'}
                  size={rs(42)}
                  color={isConnected ? '#1f2f45' : '#e67e22'}
                />
              </View>
              <Text style={styles.heroTitle}>{isConnected ? 'Connected' : 'Offline Mode'}</Text>
              <Text style={styles.heroSub}>
                You have <Text style={{ fontWeight: '800' }}>{isConnected ? 67 : 35} exam papers</Text> stored locally
                waiting to be uploaded to the {isConnected ? 'GCSC Server' : 'Gordon College server'}.
              </Text>
            </View>

            <View style={styles.progressCard}>
              <View style={styles.progressLabelRow}>
                <Text style={styles.progressTitle}>Total Upload Progress</Text>
                <Text style={styles.progressPct}>{progress}%</Text>
              </View>
              <View style={styles.track}>
                <Animated.View style={[styles.fill, { width: progressWidth }]} />
              </View>
              <View style={{ marginTop: rp(8), flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="sync-outline" size={rs(12)} color="#6d756d" />
                <Text style={styles.progressStateText}>
                  {isConnected ? (isSyncing ? 'Uploading...' : 'Ready to sync') : 'Waiting for internet connection...'}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Pending Uploads</Text>
            {exams.map((exam, idx) => (
              <SyncExamCard key={exam.id} exam={exam} lineColor={idx === 0 ? '#2f6db4' : '#1bbf62'} />
            ))}

            <View style={{ height: rp(90) }} />
          </ScrollView>
        </>
      ) : (
        <>
          <View style={styles.cloudHeader}>
            <TouchableOpacity onPress={() => setView('data')} style={styles.cloudBack}>
              <Ionicons name="arrow-back" size={rs(18)} color="#1f2f45" />
            </TouchableOpacity>
            <Text style={styles.cloudHeaderTitle}>Cloud Sync</Text>
            <View style={styles.cloudBack} />
          </View>

          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPadding }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.cloudCard}>
              <View style={styles.cloudTop}>
                <View style={styles.cloudIcon}><Ionicons name="cloud-outline" size={rs(18)} color="#54606a" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cloudTitle}>GC Cloud Server</Text>
                  <Text style={styles.cloudSub}>Last sync: Just now</Text>
                </View>
                <View style={styles.connectedPill}><Text style={styles.connectedPillText}>Connected</Text></View>
              </View>

              <View style={styles.cloudRow}>
                <Text style={styles.cloudLabel}>Auto-Sync</Text>
                <Switch value={autoSync} onValueChange={setAutoSync} trackColor={{ false: '#b9c6bb', true: PRIMARY }} />
              </View>

              <View style={styles.hr} />

              <View style={styles.cloudRow}>
                <Text style={styles.cloudLabel}>Storage Used</Text>
                <Text style={styles.cloudLabelStrong}>1.2 GB / 32 GB</Text>
              </View>
              <View style={styles.track}><View style={[styles.fill, { width: '24%' }]} /></View>
            </View>

            <Text style={styles.sectionTitle}>Sync Queue</Text>
            <QueueCard title="Midterm Scans - CS 101" sub="Uploading Exam Scores..." right="67%" />
            <QueueCard title="Quiz 3 Results - IT 202" sub="Queued for upload" right="Waiting" />

            <View style={{ marginTop: rp(12), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <TouchableOpacity><Text style={styles.clearHistory}>Clear History</Text></TouchableOpacity>
            </View>

            <View style={styles.activityCard}>
              <ActivityRow title="Synced Student Roster" sub="Today, 10:23 AM" state="Success" />
              <ActivityRow title="Sync Exams" sub="Yesterday, 4:15 PM" state="Success" />
              <ActivityRow title="Failed to Sync Classes" sub="Yesterday, 1:00 PM" state="Failed" />
            </View>

            <View style={{ height: rp(90) }} />
          </ScrollView>
        </>
      )}

      <View style={[styles.footer, { paddingHorizontal: horizontalPadding }]}> 
        <TouchableOpacity style={[styles.syncBtn, isSyncing && styles.syncBtnActive]} onPress={handleSyncNow}>
          <Ionicons name={isSyncing ? 'sync' : 'sync'} size={rs(18)} color="#fff" />
          <Text style={styles.syncBtnText}>{isSyncing ? 'Syncing' : 'Sync Now'}</Text>
        </TouchableOpacity>
      </View>

      <StatusModal
        visible={offlineModalVisible}
        type="info"
        title="Offline"
        message="Waiting for internet connection."
        onClose={() => setOfflineModalVisible(false)}
      />
    </SafeAreaView>
  );
}

function SyncExamCard({ exam, lineColor }: { exam: PendingExam; lineColor: string }) {
  return (
    <View style={styles.examCard}>
      <View style={styles.examIconWrap}>
        <Ionicons name="code-slash-outline" size={rs(18)} color="#4685e8" />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.examTopRow}>
          <Text style={styles.examTitle} numberOfLines={1}>{exam.title}</Text>
          <View style={[styles.examStatusPill, { backgroundColor: STATUS_COLOR[exam.status] }]}>
            <Text style={styles.examStatusText}>{exam.status}</Text>
          </View>
        </View>
        <Text style={styles.examSub} numberOfLines={1}>{exam.subject}</Text>
        <Text style={styles.examMeta}>
          <Ionicons name="calendar-outline" size={rs(11)} color="#70767d" /> {exam.date}   
          <Ionicons name="document-text-outline" size={rs(11)} color="#70767d" /> {exam.papers} Papers
        </Text>
      </View>
      <View style={[styles.examBottomLine, { backgroundColor: lineColor }]} />
    </View>
  );
}

function QueueCard({ title, sub, right }: { title: string; sub: string; right: string }) {
  return (
    <View style={styles.queueCard}>
      <View style={styles.queueIcon}><Ionicons name="cloud-upload-outline" size={rs(16)} color="#5f6872" /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.queueTitle}>{title}</Text>
        <Text style={styles.queueSub}>{sub}</Text>
      </View>
      <Text style={styles.queueRight}>{right}</Text>
    </View>
  );
}

function ActivityRow({ title, sub, state }: { title: string; sub: string; state: 'Success' | 'Failed' }) {
  return (
    <View style={styles.activityRow}>
      <View style={[styles.activityDot, { backgroundColor: state === 'Success' ? '#9fcb9d' : '#e8b0aa' }]}>
        <Ionicons name={state === 'Success' ? 'checkmark' : 'alert'} size={rs(12)} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.activityTitle}>{title}</Text>
        <Text style={styles.activitySub}>{sub}</Text>
      </View>
      <View style={[styles.activityPill, { backgroundColor: state === 'Success' ? '#a9d5a8' : '#e3b1ab' }]}>
        <Text style={styles.activityPillText}>{state}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAGE_BG },

  headerCenterOnly: {
    backgroundColor: PAGE_BG,
    paddingTop: isAndroid ? androidStatusBarHeight + rp(8) : rp(8),
    paddingBottom: rp(10),
    paddingHorizontal: horizontalPadding,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backCircle: {
    width: rs(30),
    height: rs(30),
    borderRadius: rs(15),
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: '#12212e', fontWeight: '800', fontSize: rf(24) },

  cloudHeader: {
    backgroundColor: COLORS.white,
    paddingTop: isAndroid ? androidStatusBarHeight + rp(8) : rp(8),
    paddingBottom: rp(10),
    paddingHorizontal: horizontalPadding,
    borderBottomWidth: 1,
    borderBottomColor: '#d7d7d7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cloudBack: { width: rs(34), alignItems: 'center' },
  cloudHeaderTitle: { color: '#12212e', fontWeight: '800', fontSize: rf(24) },

  scrollContent: { paddingTop: rp(8), paddingBottom: rp(20) },

  heroBlock: { alignItems: 'center', marginTop: rp(8), marginBottom: rp(12) },
  heroIconWrap: {
    width: rs(84),
    height: rs(84),
    borderRadius: rs(42),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: rp(12),
  },
  heroTitle: { color: PRIMARY, fontSize: rf(38), fontWeight: '800' },
  heroSub: {
    marginTop: rp(8),
    textAlign: 'center',
    color: '#32383f',
    fontSize: rf(14),
    lineHeight: rf(14) * 1.4,
  },

  progressCard: {
    backgroundColor: CARD_BG,
    borderRadius: rs(11),
    borderWidth: 1,
    borderColor: '#486449',
    padding: rp(12),
    marginBottom: rp(14),
  },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressTitle: { color: '#353b3f', fontSize: rf(16), fontWeight: '700' },
  progressPct: { color: '#157f77', fontSize: rf(16), fontWeight: '800' },
  track: {
    marginTop: rp(8),
    height: rp(7),
    borderRadius: 999,
    backgroundColor: '#323d52',
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: '#1f8f83' },
  progressStateText: { marginLeft: 5, color: '#6d756d', fontSize: rf(12) },

  sectionTitle: { color: PRIMARY, fontWeight: '800', fontSize: rf(18), marginBottom: rp(8) },

  examCard: {
    backgroundColor: CARD_BG,
    borderRadius: rs(11),
    borderWidth: 1,
    borderColor: '#606a75',
    padding: rp(10),
    flexDirection: 'row',
    marginBottom: rp(9),
    overflow: 'hidden',
  },
  examIconWrap: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(8),
    backgroundColor: '#c4beb1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: rp(10),
    marginTop: rp(2),
  },
  examTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  examTitle: { color: '#2f353a', fontWeight: '800', fontSize: rf(16), flex: 1, marginRight: rp(8) },
  examStatusPill: { borderRadius: rs(999), paddingHorizontal: rp(8), paddingVertical: rp(3) },
  examStatusText: { color: '#fff', fontSize: rf(10), fontWeight: '800' },
  examSub: { color: '#50575d', marginTop: rp(4), fontSize: rf(13) },
  examMeta: { color: '#687078', marginTop: rp(6), fontSize: rf(11) },
  examBottomLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: rp(3),
  },

  cloudCard: {
    backgroundColor: CARD_BG,
    borderRadius: rs(11),
    borderWidth: 1,
    borderColor: '#606a75',
    padding: rp(12),
    marginBottom: rp(14),
  },
  cloudTop: { flexDirection: 'row', alignItems: 'center' },
  cloudIcon: {
    width: rs(34),
    height: rs(34),
    borderRadius: rs(17),
    backgroundColor: '#c6c5bc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: rp(10),
  },
  cloudTitle: { color: '#27333d', fontWeight: '800', fontSize: rf(16) },
  cloudSub: { color: '#55606b', fontSize: rf(12), marginTop: 2 },
  connectedPill: { backgroundColor: '#9fd09e', borderRadius: rs(999), paddingHorizontal: rp(8), paddingVertical: rp(3) },
  connectedPillText: { color: '#edf5ee', fontWeight: '800', fontSize: rf(10) },
  cloudRow: { marginTop: rp(10), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cloudLabel: { color: '#2f363c', fontSize: rf(14), fontWeight: '600' },
  cloudLabelStrong: { color: '#2b3136', fontWeight: '800', fontSize: rf(14) },
  hr: { marginTop: rp(10), height: 1, backgroundColor: '#8f9398' },

  queueCard: {
    backgroundColor: CARD_BG,
    borderRadius: rs(10),
    borderWidth: 1,
    borderColor: '#606a75',
    padding: rp(10),
    marginBottom: rp(8),
    flexDirection: 'row',
    alignItems: 'center',
  },
  queueIcon: {
    width: rs(35),
    height: rs(35),
    borderRadius: rs(8),
    backgroundColor: '#c5beb2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: rp(10),
  },
  queueTitle: { color: '#2c3338', fontSize: rf(14), fontWeight: '800' },
  queueSub: { color: '#616a73', fontSize: rf(12), marginTop: 2 },
  queueRight: { color: '#3f5f4a', fontWeight: '800', fontSize: rf(12) },

  clearHistory: { color: '#406850', fontSize: rf(13), fontWeight: '700' },
  activityCard: {
    backgroundColor: CARD_BG,
    borderRadius: rs(10),
    borderWidth: 1,
    borderColor: '#606a75',
    overflow: 'hidden',
  },
  activityRow: { flexDirection: 'row', alignItems: 'center', padding: rp(12), borderBottomWidth: 1, borderBottomColor: '#b7b1a6' },
  activityDot: { width: rs(22), height: rs(22), borderRadius: rs(11), alignItems: 'center', justifyContent: 'center', marginRight: rp(10) },
  activityTitle: { color: '#2d3338', fontWeight: '800', fontSize: rf(14) },
  activitySub: { color: '#69707a', fontSize: rf(12), marginTop: 2 },
  activityPill: { borderRadius: rs(999), paddingHorizontal: rp(8), paddingVertical: rp(3) },
  activityPillText: { color: '#edf5ee', fontWeight: '800', fontSize: rf(10) },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: rp(10),
  },
  syncBtn: {
    height: rp(50),
    borderRadius: rs(11),
    backgroundColor: '#1f7a70',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  syncBtnActive: { backgroundColor: '#20a972' },
  syncBtnText: { color: '#fff', fontWeight: '800', fontSize: rf(17) },
});
