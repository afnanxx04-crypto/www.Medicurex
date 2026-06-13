import React, { useState } from 'react';
import { Clipboard, Heart, Activity, AlertTriangle, CheckCircle2, ChevronRight, Loader2, Calendar, ShieldAlert, X, Upload, FileText, Send, Smartphone, MessageSquare } from 'lucide-react';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Patient, LabReport } from '../types';

interface MedicalReportsProps {
  patient: Patient;
  reports: LabReport[];
  userPhone: string;
  onTriggerPDFPreview?: () => void;
}

export default function MedicalReports({ patient, reports, userPhone, onTriggerPDFPreview }: MedicalReportsProps) {
  const [isFeeding, setIsFeeding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState<LabReport | null>(null);

  // SMS Portal States
  const [activeSmsReportId, setActiveSmsReportId] = useState<string | null>(null);
  const [smsPhone, setSmsPhone] = useState<string>('');
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsStatus, setSmsStatus] = useState<{
    success: boolean;
    simulated?: boolean;
    recipient?: string;
    message?: string;
    error?: string;
  } | null>(null);

  const handleSendSMS = async (report: LabReport, targetPhone: string) => {
    const sanitizedPhone = targetPhone.replace(/\D/g, '');
    if (!sanitizedPhone || sanitizedPhone.length < 8) {
      setSmsStatus({ success: false, error: 'Please enter a valid phone number with at least 8 digits.' });
      return;
    }

    setIsSendingSms(true);
    setSmsStatus(null);
    try {
      const response = await fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: sanitizedPhone,
          report: {
            systolic: report.systolic,
            diastolic: report.diastolic,
            sugar: report.sugar,
            sugarType: report.sugarType,
            temperature: report.temperature,
            heartRate: report.heartRate,
            consultationNeeded: report.consultationNeeded,
            aiAssessment: report.aiAssessment
          },
          patientName: patient.name
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'SMS backend service returned an error.');
      }

      const result = await response.json();
      setSmsStatus({
        success: true,
        simulated: result.simulated,
        recipient: result.recipient,
        message: result.message
      });

    } catch (err: any) {
      console.error(err);
      setSmsStatus({
        success: false,
        error: err.message || 'Failed to send SMS through the clinical proxy gateway.'
      });
    } finally {
      setIsSendingSms(false);
    }
  };

  // File Upload & Drag and Drop States
  const [formError, setFormError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelection(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelection(file);
    }
  };

  const handleFileSelection = (file: File) => {
    setFormError('');
    
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setFormError('Unsupported file format. Please upload an image (JPEG, PNG, WEBP) or a PDF report.');
      return;
    }

    // Limit size to e.g. 10MB
    if (file.size > 10 * 1024 * 1024) {
      setFormError('The selected file size exceeds the 10MB limit.');
      return;
    }

    setSelectedFileName(file.name);

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = reader.result as string;
      handleAutonomousScan(base64Data, file.name);
    };
    reader.onerror = () => {
      setFormError('Failed to read the chosen file securely.');
    };
    reader.readAsDataURL(file);
  };

  const handleAutonomousScan = async (base64Image: string, filename?: string) => {
    setIsLoading(true);
    setFormError('');
    try {
      const response = await fetch('/api/scan-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64Image,
          patientName: patient.name,
          patientAge: patient.age,
          patientDiseases: patient.diseases,
          filename: filename
        })
      });

      if (!response.ok) {
        let errMsg = 'Intelligence scan service returned an invalid status code.';
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }

      const result = await response.json();

      const newReport: Omit<LabReport, 'id'> = {
        patientId: patient.id,
        systolic: result.systolic !== undefined && result.systolic !== null ? Number(result.systolic) : null,
        diastolic: result.diastolic !== undefined && result.diastolic !== null ? Number(result.diastolic) : null,
        sugar: result.sugar !== undefined && result.sugar !== null ? Number(result.sugar) : null,
        sugarType: result.sugarType || null,
        temperature: result.temperature !== undefined && result.temperature !== null ? Number(result.temperature) : null,
        heartRate: result.heartRate !== undefined && result.heartRate !== null ? Number(result.heartRate) : null,
        consultationNeeded: !!result.consultationNeeded,
        aiAssessment: result.aiAssessment || 'Clinical metrics extracted successfully.',
        createdByPhone: userPhone,
        createdAt: new Date().toISOString(),
        extractedDiagnosis: result.extractedDiagnosis || "Diagnostics Compiled",
        clinicalSeverity: result.clinicalSeverity || "stable",
        detectedDiseases: Array.isArray(result.detectedDiseases) ? result.detectedDiseases : ["General Screening Summary"]
      };

      await addDoc(collection(db, 'patients', patient.id, 'labReports'), newReport);

      // Auto Disease Predictor Sync: Append newly predicted pathological conditions to patient's baseline diseases profile
      if (result.extractedDiagnosis && result.extractedDiagnosis !== "Diagnostics Compiled") {
        const currentDiseases = patient.diseases || "";
        const cleanCurrent = currentDiseases.toLowerCase().trim();
        const extractedLower = result.extractedDiagnosis.toLowerCase().trim();
        
        let needsUpdate = false;
        let updatedDiseases = currentDiseases;

        if (cleanCurrent === "none diagnosed" || cleanCurrent === "none specified" || cleanCurrent === "none" || !cleanCurrent) {
          updatedDiseases = result.extractedDiagnosis;
          needsUpdate = true;
        } else if (!cleanCurrent.includes(extractedLower)) {
          updatedDiseases = `${currentDiseases}, ${result.extractedDiagnosis}`;
          needsUpdate = true;
        }

        // Also cross-review any identified key disease tags and append them if missing
        if (Array.isArray(result.detectedDiseases)) {
          for (const d of result.detectedDiseases) {
            const dLower = d.toLowerCase().trim();
            if (
              dLower !== "general screening summary" && 
              dLower !== "general wellness profile" && 
              !updatedDiseases.toLowerCase().includes(dLower)
            ) {
              updatedDiseases = `${updatedDiseases}, ${d}`;
              needsUpdate = true;
            }
          }
        }

        if (needsUpdate) {
          const patientRef = doc(db, 'patients', patient.id);
          await updateDoc(patientRef, { diseases: updatedDiseases });
        }
      }

      setSelectedFileName(null);
      setIsFeeding(false);

    } catch (err: any) {
      console.error(err);
      if (err instanceof Error && !err.message.includes('permission') && !err.message.includes('auth')) {
        setFormError('Automatic report feed parsing failed: ' + err.message);
      } else {
        try {
          handleFirestoreError(err, OperationType.WRITE, `patients/${patient.id}/labReports`);
        } catch (e: any) {
          setFormError('Automatic report feed parsing failed: ' + e.message);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Patient Background Diagnoses Info Banner */}
      <div className="glass-card-dark bg-gradient-to-br from-[#0F2D24] to-[#061A14] border border-[#10B981]/50 rounded-2xl p-4 sm:p-6 text-white shadow-[0_20px_45px_rgba(0,0,0,0.15)] relative overflow-hidden">
        <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-[0.03]">
          <Activity className="w-32 h-32 sm:w-48 sm:h-48 text-[#10B981]" />
        </div>
        <div className="relative z-10 space-y-3 sm:space-y-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#10B981] font-mono bg-white/5 px-2 py-0.5 rounded border border-[#10B981]/30">
              Baseline Medical Profile Background
            </span>
            <p className="text-base sm:text-xl font-bold font-serif tracking-tight text-[#D1EBE1] mt-2 leading-snug">
              {patient.diseases || 'No chronic diseases specified.'}
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-xs pt-3.5 border-t border-[#10B981]/20">
            <div>
              <span className="text-slate-400 block mb-0.5 font-mono uppercase text-[9px] tracking-wider">Patient Name</span>
              <span className="font-semibold text-slate-200">{patient.name}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5 font-mono uppercase text-[9px] tracking-wider">Demographics</span>
              <span className="font-semibold text-slate-200">{patient.age} yrs • {patient.gender}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5 font-mono uppercase text-[9px] tracking-wider font-medium">Primary Caregiver</span>
              <span className="font-semibold text-slate-200">{patient.caretakerName}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5 font-mono uppercase text-[9px] tracking-wider font-semibold">Active Sync Nodes</span>
              <span className="font-semibold text-[#10B981]">{patient.familyPhones.length} Authorized</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="space-y-0.5">
          <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-tight font-sans uppercase">LABORATORY FEEDS & DIAGNOSTICS</h2>
          <p className="text-[11px] sm:text-xs text-slate-450 font-normal font-sans">Upload a lab report photo or PDF document to parse and feed clinical state automatically.</p>
        </div>
        <div className="flex flex-wrap gap-2.5 w-full sm:w-auto">
          {onTriggerPDFPreview && (
            <button
              onClick={onTriggerPDFPreview}
              className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold rounded-xl text-[#065F46] bg-white border border-[#10B981]/25 hover:bg-emerald-50/50 transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-[#0D9488]" /> Export Overall PDF
            </button>
          )}
          <button
            onClick={() => {
              setIsFeeding(!isFeeding);
              setFormError('');
              setSelectedFileName(null);
            }}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold rounded-xl text-white green-gradient border-t border-white/20 hover:opacity-95 shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
            id="upload-report-toggle-btn"
          >
            {isFeeding ? (
              <>
                <X className="w-3.5 h-3.5 text-white" /> Cancel Ingestion
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5 text-white" /> Ingest Report +
              </>
            )}
          </button>
        </div>
      </div>

      {isFeeding && (
        <div className="glass-card border border-[#10B981]/25 rounded-2xl p-4 sm:p-6 shadow-[0_12px_40px_rgba(6,95,70,0.06)] space-y-4 sm:space-y-5 animate-fade-in">
          <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2 border-b border-[#10B981]/15 pb-2 uppercase tracking-wide font-mono">
            <Upload className="w-4 h-4 text-[#10B981]" /> CLINICAL REPORT INGESTION (PDF OR PHOTO)
          </h3>

          {formError && (
            <div className="p-3.5 bg-rose-50/80 text-rose-900 border border-rose-100 rounded-xl text-xs font-normal font-sans">
              {formError}
            </div>
          )}

          {isLoading ? (
            <div className="py-8 sm:py-12 flex flex-col items-center justify-center space-y-4">
              <div className="relative flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-[#10B981] animate-spin" />
                <FileText className="w-4 h-4 text-[#10B981] absolute" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-[10px] sm:text-[11px] font-extrabold text-[#0D9488] uppercase tracking-widest font-mono animate-pulse">INTELLIGENT REPORT RECOGNITION ACTIVE</p>
                {selectedFileName && (
                  <p className="text-xs text-[#0D9488] font-mono font-bold mt-1">Parsing {selectedFileName}...</p>
                )}
                <p className="text-[10px] sm:text-[11px] text-slate-500 max-w-sm mt-1">Gemini AI is securely reading clinical values and compiling diagnostics details...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`p-6 sm:p-10 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center space-y-3 sm:space-y-4 transition-all duration-300 cursor-pointer ${
                  isDragging
                    ? 'border-[#10B981] bg-[#F0FDF4]/60 shadow-inner scale-[0.99]'
                    : 'border-[#10B981]/25 bg-white/40 hover:bg-[#F0FDF4]/55 hover:border-[#10B981]'
                }`}
                onClick={() => {
                  const fileInput = document.getElementById('report-file-ipc');
                  if (fileInput) fileInput.click();
                }}
              >
                <div className="p-3 sm:p-4 rounded-full shadow-md text-[#10B981] bg-[#F0FDF4] border border-[#10B981]/20 flex items-center justify-center animate-bounce">
                  <FileText className="w-6 h-6 sm:w-8 h-8" />
                </div>
                
                <div className="text-center space-y-1 sm:space-y-1.5 max-w-sm">
                  <p className="text-xs font-extrabold text-[#065F46]">
                    {isDragging ? 'Drop your report here!' : 'Drag & Drop your Lab Report here'}
                  </p>
                  <p className="text-[11px] text-[#047857]">
                    or <span className="text-[#0D9488] hover:text-[#065F46] font-bold underline decoration-dotted">browse files</span> to select a photo (JPEG, PNG, WEBP) or a PDF document
                  </p>
                </div>

                <div className="text-[9px] sm:text-[10px] text-[#0F766E] font-mono uppercase tracking-wider bg-[#F0FDF4] px-3 py-0.5 rounded-full border border-[#10B981]/20 shadow-3xs">
                  Max Size: 10MB • Supports PDF, JPG, PNG, WEBP
                </div>

                <input
                  id="report-file-ipc"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reports Listing */}
      <div className="glass-card rounded-2xl border border-[#10B981]/25 overflow-hidden shadow-[0_12px_35px_rgba(6,95,70,0.04)]">
        <div className="p-3.5 sm:p-4.5 border-b border-[#10B981]/15 bg-[#D1EBE1]/20 flex items-center justify-between backdrop-blur-xs">
          <span className="text-[10px] font-extrabold text-[#0D9488] font-mono uppercase tracking-widest">Diagnostics Timeline Logs</span>
          <span className="px-2.5 py-0.5 text-[9px] bg-[#F0FDF4] border border-[#10B981]/20 text-[#0D9488] font-extrabold rounded-md font-mono shadow-3xs">{reports.length} Logs</span>
        </div>

        {reports.length === 0 ? (
          <div className="p-16 text-center text-slate-450 flex flex-col items-center justify-center space-y-3">
            <Clipboard className="w-10 h-10 text-[#10B981] stroke-[1.5] opacity-50 animate-pulse" />
            <span className="text-sm font-semibold text-slate-800">No report history recorded</span>
            <p className="text-[11px] text-slate-400">Use the scanner above to record baseline weekly labs.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#10B981]/15 bg-white/40 backdrop-blur-md">
            {reports.map((report) => {
              const dateObj = new Date(report.createdAt);
              const formattedDate = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
              const formattedTime = dateObj.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

              return (
                <div key={report.id} className="p-4 sm:p-5 hover:bg-white/50 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-2.5 flex-1">
                      {report.extractedDiagnosis && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[9.5px] font-extrabold text-slate-450 font-mono uppercase tracking-wider bg-slate-50 px-1.5 py-0.5 rounded border border-slate-250/50">
                            Auto Predictor Outcome
                          </span>
                          <span className={`text-xs font-extrabold tracking-tight font-serif px-2.5 py-0.5 rounded-lg border flex items-center gap-1.5 shadow-3xs ${
                            report.clinicalSeverity === 'critical'
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : report.clinicalSeverity === 'warning'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-150/40'
                          }`}>
                            🧬 {report.extractedDiagnosis}
                          </span>
                        </div>
                      )}

                      {report.detectedDiseases && report.detectedDiseases.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {report.detectedDiseases.map((cond, cIdx) => (
                            <span 
                              key={cIdx} 
                              className={`text-[9.5px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-0.5 ${
                                report.clinicalSeverity === 'critical'
                                  ? 'bg-rose-50/45 text-rose-900 border-rose-200/50'
                                  : report.clinicalSeverity === 'warning'
                                  ? 'bg-amber-50/45 text-amber-900 border-amber-200/50'
                                  : 'bg-emerald-50/20 text-emerald-900 border-emerald-250/25'
                              }`}
                            >
                              • {cond}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-1.5">
                        <span className="text-xs font-semibold text-slate-905 font-mono">
                          BP: <span className="text-[#059669] font-bold text-sm">
                            {report.systolic !== null && report.diastolic !== null ? `${report.systolic}/${report.diastolic}` : 'N/A'}
                          </span>{' '}
                          {report.systolic !== null && <span className="text-[9px] text-[#0D9488] uppercase font-mono">mmHg</span>}
                        </span>
                        <div className="text-slate-300">•</div>
                        <span className="text-xs font-semibold text-slate-905 font-mono">
                          Sugar:{' '}
                          <span className="text-[#059669] font-bold text-sm">
                            {report.sugar !== null ? report.sugar : 'N/A'}
                          </span>{' '}
                          {report.sugar !== null && <span className="text-[9px] text-[#0D9488] uppercase font-mono font-bold">mg/dL</span>}{' '}
                          {report.sugar !== null && report.sugarType && (
                            <span className="px-1.5 py-0.5 text-[8px] rounded-sm bg-[#F0FDF4] text-[#065F46] border border-[#10B981]/20 uppercase tracking-widest font-extrabold ml-1">
                              {report.sugarType}
                            </span>
                          )}
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs text-slate-500 pt-0.5">
                        <span className="flex items-center gap-0.5">
                          <Activity className="w-3.5 h-3.5 text-[#10B981] animate-pulse" /> HR: {report.heartRate !== null ? `${report.heartRate} bpm` : 'N/A'}
                        </span>
                        <span>•</span>
                        <span>Temp: {report.temperature !== null ? `${report.temperature}°F` : 'N/A'}</span>
                        <span>•</span>
                        <span className="font-mono text-[9px] sm:text-[10px] text-[#059669]">C Caregiver: {report.createdByPhone}</span>
                      </div>
                    </div>

                    <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0">
                      {report.consultationNeeded ? (
                        <span className="px-2 py-0.5 text-[8px] font-extrabold bg-rose-50/80 text-rose-900 rounded-md flex items-center gap-1 border border-rose-200 font-mono uppercase tracking-widest">
                          <ShieldAlert className="w-3 h-3 text-rose-500" /> Consultation Required
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[8px] font-extrabold bg-[#F0FDF4] text-[#065F46] rounded-md flex items-center gap-1 border border-[#10B981]/35 font-mono uppercase tracking-widest shadow-3xs">
                          <CheckCircle2 className="w-3 h-3 text-[#10B981]" /> Stable baseline
                        </span>
                      )}
                      
                      <span className="text-[9px] sm:text-[10px] text-[#0D9488] font-medium flex items-center gap-1 font-mono">
                        <Calendar className="w-3 h-3 text-[#10B981]" /> {formattedDate} {formattedTime}
                      </span>
                    </div>
                  </div>

                  {/* Summary Preview Button */}
                  <div className="mt-4 bg-white/50 rounded-xl p-3.5 border border-[#10B981]/15 relative">
                    <h4 className="text-[10px] font-extrabold text-[#0D9488] mb-1 flex items-center gap-1.5 uppercase font-mono tracking-widest">
                      <Clipboard className="w-3.5 h-3.5 text-[#10B981]" /> Medical assessment & clinician logs
                    </h4>
                    
                    {/* Collapsible / expand details */}
                    <div className="text-xs text-slate-650 leading-relaxed font-sans prose max-w-none prose-sm">
                      {report.aiAssessment ? (
                        <div className="whitespace-pre-line text-slate-700">
                          {report.aiAssessment.length > 250 && selectedReport?.id !== report.id ? (
                            <>
                              {report.aiAssessment.substring(0, 250)}...
                              <button
                                onClick={() => setSelectedReport(report)}
                                className="text-[#0D9488] hover:text-[#065F46] font-black ml-1 inline-flex items-center gap-0.5 cursor-pointer hover:underline"
                              >
                                Read full medical analysis →
                              </button>
                            </>
                          ) : (
                            <div>
                              <div>{report.aiAssessment}</div>
                              {selectedReport?.id === report.id && (
                                <button
                                  onClick={() => setSelectedReport(null)}
                                  className="text-[#0369a1] hover:text-[#0284c7] font-extrabold mt-2 text-[10px] block uppercase tracking-widest font-mono hover:underline cursor-pointer"
                                >
                                  Collapse Assessment
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        'Diagnostic report logged successfully without digital assessment markers.'
                      )}
                    </div>
                  </div>

                  {/* SMS Summary Options */}
                  <div className="mt-4 pt-4 border-t border-[#10B981]/15 flex flex-col gap-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider">
                        <MessageSquare className="w-3.5 h-3.5 text-[#10B981]" /> SMS Dispatch Desk
                      </div>
                      <button
                        onClick={() => {
                          if (activeSmsReportId === report.id) {
                            setActiveSmsReportId(null);
                            setSmsStatus(null);
                          } else {
                            setActiveSmsReportId(report.id);
                            setSmsPhone('');
                            setSmsStatus(null);
                          }
                        }}
                        className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                          activeSmsReportId === report.id
                            ? 'bg-[#10B981]/10 text-[#065F46] border-[#10B981]/30'
                            : 'bg-white hover:bg-[#F0FDF4] text-[#0D9488] border-[#10B981]/20 hover:border-[#10B981]/40'
                        }`}
                      >
                        <Smartphone className="w-3.5 h-3.5 animate-pulse" />
                        {activeSmsReportId === report.id ? 'Hide SMS Options' : 'Send Summary via SMS'}
                      </button>
                    </div>

                    {activeSmsReportId === report.id && (
                      <div className="bg-[#F0FDF4]/50 border border-[#10B981]/20 rounded-xl p-4 space-y-4 shadow-2xs animate-fade-in text-xs">
                        <div className="space-y-1">
                          <span className="text-[9px] font-extrabold text-[#0D9488] font-mono uppercase tracking-wider block">1. Select Target Recipient Node</span>
                          <div className="flex flex-wrap gap-2 pt-1 font-mono">
                            {patient.familyPhones.map((phone, fidx) => (
                              <button
                                key={fidx}
                                type="button"
                                onClick={() => {
                                  setSmsPhone(phone);
                                  setSmsStatus(null);
                                }}
                                className={`px-3 py-1.5 rounded-lg border text-[10px] transition-all cursor-pointer ${
                                  smsPhone === phone
                                    ? 'bg-gradient-to-r from-[#0D9488] to-[#10B981] text-white border-[#10B981]/50 font-bold shadow-xs'
                                    : 'bg-white hover:bg-[#D1EBE1]/30 text-slate-700 border-slate-200'
                                }`}
                              >
                                Slot {fidx + 1}: {phone}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label htmlFor={`custom-phone-${report.id}`} className="text-[9px] font-extrabold text-[#0D9488] font-mono uppercase tracking-wider block">
                            2. Or Specify Custom Recipient Phone Number
                          </label>
                          <div className="flex gap-2">
                            <div className="relative flex-1 shadow-2xs rounded-xl">
                              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-450 text-xs pointer-events-none">
                                <Smartphone className="w-3.5 h-3.5 text-[#10B981]" />
                              </span>
                              <input
                                id={`custom-phone-${report.id}`}
                                type="tel"
                                placeholder="Enter with country code, e.g. 447123456789"
                                value={smsPhone}
                                onChange={(e) => {
                                  setSmsPhone(e.target.value.replace(/[^\d+]/g, ''));
                                  setSmsStatus(null);
                                }}
                                className="block w-full text-xs font-mono pl-9 pr-3 py-2 border border-slate-200 focus:border-[#10B981] bg-white rounded-xl focus:outline-none focus:ring-1 focus:ring-[#10B981] text-slate-800"
                              />
                            </div>
                            <button
                              disabled={isSendingSms || !smsPhone.trim()}
                              onClick={() => handleSendSMS(report, smsPhone)}
                              className="px-4 py-2 border-t border-white/20 text-xs text-white font-bold rounded-xl green-gradient hover:opacity-95 shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0 transition-all active:scale-[0.98]"
                            >
                              {isSendingSms ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  Sending...
                                </>
                              ) : (
                                <>
                                  <Send className="w-3.5 h-3.5 text-white" />
                                  Send SMS
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {smsStatus && (
                          <div className={`p-4 rounded-xl text-xs border leading-relaxed shadow-3xs ${
                            smsStatus.success 
                              ? 'bg-emerald-50 text-emerald-950 border-emerald-200 animate-fade-in' 
                              : 'bg-rose-50 text-rose-950 border-rose-200 animate-fade-in'
                          }`}>
                            <div className="flex gap-2 items-start font-sans">
                              <span className="text-sm">{smsStatus.success ? '✅' : '⚠️'}</span>
                              <div className="flex-1 space-y-2">
                                <p className="font-extrabold text-xs">
                                  {smsStatus.success 
                                    ? smsStatus.simulated 
                                      ? 'SMS Compiled & Simulated Securely' 
                                      : 'SMS Dispatched & Sent Successfully' 
                                    : 'Failed to Send SMS'}
                                </p>
                                {smsStatus.success && smsStatus.simulated && (
                                  <p className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-2.5 text-[10px] font-normal leading-normal font-sans">
                                    <strong>Sandbox Mode Active:</strong> Twilio client API key not yet detected in server-side secrets config. The server fell back to sandbox validation mode, compiling the output text exactly as it would appear on a mobile device. Configure <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code>, and <code>TWILIO_PHONE_NUMBER</code> in user settings to connect your real Twilio gateway.
                                  </p>
                                )}
                                {smsStatus.error && <p className="font-mono text-[11px] text-rose-750 bg-rose-50/50 p-2 rounded border border-rose-100">{smsStatus.error}</p>}
                                
                                {smsStatus.success && (
                                  <div className="mt-3 bg-slate-900 text-emerald-400 rounded-xl p-4 font-mono text-[11px] border border-slate-800 shadow-md max-w-sm">
                                    <div className="text-[8px] tracking-widest text-slate-450 font-sans font-extrabold uppercase select-none border-b border-slate-800 pb-1.5 mb-2 flex items-center justify-between">
                                      <span>INCOMING SMS Preview</span>
                                      <span className="text-emerald-500 font-bold">To: {smsStatus.recipient}</span>
                                    </div>
                                    <div className="whitespace-pre-line leading-relaxed text-slate-100 font-sans font-medium text-xs">
                                      {smsStatus.message}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Full Modal Viewer for assessment details */}
      {selectedReport && (
        <div className="fixed inset-0 bg-[#061A14]/40 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="glass-container rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-[#10B981]/45 flex flex-col max-h-[85vh] bg-white/95">
            <div className="flex items-center justify-between border-b border-[#10B981]/20 pb-3 mb-4">
              <h3 className="font-serif font-bold text-[#065F46] text-sm tracking-widest uppercase">Full AI Diagnostics Assessment</h3>
              <button
                onClick={() => setSelectedReport(null)}
                className="text-[#0D9488] hover:text-[#065F46] font-extrabold text-[10px] bg-[#F0FDF4] hover:bg-[#D1EBE1]/30 border border-[#10B981]/20 px-3 py-1.5 rounded-lg active:scale-95 font-mono cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs text-slate-700 leading-relaxed max-w-none">
              <div className="bg-[#F0FDF4] p-4 rounded-xl border border-[#10B981]/20 grid grid-cols-2 gap-3 mb-2 font-mono shadow-3xs">
                <div>
                  <span className="text-[#0D9488] block text-[9px] uppercase tracking-wider">Blood Pressure</span>
                  <span className="font-extrabold text-slate-800 text-xs">
                    {selectedReport.systolic !== null && selectedReport.diastolic !== null 
                      ? `${selectedReport.systolic}/${selectedReport.diastolic} mmHg` 
                      : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[#0D9488] block text-[9px] uppercase tracking-wider">Blood Glucose</span>
                  <span className="font-extrabold text-slate-800 text-xs">
                    {selectedReport.sugar !== null 
                      ? `${selectedReport.sugar} mg/dL ${selectedReport.sugarType ? `(${selectedReport.sugarType})` : ''}` 
                      : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[#0D9488] block text-[9px] uppercase tracking-wider">Temperature</span>
                  <span className="font-extrabold text-slate-800 text-xs">
                    {selectedReport.temperature !== null ? `${selectedReport.temperature}°F` : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[#0D9488] block text-[9px] uppercase tracking-wider">Heart Rate</span>
                  <span className="font-extrabold text-slate-800 text-xs">
                    {selectedReport.heartRate !== null ? `${selectedReport.heartRate} bpm` : 'N/A'}
                  </span>
                </div>
              </div>

              <div className="whitespace-pre-line font-sans leading-relaxed text-xs text-slate-700 p-1 bg-white/40 rounded-lg">
                {selectedReport.aiAssessment}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
