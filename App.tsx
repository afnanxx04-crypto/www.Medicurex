import React, { useState, useEffect, useRef } from 'react';
import { doc, getDocFromServer, collection, onSnapshot, query, orderBy, limit, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Patient, LabReport, MedicationSchedule, DosageRecord } from './types';
import PatientSetup from './components/PatientSetup';
import MedicalReports from './components/MedicalReports';
import DosageTracker from './components/DosageTracker';
import CurrentCondition from './components/CurrentCondition';
import PrintPDFReport from './components/PrintPDFReport';
import { Heart, Activity, User, LogOut, Radio, Loader2, Hospital, Bell, BellRing } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// CRITICAL CONSTRAINT: Test the connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'testStatus', 'connection'));
    console.log("Firebase connection established successfully.");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration; the client appears offline.");
    }
  }
}
testConnection();

export default function App() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [userPhone, setUserPhone] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'reports' | 'dosage' | 'summary'>('reports');
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Subcollections states
  const [reports, setReports] = useState<LabReport[]>([]);
  const [schedules, setSchedules] = useState<MedicationSchedule[]>([]);
  const [records, setRecords] = useState<DosageRecord[]>([]);

  // Push notifications & alarms states
  const [notificationPermission, setNotificationPermission] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [activeReminders, setActiveReminders] = useState<MedicationSchedule[]>([]);
  const [dismissedRemindersToday, setDismissedRemindersToday] = useState<string[]>([]);

  // 1. Initial State Auto-Load from Local Session
  useEffect(() => {
    const cachedPatientId = localStorage.getItem('paired_patient_id');
    const cachedUserPhone = localStorage.getItem('currentUserPhone');

    if (cachedPatientId && cachedUserPhone) {
      setUserPhone(cachedUserPhone);
      
      // Setup direct snapshot listener to Patient Profile
      const unsubscribePatient = onSnapshot(doc(db, 'patients', cachedPatientId), (snap) => {
        if (snap.exists()) {
          const pData = snap.data() as Patient;
          pData.id = snap.id;
          setPatient(pData);
        } else {
          // If deleted on Firestore, sign out
          handleSignOut();
        }
        setIsLoading(false);
      }, (err) => {
        console.error(err);
        setIsLoading(false);
      });

      return () => unsubscribePatient();
    } else {
      setIsLoading(false);
    }
  }, []);

  // 2. Real-time Subcollection Synced Listeners
  useEffect(() => {
    if (!patient?.id) return;

    // Queries to nested sub-collections
    const reportsQuery = query(collection(db, 'patients', patient.id, 'labReports'), orderBy('createdAt', 'desc'));
    const schedulesQuery = query(collection(db, 'patients', patient.id, 'medicationSchedules'), orderBy('time', 'asc'));
    const recordsQuery = query(collection(db, 'patients', patient.id, 'dosageRecords'), orderBy('markedAt', 'desc'));

    const unsubscribeReports = onSnapshot(reportsQuery, (snap) => {
      const parsed: LabReport[] = [];
      snap.forEach(d => {
        const data = d.data() as LabReport;
        data.id = d.id;
        parsed.push(data);
      });
      setReports(parsed);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `patients/${patient.id}/labReports`);
    });

    const unsubscribeSchedules = onSnapshot(schedulesQuery, (snap) => {
      const parsed: MedicationSchedule[] = [];
      snap.forEach(d => {
        const data = d.data() as MedicationSchedule;
        data.id = d.id;
        parsed.push(data);
      });
      setSchedules(parsed);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `patients/${patient.id}/medicationSchedules`);
    });

    const unsubscribeRecords = onSnapshot(recordsQuery, (snap) => {
      const parsed: DosageRecord[] = [];
      snap.forEach(d => {
        const data = d.data() as DosageRecord;
        data.id = d.id;
        parsed.push(data);
      });
      setRecords(parsed);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `patients/${patient.id}/dosageRecords`);
    });

    return () => {
      unsubscribeReports();
      unsubscribeSchedules();
      unsubscribeRecords();
    };
  }, [patient?.id]);

  const handlePatientLoaded = (loadedPatient: Patient, phoneIdent: string) => {
    setUserPhone(phoneIdent);
    setPatient(loadedPatient);
  };

  const handleSignOut = () => {
    localStorage.removeItem('paired_patient_id');
    localStorage.removeItem('currentUserPhone');
    setPatient(null);
    setUserPhone('');
    setReports([]);
    setSchedules([]);
    setRecords([]);
  };

  // 3. Push Alerts Engine & Alarm Scheduler
  const playRemindSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playNote = (freq: number, start: number, duration: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };
      const now = audioCtx.currentTime;
      playNote(587.33, now, 0.22); // D5
      playNote(659.25, now + 0.12, 0.3); // E5
    } catch (err) {
      console.warn("Audio Context sound blocked or not supported:", err);
    }
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert("Traditional desktop push notifications are not supported in this browser context.");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === 'granted') {
        new Notification("🔔 MediCurex Push Active!", {
          body: "Smart notifications have been unlocked. You will receive real-time push alerts on medication timelines.",
          tag: "med_welcome"
        });
      }
    } catch (e) {
      console.error("Failed requesting permission:", e);
    }
  };

  const triggerTestPushNotification = () => {
    const sampleSchedule: MedicationSchedule = {
      id: `test-${Date.now()}`,
      patientId: patient?.id || 'sample',
      name: 'Metformin XR',
      dosage: '500 mg',
      time: new Date().toTimeString().substring(0, 5),
      instructions: 'Take immediately with warm water right before dining.',
      createdAt: new Date().toISOString()
    };

    playRemindSound();

    if (notificationPermission === 'granted') {
      try {
        new Notification("⏱️ MediCurex Dosage Alert (TEST)", {
          body: `Time for ${sampleSchedule.name} (${sampleSchedule.dosage}) - ${sampleSchedule.instructions}`,
          tag: `test-dose-${Date.now()}`
        });
      } catch (e) {
        console.warn("Browser block message:", e);
      }
    }

    // Always show high fidelity interactive in-app push alert overlay!
    setActiveReminders(prev => {
      if (prev.some(r => r.name === sampleSchedule.name)) return prev;
      return [sampleSchedule, ...prev];
    });
  };

  const handleMarkTakenFromAlarm = async (schedule: MedicationSchedule) => {
    if (!patient) return;
    const todayDateStr = new Date().toISOString().substring(0, 10);
    try {
      // If it is a real schedule (does not start with 'test-'), add to Firestore
      if (!schedule.id.startsWith('test')) {
        const newRecord: Omit<DosageRecord, 'id'> = {
          patientId: patient.id,
          medicationId: schedule.id,
          medicationName: schedule.name,
          dosage: schedule.dosage,
          scheduledTime: schedule.time,
          dateStr: todayDateStr,
          status: 'given',
          markedByPhone: userPhone || 'Synched Device Node',
          markedAt: new Date().toISOString()
        };
        await addDoc(collection(db, 'patients', patient.id, 'dosageRecords'), newRecord);
      }
      
      setActiveReminders(prev => prev.filter(r => r.id !== schedule.id));
      setDismissedRemindersToday(prev => [...prev, `${schedule.id}-${todayDateStr}`]);
    } catch (err) {
      console.error("Failed storing dosage mark:", err);
    }
  };

  const handleDismissAlarm = (schedule: MedicationSchedule) => {
    const todayDateStr = new Date().toISOString().substring(0, 10);
    setActiveReminders(prev => prev.filter(r => r.id !== schedule.id));
    setDismissedRemindersToday(prev => [...prev, `${schedule.id}-${todayDateStr}`]);
  };

  const handleSnoozeAlarm = (schedule: MedicationSchedule) => {
    const todayDateStr = new Date().toISOString().substring(0, 10);
    setActiveReminders(prev => prev.filter(r => r.id !== schedule.id));
    setDismissedRemindersToday(prev => [...prev, `${schedule.id}-${todayDateStr}`]);

    // Snooze alarm will pop back up in 60 seconds
    setTimeout(() => {
      setDismissedRemindersToday(prev => prev.filter(x => x !== `${schedule.id}-${todayDateStr}`));
      playRemindSound();
      setActiveReminders(prev => {
        if (prev.some(r => r.id === schedule.id)) return prev;
        return [...prev, schedule];
      });
    }, 60000);
  };

  // Automated medication check loop (Timer daemon)
  useEffect(() => {
    if (!patient?.id || schedules.length === 0) return;

    const runScheduleCheck = () => {
      const nowTimeStr = new Date().toTimeString().substring(0, 5); // "HH:MM"
      const todayDateStr = new Date().toISOString().substring(0, 10); // "YYYY-MM-DD"

      schedules.forEach(sched => {
        if (sched.time === nowTimeStr) {
          // Check if this dose was already logged as taken/missed today in Firestore
          const alreadyLogged = records.some(r => r.medicationId === sched.id && r.dateStr === todayDateStr);
          // Check if already dismissed or already active in state
          const alreadyDismissed = dismissedRemindersToday.includes(`${sched.id}-${todayDateStr}`);
          const alreadyActive = activeReminders.some(r => r.id === sched.id);

          if (!alreadyLogged && !alreadyDismissed && !alreadyActive) {
            playRemindSound();

            if (notificationPermission === 'granted') {
              try {
                new Notification(`⏱️ Dosage Due: ${sched.name}`, {
                  body: `Time to administer ${sched.dosage}. Instructions: ${sched.instructions}`,
                  tag: `sched-${sched.id}-${todayDateStr}`
                });
              } catch (e) {
                console.warn(e);
              }
            }

            setActiveReminders(prev => {
              if (prev.some(r => r.id === sched.id)) return prev;
              return [...prev, sched];
            });
            
            setDismissedRemindersToday(prev => [...prev, `${sched.id}-${todayDateStr}`]);
          }
        }
      });
    };

    runScheduleCheck();
    const intervalId = setInterval(runScheduleCheck, 8000); // Check every 8 seconds for accurate alarms
    return () => clearInterval(intervalId);
  }, [patient?.id, schedules, records, dismissedRemindersToday, activeReminders, notificationPermission]);

  const handleTabChange = (tab: 'summary' | 'reports' | 'dosage') => {
    setActiveTab(tab);
    setTimeout(() => {
      document.getElementById('navigation-toggles')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, 40);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F4FAF8] via-[#E3F6EE] to-[#CFEDE0] flex items-center justify-center font-sans relative overflow-hidden animate-fade-in">
        {/* Ambient health teal/mint background rays */}
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full bg-[#10B981] opacity-25 blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-[#0D9488] opacity-20 blur-[120px]"></div>
        
        <div className="text-center space-y-4 z-10 glass-container p-8 rounded-3xl border border-[#10B981]/30 max-w-sm animate-float-soothing">
          <div className="relative flex items-center justify-center mx-auto mb-3">
            <div className="w-14 h-14 rounded-full border-2 border-[#10B981]/25 border-t-[#10B981] animate-spin"></div>
            <Hospital className="w-6 h-6 text-[#0D9488] absolute animate-heartbeat" />
          </div>
          <p className="text-xs font-serif font-bold tracking-widest uppercase text-[#0F766E] animate-pulse">
            M E D I C U R E X
          </p>
          <p className="text-[11px] font-mono tracking-wider text-slate-500 uppercase">
            Synchronizing Clinical Database Protocols...
          </p>
        </div>
      </div>
    );
  }

  if (!patient) {
    return <PatientSetup onPatientLoaded={handlePatientLoaded} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F4FAF8] via-[#E3F6EE] to-[#CFEDE0] text-slate-800 font-sans pb-16 antialiased selection:bg-[#10B981]/30 selection:text-[#064E3B] relative overflow-x-hidden">
      
      {/* Absolute Luxury Jade & Soft Mint Glass Orbs */}
      <div className="absolute top-[-120px] left-[-180px] w-[650px] h-[650px] rounded-full bg-gradient-to-tr from-[#10B981] to-[#047857] opacity-[0.22] blur-[120px] pointer-events-none animate-pulse-halo" style={{ animationDuration: '6s' }}></div>
      <div className="absolute bottom-[5%] right-[-220px] w-[750px] h-[750px] rounded-full bg-gradient-to-bl from-[#059669] to-[#0f172a] opacity-[0.16] blur-[150px] pointer-events-none"></div>
      <div className="absolute top-[22%] left-[15%] w-[850px] h-[450px] rounded-full bg-[#A7F3D0] opacity-[0.24] blur-[170px] pointer-events-none animate-float-soothing"></div>
      <div className="absolute bottom-[38%] left-[-120px] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-[#0F766E] to-[#34D399] opacity-[0.15] blur-[110px] pointer-events-none"></div>
      <div className="absolute top-[50%] right-[10%] w-[400px] h-[400px] rounded-full bg-[#6EE7B7] opacity-[0.12] blur-[130px] pointer-events-none"></div>

      {/* 2. Main Workspace Layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 sm:mt-12 relative z-10">
        
        {/* Centralized Branding Section without white background box */}
        <div className="flex flex-col items-center justify-center text-center py-8 px-4 max-w-4xl mx-auto relative z-10 mb-8 mt-2 animate-feed-in">
          {/* Elegant Logo centered */}
          <div className="p-4 sm:p-5 bg-gradient-to-tr from-[#0d5c4b] to-[#10b981] text-white rounded-3xl shadow-[0_15px_35px_rgba(16,185,129,0.22)] border border-emerald-400 ring-2 ring-white/60 animate-pulse-halo shrink-0 mb-6 transition-transform hover:scale-105">
            <Hospital className="w-10 sm:w-12 h-10 sm:h-12 animate-heartbeat" />
          </div>

          <div className="space-y-2 sm:space-y-3">
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-sans font-extrabold tracking-tight leading-none text-slate-900">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#0d5c4b] to-[#10b981] drop-shadow-xs">MediCurex</span>
            </h1>
            <p className="text-sm sm:text-lg md:text-xl font-bold text-slate-600 tracking-wide font-sans">
              A Smart Healthcare Management System
            </p>
          </div>

          {/* Premium Patient Dossier Meta Strip - clean, minimalist, centered */}
          <div className="mt-8 flex flex-wrap justify-center items-center gap-x-4 gap-y-2 text-xs text-slate-500 border-t border-[#10B981]/15 pt-5 w-full max-w-2xl font-sans">
            <span className="text-[10px] sm:text-[11px] font-bold tracking-widest font-mono text-[#0D9488] uppercase bg-[#F0FDF4] px-2.5 py-0.5 rounded border border-[#10B981]/20">Active Profile: {patient.name}</span>
            <span className="hidden sm:inline text-slate-300">•</span>
            <span>Age: <strong className="text-slate-800 font-semibold">{patient.age} years</strong></span>
            <span className="hidden sm:inline text-slate-300">•</span>
            <span>Gender: <strong className="text-slate-800 font-semibold">{patient.gender}</strong></span>
            <span className="hidden sm:inline text-slate-300">•</span>
            <span className="flex items-center gap-1.5">
              <span>Caregiver Contact: <strong className="text-slate-800 font-semibold">{patient.caretakerName || userPhone}</strong></span>
              <span className="text-slate-300">|</span>
              <button 
                onClick={handleSignOut}
                className="text-[10px] sm:text-[11px] text-red-600 hover:text-red-700 font-extrabold bg-red-50 hover:bg-red-100 border border-red-200 px-2 py-0.5 rounded-lg transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                title="Switch Patient / Sign Out"
              >
                <LogOut className="w-2.5 h-2.5 text-red-500" /> Switch Patient
              </button>
            </span>
          </div>

          {/* Unified Push Notification Desk Center */}
          <div className="mt-4 flex flex-wrap justify-center items-center gap-2.5 relative z-10 font-sans">
            <button
              onClick={requestNotificationPermission}
              className={`px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-bold font-mono uppercase tracking-wider border flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
                notificationPermission === 'granted'
                  ? 'bg-emerald-50 text-[#065F46] border-[#10B981]/30 hover:bg-emerald-100/65'
                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              }`}
              title="Request browser push notifications access"
            >
              {notificationPermission === 'granted' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  <Bell className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
                  <span>Push Alerts Bound</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-450 animate-pulse"></span>
                  <BellRing className="w-3.5 h-3.5 text-amber-600" />
                  <span>Activate Push Protocols</span>
                </>
              )}
            </button>

            <button
              onClick={triggerTestPushNotification}
              className="px-3.5 py-1.5 rounded-full text-[10px] sm:text-xs font-black font-mono uppercase tracking-wider bg-white hover:bg-slate-50 text-slate-700 border border-emerald-400/25 hover:border-emerald-500/40 shadow-3xs transition-all active:scale-95 cursor-pointer flex items-center gap-1"
              title="Verify push alert and sound metrics instantly"
            >
              <span>⚡</span> Send Test Alarm
            </button>
          </div>
        </div>

        {/* Clean pill horizontal toggle centered under the home branding */}
        <div id="navigation-toggles" className="flex justify-center mb-10 relative z-10 scroll-mt-6">
          <div className="inline-grid grid-cols-3 bg-[#D1EBE1]/45 p-1 rounded-2xl border border-[#10B981]/25 shadow-xs backdrop-blur-md relative max-w-md w-full">
            <button
              onClick={() => handleTabChange('summary')}
              className={`relative py-3 px-2 sm:px-4 rounded-xl text-xs sm:text-xs font-black transition-colors duration-200 cursor-pointer text-center flex items-center justify-center gap-1.5 min-w-0 ${
                activeTab === 'summary' ? 'text-white' : 'text-[#065F46] hover:text-[#047857]'
              }`}
            >
              {activeTab === 'summary' && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 bg-gradient-to-r from-[#0D9488] to-[#10B981] rounded-xl border-t border-white/20 shadow-md"
                  transition={{ type: "spring", stiffness: 350, damping: 32 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1 justify-center">
                <span>📊</span> <span className="inline-block uppercase tracking-wider">Summary</span>
              </span>
            </button>

            <button
              onClick={() => handleTabChange('reports')}
              className={`relative py-3 px-2 sm:px-4 rounded-xl text-xs sm:text-xs font-black transition-colors duration-200 cursor-pointer text-center flex items-center justify-center gap-1.5 min-w-0 ${
                activeTab === 'reports' ? 'text-white' : 'text-[#065F46] hover:text-[#047857]'
              }`}
            >
              {activeTab === 'reports' && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 bg-gradient-to-r from-[#0D9488] to-[#10B981] rounded-xl border-t border-white/20 shadow-md"
                  transition={{ type: "spring", stiffness: 350, damping: 32 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1 justify-center">
                <span>📋</span> <span className="inline-block uppercase tracking-wider">Lab Feeds</span>
              </span>
            </button>

            <button
              onClick={() => handleTabChange('dosage')}
              className={`relative py-3 px-2 sm:px-4 rounded-xl text-xs sm:text-xs font-black transition-colors duration-200 cursor-pointer text-center flex items-center justify-center gap-1.5 min-w-0 ${
                activeTab === 'dosage' ? 'text-white' : 'text-[#065F46] hover:text-[#047857]'
              }`}
            >
              {activeTab === 'dosage' && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 bg-gradient-to-r from-[#0D9488] to-[#10B981] rounded-xl border-t border-white/20 shadow-md"
                  transition={{ type: "spring", stiffness: 350, damping: 32 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1 justify-center">
                <span>💊</span> <span className="inline-block uppercase tracking-wider">Medicine Log</span>
              </span>
            </button>
          </div>
        </div>

        {/* Tab renders */}
        <div id="active-tab-content" className="space-y-6 overflow-hidden scroll-mt-24">
          <AnimatePresence mode="wait">
            {activeTab === 'summary' && (
              <motion.div
                key="summary"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <CurrentCondition
                  patient={patient}
                  reports={reports}
                  schedules={schedules}
                  records={records}
                  onTriggerPDFPreview={() => setShowPrintPreview(true)}
                />
              </motion.div>
            )}

            {activeTab === 'reports' && (
              <motion.div
                key="reports"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <MedicalReports
                  patient={patient}
                  reports={reports}
                  userPhone={userPhone}
                  onTriggerPDFPreview={() => setShowPrintPreview(true)}
                />
              </motion.div>
            )}

            {activeTab === 'dosage' && (
              <motion.div
                key="dosage"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <DosageTracker
                  patient={patient}
                  schedules={schedules}
                  records={records}
                  userPhone={userPhone}
                  onTriggerPDFPreview={() => setShowPrintPreview(true)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </main>

      {/* 3. Global Printable Preview overlay */}
      {showPrintPreview && (
        <PrintPDFReport
          patient={patient}
          reports={reports}
          schedules={schedules}
          records={records}
          onClose={() => setShowPrintPreview(false)}
        />
      )}

      {/* 4. Active Push Notification Alarm Toasts Stack */}
      <div className="fixed top-5 right-5 sm:top-6 sm:right-6 z-50 w-full max-w-sm flex flex-col gap-3 pointer-events-none px-4 sm:px-0">
        <AnimatePresence>
          {activeReminders.map((schedule) => (
            <motion.div
              key={schedule.id}
              initial={{ opacity: 0, x: 80, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className="pointer-events-auto bg-slate-900 border border-emerald-400 text-white rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.35)] overflow-hidden flex flex-col w-full relative group"
            >
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-500 via-teal-400 to-[#10B981] animate-pulse"></div>
              
              <div className="p-4 flex gap-3.5">
                {/* Ringing Bell Icon block */}
                <div className="p-2.5 bg-emerald-500/15 rounded-xl border border-emerald-500/25 shrink-0 flex items-center justify-center self-start text-emerald-400 animate-bounce" style={{ animationDuration: '2.5s' }}>
                  <Bell className="w-5 h-5 animate-pulse" />
                </div>
                
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[9px] font-extrabold text-emerald-400 tracking-wider uppercase font-mono">
                      ⏱️ Dosage Alarm Active
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono font-bold bg-white/5 border border-white/10 px-1.5 py-0.2 rounded">
                      {schedule.time}
                    </span>
                  </div>
                  
                  <h4 className="text-sm font-extrabold text-white tracking-tight leading-snug truncate">
                    {schedule.name}
                  </h4>
                  <p className="text-[11px] text-emerald-200/90 font-mono font-bold">
                    Dosage: {schedule.dosage}
                  </p>
                  <p className="text-[11px] text-slate-300 leading-normal font-sans pt-1">
                    {schedule.instructions}
                  </p>
                </div>
              </div>

              {/* Action row */}
              <div className="bg-slate-950/60 border-t border-white/5 p-2 sm:p-2.5 flex justify-between gap-2">
                <button
                  onClick={() => handleMarkTakenFromAlarm(schedule)}
                  className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-lg font-black text-[10px] sm:text-[11px] uppercase tracking-wider transition-all cursor-pointer active:scale-95 text-center flex items-center justify-center gap-1"
                >
                  ✔️ Administered
                </button>
                <button
                  onClick={() => handleSnoozeAlarm(schedule)}
                  className="px-2.5 sm:px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white rounded-lg font-bold text-[10px] uppercase font-mono tracking-wider transition-all cursor-pointer active:scale-95"
                  title="Snooze for 1 minute"
                >
                  Snooze
                </button>
                <button
                  onClick={() => handleDismissAlarm(schedule)}
                  className="px-2.5 sm:px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/35 text-rose-300 hover:text-rose-200 border border-rose-500/15 rounded-lg font-bold text-[10px] uppercase font-mono tracking-wider transition-all cursor-pointer active:scale-95"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

    </div>
  );
}
