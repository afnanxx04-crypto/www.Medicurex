import React, { useState } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, doc, deleteDoc } from 'firebase/firestore';
import { Patient, MedicationSchedule, DosageRecord } from '../types';
import { 
  Plus as PlusIcon, 
  Bell as BellIcon, 
  Check as CheckIcon, 
  X as XIcon, 
  Trash2 as TrashIcon, 
  Clock as ClockIcon, 
  AlertCircle as AlertIcon,
  Upload as UploadIcon,
  FileText as FileTextIcon,
  Sparkles as SparklesIcon,
  ShieldCheck as ShieldCheckIcon,
  Layers as LayersIcon,
  Loader2 as Loader2Icon,
  Edit2 as EditIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DosageTrackerProps {
  patient: Patient;
  schedules: MedicationSchedule[];
  records: DosageRecord[];
  userPhone: string;
  onTriggerPDFPreview?: () => void;
}

interface ParsedMedication {
  id: string;
  name: string;
  dosage: string;
  morning: boolean;
  afternoon: boolean;
  night: boolean;
  instructions: string;
  morningTime: string;
  afternoonTime: string;
  nightTime: string;
}

export default function DosageTracker({ patient, schedules, records, userPhone, onTriggerPDFPreview }: DosageTrackerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [medName, setMedName] = useState('');
  const [medDosage, setMedDosage] = useState('');
  const [medTime, setMedTime] = useState('08:00');
  const [medInstructions, setMedInstructions] = useState('');
  const [formError, setFormError] = useState('');

  // Prescription scan custom States
  const [isUploadingPrescription, setIsUploadingPrescription] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isAnalyzingPrescription, setIsAnalyzingPrescription] = useState(false);
  const [parsedMedications, setParsedMedications] = useState<ParsedMedication[]>([]);
  const [prescriptionError, setPrescriptionError] = useState('');
  const [isSavingParsed, setIsSavingParsed] = useState(false);

  // Find date string for today (in local timezone context)
  const todayDateStr = new Date().toISOString().substring(0, 10);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processPrescriptionFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processPrescriptionFile(e.target.files[0]);
    }
  };

  const processPrescriptionFile = async (file: File) => {
    setSelectedFileName(file.name);
    setPrescriptionError('');
    setIsAnalyzingPrescription(true);
    setParsedMedications([]);

    try {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('File is too large. Maximum size allowed is 10MB.');
      }

      const base64String = await fileToBase64(file);

      const response = await fetch('/api/scan-prescription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: base64String,
          patientName: patient.name,
          patientAge: patient.age
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to scan the prescription file.');
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.medications)) {
        const mapped = data.medications.map((m: any, index: number) => ({
          id: `parsed-${index}-${Date.now()}`,
          name: m.name || 'Unknown Medication',
          dosage: m.dosage || '1 Tablet',
          morning: m.morning !== undefined ? !!m.morning : true,
          afternoon: m.afternoon !== undefined ? !!m.afternoon : true,
          night: m.night !== undefined ? !!m.night : true,
          instructions: m.instructions || 'Take as directed',
          morningTime: '08:00',
          afternoonTime: '13:00',
          nightTime: '20:00'
        }));
        setParsedMedications(mapped);
      } else {
        throw new Error('No medications found or invalid data returned.');
      }
    } catch (err: any) {
      console.error(err);
      setPrescriptionError(err.message || 'Error occurred while processing file.');
    } finally {
      setIsAnalyzingPrescription(false);
    }
  };

  const handleSaveParsedSchedules = async () => {
    setIsSavingParsed(true);
    setPrescriptionError('');

    try {
      for (const med of parsedMedications) {
        if (!med.morning && !med.afternoon && !med.night) {
          continue;
        }

        if (med.morning) {
          const newSchedule: Omit<MedicationSchedule, 'id'> = {
            patientId: patient.id,
            name: med.name,
            dosage: med.dosage,
            time: med.morningTime || '08:00',
            instructions: `${med.instructions} (Morning Intake)`.trim(),
            createdAt: new Date().toISOString()
          };
          await addDoc(collection(db, 'patients', patient.id, 'medicationSchedules'), newSchedule);
        }

        if (med.afternoon) {
          const newSchedule: Omit<MedicationSchedule, 'id'> = {
            patientId: patient.id,
            name: med.name,
            dosage: med.dosage,
            time: med.afternoonTime || '13:00',
            instructions: `${med.instructions} (Afternoon Intake)`.trim(),
            createdAt: new Date().toISOString()
          };
          await addDoc(collection(db, 'patients', patient.id, 'medicationSchedules'), newSchedule);
        }

        if (med.night) {
          const newSchedule: Omit<MedicationSchedule, 'id'> = {
            patientId: patient.id,
            name: med.name,
            dosage: med.dosage,
            time: med.nightTime || '20:00',
            instructions: `${med.instructions} (Night Intake)`.trim(),
            createdAt: new Date().toISOString()
          };
          await addDoc(collection(db, 'patients', patient.id, 'medicationSchedules'), newSchedule);
        }
      }

      setParsedMedications([]);
      setSelectedFileName(null);
      setIsUploadingPrescription(false);
    } catch (err: any) {
      console.error(err);
      setPrescriptionError('Bulk sync failed: ' + (err.message || 'Firestore connection issue.'));
    } finally {
      setIsSavingParsed(false);
    }
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!medName.trim()) return setFormError('Medicine Name is required.');
    if (!medDosage.trim()) return setFormError('Dosage amount (e.g. 1 Tablet) is required.');
    if (!medTime) return setFormError('Please select a scheduled delivery time.');

    try {
      const newSchedule: Omit<MedicationSchedule, 'id'> = {
        patientId: patient.id,
        name: medName.trim(),
        dosage: medDosage.trim(),
        time: medTime,
        instructions: medInstructions.trim() || 'No specific instructions',
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'patients', patient.id, 'medicationSchedules'), newSchedule);

      // Reset
      setMedName('');
      setMedDosage('');
      setMedTime('08:00');
      setMedInstructions('');
      setIsAdding(false);
    } catch (err: any) {
      console.error(err);
      try {
        handleFirestoreError(err, OperationType.WRITE, `patients/${patient.id}/medicationSchedules`);
      } catch (e: any) {
        setFormError('Failed to add schedule: ' + e.message);
      }
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!window.confirm('Are you sure you want to remove this medication from the patient schedule?')) return;
    try {
      await deleteDoc(doc(db, 'patients', patient.id, 'medicationSchedules', scheduleId));
    } catch (err: any) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, `patients/${patient.id}/medicationSchedules/${scheduleId}`);
    }
  };

  const handleMarkDosage = async (schedule: MedicationSchedule, status: 'given' | 'missed') => {
    try {
      const newRecord: Omit<DosageRecord, 'id'> = {
        patientId: patient.id,
        medicationId: schedule.id,
        medicationName: schedule.name,
        dosage: schedule.dosage,
        scheduledTime: schedule.time,
        dateStr: todayDateStr,
        status,
        markedByPhone: userPhone,
        markedAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'patients', patient.id, 'dosageRecords'), newRecord);
    } catch (err: any) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, `patients/${patient.id}/dosageRecords`);
    }
  };

  // Compute active alert of missed or overdue unmarked dosages for Today
  const currentTimeStr = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: false });
  // Simple "HH:MM" parse
  const currentHourMin = new Date().toTimeString().substring(0, 5);

  const getTodayRecordForSchedule = (scheduleId: string) => {
    return records.find(r => r.medicationId === scheduleId && r.dateStr === todayDateStr);
  };

  // Find dynamic alerts: schedules where scheduled hour is past but status is unmarked/pending
  const overdueUnmarkedDosages = schedules.filter(sched => {
    const isUnmarked = !getTodayRecordForSchedule(sched.id);
    const isOverdue = sched.time <= currentHourMin;
    return isUnmarked && isOverdue;
  });

  return (
    <div className="space-y-4 sm:space-y-6 font-sans">
      
      {/* Dynamic Overdue Action Alert Banner */}
      {overdueUnmarkedDosages.length > 0 && (
        <div className="glass-card-dark bg-gradient-to-br from-[#0F2D24] to-[#061A14] border border-[#10B981]/50 rounded-2xl p-4 sm:p-5 shadow-[0_12px_40px_rgba(6,95,70,0.08)] text-white animate-pulse relative overflow-hidden flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
          <div className="p-2.5 sm:p-3 green-gradient text-white border border-white/20 rounded-xl shadow-md shrink-0">
            <AlertIcon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="space-y-1 sm:space-y-1.5 flex-1 w-full">
            <h3 className="font-extrabold text-[#10B981] text-[10px] sm:text-xs uppercase tracking-widest font-mono">Attention Required: Overdue Medication</h3>
            <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed font-normal font-sans">
              One or more scheduled administrations have elapsed their target timeline and require instant verification. Administer the dose and record compliance status below:
            </p>
            <div className="pt-1.5 divide-y divide-[#10B981]/15">
              {overdueUnmarkedDosages.map(sched => (
                <div key={sched.id} className="py-2.5 text-[11px] sm:text-xs font-semibold text-slate-205 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 first:pt-1">
                  <span className="font-medium text-slate-300 flex items-center gap-1.5 font-sans">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#10B981] animate-ping"></span>
                    Scheduled at <strong className="font-mono text-[#10B981]">{sched.time}</strong> — {sched.name} ({sched.dosage})
                  </span>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => handleMarkDosage(sched, 'given')}
                      className="flex-1 sm:flex-initial px-3 py-1.5 bg-[#10b981] hover:bg-[#059669] text-white rounded-lg font-bold text-[10px] uppercase font-mono tracking-wider transition-all shadow-xs cursor-pointer active:scale-95"
                    >
                      Administered
                    </button>
                    <button
                      onClick={() => handleMarkDosage(sched, 'missed')}
                      className="flex-1 sm:flex-initial px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[10px] uppercase font-mono tracking-wider transition-all shadow-xs cursor-pointer active:scale-95"
                    >
                      Log Missed
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Grid: schedules vs Tracking console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Today's Schedule Tracking Panel */}
        <div className="lg:col-span-12 xl:col-span-7 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
            <div className="space-y-0.5">
              <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm uppercase tracking-wider font-mono">TODAY'S DOSAGE DESK</h3>
              <p className="text-[11px] sm:text-xs text-slate-450 font-sans">Instantly sign-off taken or missed components securely across all sibling screens.</p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {onTriggerPDFPreview && (
                <button
                  onClick={onTriggerPDFPreview}
                  className="px-3 py-1.5 text-[10px] font-bold rounded-lg text-[#065F46] bg-white border border-[#10B981]/25 hover:bg-emerald-50/50 transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 shadow-3xs"
                >
                  <FileTextIcon className="w-3.5 h-3.5 text-[#0D9488]" /> Export Overall PDF
                </button>
              )}
              <span className="self-start sm:self-auto text-[9px] sm:text-[10px] text-[#0D9488] font-mono font-bold bg-[#F0FDF4] border border-[#10B981]/20 px-2.5 py-1 rounded-md shadow-3xs">
                ID FEED: {todayDateStr}
              </span>
            </div>
          </div>

          <div className="glass-card rounded-2xl border border-[#10B981]/25 overflow-hidden shadow-[0_12px_35px_rgba(6,95,70,0.04)] divide-y divide-[#10B981]/15">
            {schedules.length === 0 ? (
              <div className="p-12 sm:p-16 text-center text-slate-450 flex flex-col items-center justify-center space-y-2 bg-white/40">
                <ClockIcon className="w-10 h-10 text-[#10B981] opacity-50 stroke-[1.5] animate-pulse" />
                <span className="text-sm font-semibold text-slate-705">No active pharmaceutical schedules</span>
                <p className="text-[11px] text-slate-450">Create target dosage guidelines on the right panel to begin tracking.</p>
              </div>
            ) : (
              schedules.map(sched => {
                const todayRec = getTodayRecordForSchedule(sched.id);

                return (
                  <div key={sched.id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 hover:bg-white/50 transition-all bg-white/30 backdrop-blur-md">
                    <div className="flex items-start gap-2.5">
                      <div className="px-2 py-1 bg-[#F0FDF4] text-[#065F46] rounded-lg font-mono text-xs font-bold leading-none shrink-0 border border-[#10B981]/25 shadow-3xs">
                        {sched.time}
                      </div>
                      <div className="space-y-0.5">
                        <h4 className="font-extrabold text-slate-905 text-[13px] sm:text-sm">{sched.name} <span className="font-normal text-slate-450 text-xs font-sans">({sched.dosage})</span></h4>
                        <span className="text-[11px] sm:text-xs text-slate-500 block font-normal leading-normal font-sans">{sched.instructions}</span>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center justify-end w-full sm:w-auto">
                      {todayRec ? (
                        todayRec.status === 'given' ? (
                          <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start w-full sm:w-auto text-xs">
                            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-emerald-50 text-emerald-705 font-extrabold text-[8px] sm:text-[9px] rounded-lg flex items-center gap-1.5 border border-emerald-250 uppercase tracking-widest font-mono">
                              <CheckIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600 stroke-[3]" /> Given
                            </span>
                            <span className="text-[9px] text-[#0D9488] font-mono">C: {todayRec.markedByPhone}</span>
                          </div>
                        ) : (
                          <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start w-full sm:w-auto text-xs">
                            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-rose-50 text-rose-700 font-extrabold text-[8px] sm:text-[9px] rounded-lg flex items-center gap-1.5 border border-rose-250 uppercase tracking-widest font-mono">
                              <XIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-rose-600 stroke-[3]" /> Missed
                            </span>
                            <span className="text-[9px] text-[#0D9488] font-mono">C: {todayRec.markedByPhone}</span>
                          </div>
                        )
                      ) : (
                        <div className="flex gap-2 w-full sm:w-auto">
                          <button
                            onClick={() => handleMarkDosage(sched, 'given')}
                            className="flex-1 sm:flex-initial px-3 py-1.5 bg-[#10b981] hover:bg-[#059669] text-white rounded-xl text-xs font-extrabold transition-all shadow-xs flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                          >
                            <CheckIcon className="w-3.5 h-3.5" /> Taken
                          </button>
                          <button
                            onClick={() => handleMarkDosage(sched, 'missed')}
                            className="flex-1 sm:flex-initial px-3 py-1.5 bg-white hover:bg-rose-50 hover:text-rose-600 text-slate-650 border border-slate-200 hover:border-rose-105 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                          >
                            <XIcon className="w-3.5 h-3.5" /> Missed
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Historic Log List inside Dosage History */}
          <div className="pt-2">
            <h3 className="font-extrabold text-[#0D9488] text-xs mb-2.5 flex items-center gap-2 uppercase tracking-widest font-mono">
              <ClockIcon className="w-4 h-4 text-[#10B981]" /> COMPLIANCE TIMELINE JOURNAL
            </h3>
            <div className="glass-card rounded-2xl border border-[#10B981]/25 shadow-[0_12px_35px_rgba(6,95,70,0.04)] max-h-56 overflow-y-auto divide-y divide-[#10B981]/15 bg-white/40 backdrop-blur-md">
              {records.length === 0 ? (
                <p className="p-8 text-xs text-slate-400 text-center font-mono font-medium">No recorded journal logs.</p>
              ) : (
                records.map(rec => {
                  const dateObj = new Date(rec.markedAt);
                  const dStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                  const tStr = dateObj.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

                  return (
                    <div key={rec.id} className="p-3 text-[11px] flex justify-between items-center hover:bg-white/50 transition-colors">
                      <div>
                        <span className="font-extrabold text-slate-800">{rec.medicationName}</span>
                        {` `}
                        <span className="text-slate-500 font-sans">({rec.dosage} • {rec.scheduledTime})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-450 font-mono text-[9px]">{dStr}, {tStr}</span>
                        {rec.status === 'given' ? (
                          <span className="text-[8px] tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-sm font-extrabold font-mono uppercase">GIVEN</span>
                        ) : (
                          <span className="text-[8px] tracking-wider text-rose-655 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-sm font-extrabold font-mono uppercase">MISSED</span>
                        )}
                        <span className="text-[9px] text-[#0D9488] font-mono">C: {rec.markedByPhone}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* Regular Schedule Manager Section */}
        <div className="lg:col-span-12 xl:col-span-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm uppercase tracking-wider font-mono">Prescription Engine</h3>
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <button
                onClick={() => {
                  setIsUploadingPrescription(!isUploadingPrescription);
                  setIsAdding(false);
                }}
                className={`flex-1 sm:flex-initial px-3 py-1.5 text-[11px] sm:text-xs font-bold rounded-lg flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer ${
                  isUploadingPrescription
                    ? 'green-gradient text-white border border-emerald-505 shadow-sm'
                    : 'bg-[#F0FDF4] hover:bg-[#D1EBE1]/30 text-[#0D9488] border border-[#10B981]/35 shadow-3xs'
                }`}
                id="prescription-upload-toggle-btn"
              >
                <UploadIcon className="w-3.5 h-3.5 text-current" />
                {isUploadingPrescription ? 'Cancel' : 'Scan Script'}
              </button>
              <button
                onClick={() => {
                  setIsAdding(!isAdding);
                  setIsUploadingPrescription(false);
                }}
                className="flex-1 sm:flex-initial px-3 py-1.5 text-[11px] sm:text-xs font-bold rounded-lg text-slate-700 bg-slate-100 border border-slate-200 hover:bg-slate-200 transition-colors flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                id="medication-add-toggle-btn"
              >
                <PlusIcon className="w-3.5 h-3.5 text-slate-505" />
                {isAdding ? 'Close' : 'Add Manual'}
              </button>
            </div>
          </div>

          <AnimatePresence>
            {isUploadingPrescription && (
              <motion.div 
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="glass-card border border-[#10B981]/25 rounded-2xl p-4 sm:p-5 shadow-[0_12px_35px_rgba(6,95,70,0.06)] space-y-4"
              >
                <div className="border-b border-[#10B981]/15 pb-2.5">
                  <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-widest font-mono flex items-center gap-1.5">
                    <SparklesIcon className="w-4 h-4 text-[#10B981] animate-pulse" /> 
                    PRESCRIPTION SCRIPT INGESTION
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1 leading-normal font-sans">
                    Drag and drop a prescription photo (JPEG, PNG, WEBP) or PDF script. Our AI reads the dosage shorthand like <strong className="font-mono text-[#059669]">1-1-1</strong> to schedule intakes.
                  </p>
                </div>

                {prescriptionError && (
                  <div className="p-3 bg-rose-50 text-rose-800 text-xs rounded-xl border border-rose-150 flex items-start gap-2 font-sans">
                     <AlertIcon className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                     <span className="leading-relaxed text-[11px]">{prescriptionError}</span>
                  </div>
                )}

                {isAnalyzingPrescription ? (
                  <div className="py-8 sm:py-10 flex flex-col items-center justify-center space-y-3">
                    <Loader2Icon className="w-8 h-8 text-[#10B981] animate-spin" />
                    <div className="text-center font-sans">
                      <p className="text-[10px] sm:text-[11px] font-extrabold text-[#0D9488] uppercase tracking-widest font-mono">TRANSCRIBING SCRIPT...</p>
                      {selectedFileName && (
                        <p className="text-[10px] text-[#0D9488] font-semibold font-mono truncate max-w-xs mt-0.5">File: {selectedFileName}</p>
                      )}
                      <p className="text-[10px] text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                        Gemini AI is examining doctor handwriting, mapping shorthand frequencies, and scheduling your calendar...
                      </p>
                    </div>
                  </div>
                ) : parsedMedications.length === 0 ? (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => {
                      const fileInput = document.getElementById('prescription-file-manager');
                      if (fileInput) fileInput.click();
                    }}
                    className={`p-5 sm:p-8 border-2 border-dashed rounded-xl flex flex-col items-center justify-center space-y-3 transition-all cursor-pointer ${
                      isDragging
                        ? 'border-[#10B981] bg-[#F0FDF4]/60 scale-[0.99] shadow-inner'
                        : 'border-[#10B981]/25 bg-white/40 hover:bg-[#F0FDF4]/55 hover:border-[#10B981]'
                    }`}
                  >
                    <div className="p-3 bg-[#F0FDF4] rounded-full text-[#10B981] border border-[#10B981]/15 shadow-3xs flex items-center justify-center animate-bounce">
                      <FileTextIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-[#065F46] font-sans">Drag & Drop prescription file here</p>
                      <p className="text-[10px] text-[#047857] mt-0.5 font-sans">
                        or <span className="text-[#0D9488] hover:text-[#065F46] font-bold underline">browse files</span> from your manager
                      </p>
                    </div>
                    <div className="text-[9px] text-[#0D9488] font-mono uppercase tracking-wider bg-[#F0FDF4] border border-[#10B981]/20 px-3 py-0.5 rounded-full shadow-3xs">
                      Maximum size: 10MB • Supports Images/PDF
                    </div>
                    <input
                      id="prescription-file-manager"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>
                ) : null}

                {parsedMedications.length > 0 && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between border-b border-dashed border-[#10B981]/15 pb-2">
                      <span className="text-[10px] font-extrabold text-[#0D9488] bg-[#F0FDF4] px-2.5 py-1 rounded-full flex items-center gap-1 uppercase tracking-wide border border-[#10B981]/25 shadow-3xs">
                        <ShieldCheckIcon className="w-3.5 h-3.5 text-[#10B981]" /> Extracted Protocols
                      </span>
                      <button
                        onClick={() => {
                          setParsedMedications([]);
                          setSelectedFileName(null);
                        }}
                        className="text-[10px] font-bold text-[#0D9488] hover:text-rose-600 transition-colors uppercase font-mono cursor-pointer"
                      >
                        Reset Ingestion
                      </button>
                    </div>

                    <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1 select-none font-sans">
                      {parsedMedications.map((med, index) => {
                        const codeMorning = med.morning ? '1' : '0';
                        const codeAfternoon = med.afternoon ? '1' : '0';
                        const codeNight = med.night ? '1' : '0';
                        const shorthandFormula = `${codeMorning}-${codeAfternoon}-${codeNight}`;

                        return (
                          <div key={med.id} className="p-3.5 bg-white/40 hover:bg-white/60 rounded-xl border border-[#10B981]/15 space-y-2.5 relative">
                            <button
                              type="button"
                              onClick={() => {
                                setParsedMedications(prev => prev.filter(p => p.id !== med.id));
                              }}
                              className="absolute top-2.5 right-2.5 text-slate-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                              title="Delete Item"
                            >
                              <XIcon className="w-3.5 h-3.5" />
                            </button>

                            <div className="space-y-1.5">
                              <div>
                                <label className="block text-[8px] font-bold text-[#0D9488] uppercase tracking-widest font-mono">Medicine {index + 1}</label>
                                <input
                                  type="text"
                                  value={med.name}
                                  onChange={(e) => {
                                    setParsedMedications(prev => prev.map(p => p.id === med.id ? { ...p, name: e.target.value } : p));
                                  }}
                                  className="mt-0.5 block w-full px-2.5 py-1.5 bg-white border border-[#10B981]/20 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#10B981]"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[8px] font-bold text-[#0D9488] uppercase tracking-widest font-mono">Dosage Quantity</label>
                                  <input
                                    type="text"
                                    value={med.dosage}
                                    onChange={(e) => {
                                      setParsedMedications(prev => prev.map(p => p.id === med.id ? { ...p, dosage: e.target.value } : p));
                                    }}
                                    className="mt-0.5 block w-full px-2.5 py-1.5 bg-white border border-[#10B981]/20 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#10B981]"
                                  />
                                </div>
                                <div className="flex flex-col justify-end">
                                  <div className="text-[10px] text-[#065F46] bg-[#F0FDF4] px-2.5 py-1.5 rounded-lg font-mono font-bold text-center border border-[#10B981]/20 shadow-3xs">
                                    Intake Pattern: <span className="tracking-widest font-extrabold text-[11px] text-[#0D9488]">{shorthandFormula}</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Shorthand Interactive Buttons */}
                            <div className="space-y-1 font-sans">
                              <label className="block text-[8px] font-bold text-[#0D9488] uppercase tracking-widest font-mono font-sans">Ask/Define Intake Schedule</label>
                              <div className="grid grid-cols-3 gap-1.5 pt-0.5 font-sans">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setParsedMedications(prev => prev.map(p => p.id === med.id ? { ...p, morning: !p.morning } : p));
                                  }}
                                  className={`py-1.5 px-1 rounded-lg text-[10px] font-bold flex flex-col items-center justify-center border transition-all cursor-pointer ${
                                    med.morning
                                      ? 'bg-emerald-50 border-[#10B981] text-[#065F46] shadow-2xs font-extrabold'
                                      : 'bg-white border-slate-150 text-slate-400 hover:bg-slate-50'
                                  }`}
                                >
                                  <span className="text-[9px]">🌞 Morning</span>
                                  <span className="text-xs font-mono font-extrabold mt-0.5">{med.morning ? '1 (Take)' : '0 (Skip)'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setParsedMedications(prev => prev.map(p => p.id === med.id ? { ...p, afternoon: !p.afternoon } : p));
                                  }}
                                  className={`py-1.5 px-1 rounded-lg text-[10px] font-bold flex flex-col items-center justify-center border transition-all cursor-pointer ${
                                    med.afternoon
                                      ? 'bg-teal-50 border-[#10B981] text-[#0D9488] shadow-2xs font-extrabold'
                                      : 'bg-white border-slate-150 text-slate-400 hover:bg-slate-50'
                                  }`}
                                >
                                  <span className="text-[9px]">☀️ Afternoon</span>
                                  <span className="text-xs font-mono font-extrabold mt-0.5">{med.afternoon ? '1 (Take)' : '0 (Skip)'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setParsedMedications(prev => prev.map(p => p.id === med.id ? { ...p, night: !p.night } : p));
                                  }}
                                  className={`py-1.5 px-1 rounded-lg text-[10px] font-bold flex flex-col items-center justify-center border transition-all cursor-pointer ${
                                    med.night
                                      ? 'bg-emerald-950/10 border-[#10B981] text-emerald-950 shadow-2xs font-extrabold'
                                      : 'bg-white border-slate-150 text-slate-400 hover:bg-slate-50'
                                  }`}
                                >
                                  <span className="text-[9px]">🌙 Night</span>
                                  <span className="text-xs font-mono font-extrabold mt-0.5">{med.night ? '1 (Take)' : '0 (Skip)'}</span>
                                </button>
                              </div>
                            </div>

                            {/* Hour tuning */}
                            <div className="grid grid-cols-3 gap-1.5 text-[9px] pt-1.5 border-t border-[#10B981]/15">
                              <div>
                                <span className="block text-[7px] font-extrabold text-[#0D9488] uppercase tracking-widest font-mono">Morning Time</span>
                                <input
                                  type="time"
                                  disabled={!med.morning}
                                  value={med.morningTime}
                                  onChange={(e) => {
                                    setParsedMedications(prev => prev.map(p => p.id === med.id ? { ...p, morningTime: e.target.value } : p));
                                  }}
                                  className="mt-0.5 w-full bg-white border border-[#10B981]/20 focus:outline-[#10B981] rounded-lg px-2 py-0.5 text-center font-mono text-xs disabled:opacity-30 disabled:bg-slate-100"
                                />
                              </div>
                              <div>
                                <span className="block text-[7px] font-extrabold text-[#0D9488] uppercase tracking-widest font-mono">Afternoon Time</span>
                                <input
                                  type="time"
                                  disabled={!med.afternoon}
                                  value={med.afternoonTime}
                                  onChange={(e) => {
                                    setParsedMedications(prev => prev.map(p => p.id === med.id ? { ...p, afternoonTime: e.target.value } : p));
                                  }}
                                  className="mt-0.5 w-full bg-white border border-[#10B981]/20 focus:outline-[#10B981] rounded-lg px-2 py-0.5 text-center font-mono text-xs disabled:opacity-30 disabled:bg-slate-100"
                                />
                              </div>
                              <div>
                                <span className="block text-[7px] font-extrabold text-[#0D9488] uppercase tracking-widest font-mono">Night Time</span>
                                <input
                                  type="time"
                                  disabled={!med.night}
                                  value={med.nightTime}
                                  onChange={(e) => {
                                    setParsedMedications(prev => prev.map(p => p.id === med.id ? { ...p, nightTime: e.target.value } : p));
                                  }}
                                  className="mt-0.5 w-full bg-white border border-[#10B981]/20 focus:outline-[#10B981] rounded-lg px-2 py-0.5 text-center font-mono text-xs disabled:opacity-30 disabled:bg-slate-100"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[8px] font-bold text-[#0D9488] uppercase tracking-widest font-mono font-sans">Instructions & Warnings</label>
                              <input
                                type="text"
                                value={med.instructions}
                                onChange={(e) => {
                                  setParsedMedications(prev => prev.map(p => p.id === med.id ? { ...p, instructions: e.target.value } : p));
                                }}
                                className="mt-0.5 block w-full px-2.5 py-1 bg-white border border-[#10B981]/25 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#10B981]"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-3 border-t border-[#10B981]/15 flex items-center justify-between gap-3">
                      <div className="text-[10px] text-slate-505 leading-normal font-sans">
                        Creating <strong className="text-slate-800 font-extrabold">{parsedMedications.reduce((sum, m) => sum + (m.morning ? 1 : 0) + (m.afternoon ? 1 : 0) + (m.night ? 1 : 0), 0)}</strong> calendar timelines.
                      </div>
                      <button
                        type="button"
                        disabled={isSavingParsed}
                        onClick={handleSaveParsedSchedules}
                        className="px-4.5 py-2.5 bg-[#10b981] hover:bg-[#059669] text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1 hover:scale-[1.01] transition-all cursor-pointer"
                      >
                        {isSavingParsed ? (
                          <>
                            <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> Adding...
                          </>
                        ) : (
                          <>
                            <ShieldCheckIcon className="w-3.5 h-3.5 font-bold" /> Approve & Bulk Sync
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {isAdding && (
            <form onSubmit={handleAddSchedule} className="glass-card border border-[#10B981]/25 rounded-2xl p-5 shadow-sm space-y-4 bg-white/45 backdrop-blur-md">
              <h4 className="text-[10px] font-extrabold text-[#0D9488] uppercase tracking-widest font-mono">NEW MEDICINE PARAMETERS</h4>
              
              {formError && (
                <div className="p-3.5 bg-rose-50/85 text-rose-900 text-xs rounded-xl border border-rose-100 font-sans">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-[9px] font-bold text-[#0D9488] uppercase tracking-wider mb-1 font-mono">Medicine Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aspirin 75mg"
                  value={medName}
                  onChange={(e) => setMedName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-[#10B981]/25 focus:border-[#10B981] rounded-xl bg-white/50 focus:outline-none focus:ring-1 focus:ring-[#10B981] text-slate-800 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[9px] font-bold text-[#0D9488] uppercase tracking-wider mb-1 font-mono">Dosage Quantity</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 1 pill"
                    value={medDosage}
                    onChange={(e) => setMedDosage(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-[#10B981]/25 focus:border-[#10B981] rounded-xl bg-white/50 focus:outline-none focus:ring-1 focus:ring-[#10B981] text-slate-800 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-[#0D9488] uppercase tracking-wider mb-1 font-mono">Target Time</label>
                  <input
                    type="time"
                    required
                    value={medTime}
                    onChange={(e) => setMedTime(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-[#10B981]/25 focus:border-[#10B981] rounded-xl bg-white/50 focus:outline-none focus:ring-1 focus:ring-[#10B981] text-slate-800 text-xs text-center font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-[#0D9488] uppercase tracking-wider mb-1 font-mono">Delivery instructions</label>
                <input
                  type="text"
                  placeholder="e.g. Take after breakfast with warm water"
                  value={medInstructions}
                  onChange={(e) => setMedInstructions(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-[#10B981]/25 focus:border-[#10B981] rounded-xl bg-white/50 focus:outline-none focus:ring-1 focus:ring-[#10B981] text-slate-800 text-xs"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="px-4.5 py-2.5 green-gradient text-white font-extrabold rounded-xl text-xs shadow-md border-t border-white/20 hover:opacity-[0.98] transition-all active:scale-95 cursor-pointer"
                >
                  Save Schedule Protocol
                </button>
              </div>
            </form>
          )}

          <div className="glass-card rounded-2xl border border-[#10B981]/25 overflow-hidden shadow-[0_12px_35px_rgba(6,95,70,0.04)] divide-y divide-[#10B981]/15 max-h-96 overflow-y-auto bg-white/40 backdrop-blur-md">
            {schedules.length === 0 ? (
              <p className="p-6 text-xs text-slate-450 text-center font-sans">No medications scheduled yet.</p>
            ) : (
              schedules.map(sched => (
                <div key={sched.id} className="p-3.5 flex items-center justify-between gap-3 text-xs hover:bg-white/55 transition-colors">
                  <div className="space-y-1">
                    <span className="font-extrabold text-slate-800 font-sans text-[13px]">{sched.name}</span>
                    <p className="text-[11px] text-slate-450 leading-none">Dosage: <strong className="text-slate-700">{sched.dosage}</strong> • Scheduled: <strong className="font-mono text-[#059669]">{sched.time}</strong></p>
                    <p className="text-[11px] text-slate-500 italic">Guide: {sched.instructions}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteSchedule(sched.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50/50 rounded-lg transition-colors shrink-0 cursor-pointer"
                    title="Remove Schedule"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
