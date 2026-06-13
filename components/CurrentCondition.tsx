import React from 'react';
import { ShieldAlert, CheckCircle, Activity, Heart, Thermometer, Droplet, User, PhoneCall, AlertTriangle, FileText, Smartphone } from 'lucide-react';
import { Patient, LabReport, DosageRecord, MedicationSchedule, getLocalDateString } from '../types';

interface CurrentConditionProps {
  patient: Patient;
  reports: LabReport[];
  schedules: MedicationSchedule[];
  records: DosageRecord[];
  onTriggerPDFPreview: () => void;
}

export default function CurrentCondition({ patient, reports, schedules, records, onTriggerPDFPreview }: CurrentConditionProps) {
  const latestReport = reports[0] || null;

  // Compute stats
  const sysVal = latestReport ? latestReport.systolic : null;
  const diaVal = latestReport ? latestReport.diastolic : null;
  const sugarVal = latestReport ? latestReport.sugar : null;
  const sugarType = latestReport ? latestReport.sugarType : null;
  const temperatureVal = latestReport ? latestReport.temperature : null;
  const heartRateVal = latestReport ? latestReport.heartRate : null;

  // Range checks
  const isBpHigh = sysVal !== null && diaVal !== null && (sysVal >= 140 || diaVal >= 90);
  const isBpLow = sysVal !== null && diaVal !== null && (sysVal <= 90 || diaVal <= 60);
  const isBpAbnormal = sysVal !== null && diaVal !== null && (isBpHigh || isBpLow);

  const isSugarAbnormal = sugarVal !== null && (
    sugarType === 'fasting'
      ? (sugarVal >= 130 || sugarVal < 70)
      : sugarType === 'postprandial'
      ? (sugarVal >= 180 || sugarVal < 70)
      : false
  );

  const isTempCritical = temperatureVal !== null && (temperatureVal >= 100.4 || temperatureVal <= 95.0);
  const isHrCritical = heartRateVal !== null && (heartRateVal >= 100 || heartRateVal <= 55);

  const isSeverityCritical = latestReport?.clinicalSeverity === 'critical';
  const isSeverityWarning = latestReport?.clinicalSeverity === 'warning';
  const needsConsultation = latestReport 
    ? (latestReport.consultationNeeded || isSeverityCritical || isSeverityWarning)
    : (isBpAbnormal || isSugarAbnormal || isTempCritical || isHrCritical);

  // Today dosage completion check
  const todayDateStr = getLocalDateString();
  const todayRecords = records.filter(r => r.dateStr === todayDateStr);
  const totalTodayDoseCount = schedules.length;
  const takenTodayCount = todayRecords.filter(r => r.status === 'given').length;
  const missedTodayCount = todayRecords.filter(r => r.status === 'missed').length;

  return (
    <div className="space-y-4 sm:space-y-6 font-sans">
      
      {/* 1. Clinical Status Board */}
      <div className={`rounded-2xl p-4 sm:p-6 border transition-all duration-300 backdrop-blur-md relative overflow-hidden ${
        needsConsultation
          ? 'bg-rose-50/75 border-rose-200 text-slate-900 shadow-[0_6px_25px_rgba(239,68,68,0.04)]'
          : 'bg-white/60 border-[#10B981]/25 text-slate-850 shadow-[0_12px_40px_rgba(6,95,70,0.05)]'
      }`}>
        <div className="absolute top-0 right-0 w-36 h-36 bg-[#D1EBE1] opacity-20 blur-3xl pointer-events-none rounded-full"></div>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-5 relative z-10">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl shrink-0 shadow-md ${
              needsConsultation 
                ? 'bg-rose-600 text-white animate-pulse' 
                : 'green-gradient text-white border border-white/20 animate-pulse-halo'
            }`}>
              {needsConsultation ? <ShieldAlert className="w-5.5 h-5.5 sm:w-6.5 sm:h-6.5" /> : <CheckCircle className="w-5.5 h-5.5 sm:w-6.5 sm:h-6.5 animate-heartbeat" />}
            </div>
            
            <div className="space-y-1 my-auto">
              <span className={`text-[9px] font-extrabold tracking-widest uppercase font-mono px-2 py-0.5 rounded border inline-block animate-pulse ${
                needsConsultation
                  ? 'text-rose-700 bg-rose-100/50 border-rose-300'
                  : 'text-[#0D9488] bg-[#F0FDF4] border-[#10B981]/25'
              }`}>
                Clinical Risk Assessment
              </span>
              <h3 className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 font-serif leading-tight">
                {needsConsultation 
                  ? latestReport?.extractedDiagnosis 
                    ? `ALERT: ${latestReport.extractedDiagnosis.toUpperCase()}`
                    : 'IMMEDIATE MEDICAL CONSULTATION ADVISED'
                  : 'PATIENT IN STABLE HEALTHY CONDITION'}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 leading-relaxed max-w-2xl font-normal mt-0.5">
                {needsConsultation
                  ? latestReport?.extractedDiagnosis
                    ? `Critical findings ingested: ${latestReport.extractedDiagnosis}. Assessment indicates active clinical vigilance is mandatory. Please coordinate immediately with your medical specialists.`
                    : 'Alert: One or more vitals registered from laboratory diagnostics exceed homeostatic criteria. Please verify physical symptomatology and query primary physician.'
                  : 'Reassuring: All core telemetry readings, metabolic trends, and vital signs lie securely within healthy laboratory baseline limits.'}
              </p>
            </div>
          </div>

          <div className="shrink-0 flex gap-2 w-full lg:w-auto mt-1 lg:mt-0">
            <button
              onClick={onTriggerPDFPreview}
              className="w-full lg:w-auto px-4 py-2.5 sm:py-3 green-gradient text-white font-extrabold text-xs rounded-xl shadow-md transition-all duration-200 flex items-center justify-center gap-2 border-t border-white/20 hover:opacity-90 active:scale-95 cursor-pointer"
              id="export-pdf-btn"
            >
              <FileText className="w-4 h-4 text-emerald-100" /> Export Final PDF Profile
            </button>
          </div>
        </div>
      </div>

      {/* 2. Interactive Physiological Meters Grid */}
      <div>
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="text-[9px] sm:text-[10px] font-extrabold text-[#0D9488] uppercase tracking-widest font-mono">Real-time Homeostatic Vitals</h3>
          <span className="text-[8px] sm:text-[9px] font-bold text-[#065F46] bg-[#F0FDF4] border border-[#10B981]/25 px-2 py-0.5 rounded-full font-mono uppercase shadow-3xs">Latest Lab Feed</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          
          {/* BP Gauge */}
          <div className={`glass-card rounded-2xl p-4 sm:p-5 border flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(6,95,70,0.08)] ${isBpAbnormal ? 'border-rose-200 bg-rose-50/10 shadow-[0_3px_10px_rgba(239,68,68,0.02)]' : 'border-[#10B981]/25 hover:border-[#10B981] shadow-[0_4px_20px_rgba(16,185,129,0.02)]'}`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 tracking-wide font-mono uppercase">Blood Pressure</span>
              <Activity className={`w-3.5 sm:w-4.5 h-3.5 sm:h-4.5 ${isBpAbnormal ? 'text-rose-500 animate-pulse' : 'text-[#10B981] animate-pulse'}`} />
            </div>
            <div className="my-2.5 sm:my-4 flex items-baseline">
              {sysVal !== null && diaVal !== null ? (
                <>
                  <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 font-mono leading-none">{sysVal}/{diaVal}</span>
                  <span className="text-[9px] font-bold text-slate-400 ml-1 font-mono uppercase tracking-wider">mmHg</span>
                </>
              ) : (
                <span className="text-lg sm:text-xl font-bold font-mono text-slate-400 leading-none">N/A</span>
              )}
            </div>
            <div className="text-[10px] sm:text-[11px] text-[#065F46] border-t border-emerald-500/10 pt-2.5 font-normal">
              {sysVal !== null && diaVal !== null ? (
                isBpHigh ? (
                  <span className="text-rose-600 font-semibold flex items-center gap-1">⚠️ Hypertension</span>
                ) : isBpLow ? (
                  <span className="text-amber-600 font-semibold flex items-center gap-1">⚠️ Hypotension</span>
                ) : (
                  <span className="text-[#059669] flex items-center gap-1 font-medium">Optimal (~120/80)</span>
                )
              ) : (
                <span className="text-slate-400 font-normal italic">Absent in lab report</span>
              )}
            </div>
          </div>

          {/* Glucose Gauge */}
          <div className={`glass-card rounded-2xl p-4 sm:p-5 border flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(6,95,70,0.08)] ${isSugarAbnormal ? 'border-rose-200 bg-rose-50/10 shadow-[0_3px_10px_rgba(239,68,68,0.02)]' : 'border-[#10B981]/25 hover:border-[#10B981] shadow-[0_4px_20px_rgba(16,185,129,0.02)]'}`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 tracking-wide font-mono uppercase">Blood Sugar {sugarType ? `(${sugarType})` : ''}</span>
              <Droplet className={`w-3.5 sm:w-4.5 h-3.5 sm:h-4.5 ${isSugarAbnormal ? 'text-rose-500 animate-pulse' : 'text-[#10B981]'}`} />
            </div>
            <div className="my-2.5 sm:my-4 flex items-baseline">
              {sugarVal !== null ? (
                <>
                  <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 font-mono leading-none">{sugarVal}</span>
                  <span className="text-[9px] font-bold text-slate-400 ml-1 font-mono uppercase tracking-wider">mg/dL</span>
                </>
              ) : (
                <span className="text-lg sm:text-xl font-bold font-mono text-slate-400 leading-none">N/A</span>
              )}
            </div>
            <div className="text-[10px] sm:text-[11px] text-[#065F46] border-t border-emerald-500/10 pt-2.5 font-normal">
              {sugarVal !== null ? (
                isSugarAbnormal ? (
                  <span className="text-rose-600 font-semibold flex items-center gap-1">⚠️ Out-of-bounds glucose</span>
                ) : (
                  <span className="text-[#059669] flex items-center gap-1 font-medium">Safe therapeutic balance</span>
                )
              ) : (
                <span className="text-slate-400 font-normal italic">Absent in lab report</span>
              )}
            </div>
          </div>

          {/* Temperature Gauge */}
          <div className={`glass-card rounded-2xl p-4 sm:p-5 border flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(6,95,70,0.08)] ${isTempCritical ? 'border-rose-200 bg-rose-50/10 shadow-[0_3px_10px_rgba(239,68,68,0.02)]' : 'border-[#10B981]/25 hover:border-[#10B981] shadow-[0_4px_20px_rgba(16,185,129,0.02)]'}`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 tracking-wide font-mono uppercase">Body Temp</span>
              <Thermometer className={`w-3.5 sm:w-4.5 h-3.5 sm:h-4.5 text-[#10B981] ${isTempCritical ? 'text-rose-500 animate-pulse' : ''}`} />
            </div>
            <div className="my-2.5 sm:my-4 flex items-baseline">
              {temperatureVal !== null ? (
                <>
                  <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 font-mono leading-none">{temperatureVal}</span>
                  <span className="text-[9px] font-bold text-slate-400 ml-1 font-mono uppercase tracking-wider">°F</span>
                </>
              ) : (
                <span className="text-lg sm:text-xl font-bold font-mono text-slate-400 leading-none">N/A</span>
              )}
            </div>
            <div className="text-[10px] sm:text-[11px] text-[#065F46] border-t border-emerald-500/10 pt-2.5 font-normal">
              {temperatureVal !== null ? (
                isTempCritical ? (
                  <span className="text-rose-600 font-semibold flex items-center gap-1">⚠️ Fever hyperthermia</span>
                ) : (
                  <span className="text-[#059669] flex items-center gap-1 font-medium">Optimal core (98.6°F)</span>
                )
              ) : (
                <span className="text-slate-400 font-normal italic">Absent in lab report</span>
              )}
            </div>
          </div>

          {/* HR Gauge */}
          <div className={`glass-card rounded-2xl p-4 sm:p-5 border flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(6,95,70,0.08)] ${isHrCritical ? 'border-rose-200 bg-rose-50/10 shadow-[0_3px_10px_rgba(239,68,68,0.02)]' : 'border-[#10B981]/25 hover:border-[#10B981] shadow-[0_4px_20px_rgba(16,185,129,0.02)]'}`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 tracking-wide font-mono uppercase">Heart Rate</span>
              <Heart className={`w-3.5 sm:w-4.5 h-3.5 sm:h-4.5 text-[#10B981] ${isHrCritical ? 'text-rose-500 animate-pulse' : 'animate-heartbeat'}`} />
            </div>
            <div className="my-2.5 sm:my-4 flex items-baseline">
              {heartRateVal !== null ? (
                <>
                  <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 font-mono leading-none">{heartRateVal}</span>
                  <span className="text-[9px] font-bold text-slate-400 ml-1 font-mono uppercase tracking-wider">bpm</span>
                </>
              ) : (
                <span className="text-lg sm:text-xl font-bold font-mono text-slate-400 leading-none">N/A</span>
              )}
            </div>
            <div className="text-[10px] sm:text-[11px] text-[#065F46] border-t border-emerald-500/10 pt-2.5 font-normal">
              {heartRateVal !== null ? (
                isHrCritical ? (
                  <span className="text-rose-600 font-semibold flex items-center gap-1">⚠️ Out-of-bounds</span>
                ) : (
                  <span className="text-[#059669] flex items-center gap-1 font-medium">Stable coronary rhythm</span>
                )
              ) : (
                <span className="text-slate-400 font-normal italic">Absent in lab report</span>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* 2.5 Active Diagnostics & Pathology Findings Board */}
      {latestReport && (latestReport.extractedDiagnosis || latestReport.detectedDiseases) && (
        <div className={`rounded-2xl p-4 sm:p-5 border transition-all duration-300 backdrop-blur-md relative overflow-hidden ${
          latestReport.clinicalSeverity === 'critical'
            ? 'bg-rose-50/40 border-rose-500/30 text-rose-950 shadow-xs'
            : latestReport.clinicalSeverity === 'warning'
            ? 'bg-amber-50/45 border-amber-500/30 text-amber-950 shadow-2xs'
            : 'bg-emerald-50/20 border-[#10B981]/15 text-slate-900'
        }`}>
          <div className="flex items-center justify-between border-b pb-2.5 mb-3 border-slate-200/50">
            <h4 className="font-extrabold text-[#0D9488] text-xs sm:text-sm flex items-center gap-2 font-serif uppercase tracking-tight">
              <ShieldAlert className={`w-4 h-4 ${latestReport.clinicalSeverity === 'critical' ? 'text-rose-600 animate-pulse' : 'text-amber-500'}`} />
              Active Pathology & Diagnostics Monitor
            </h4>
            <span className={`text-[8px] sm:text-[9.5px]/none font-extrabold font-mono uppercase px-2 py-1 rounded border inline-flex items-center ${
              latestReport.clinicalSeverity === 'critical'
                ? 'bg-rose-600 text-white border-rose-500/40 animate-pulse'
                : latestReport.clinicalSeverity === 'warning'
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-[#10B981] text-white border-emerald-400/40'
            }`}>
              {latestReport.clinicalSeverity?.toUpperCase() || 'UNKNOWN'} SEVERITY FINDING
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <span className="text-[9px] font-extrabold text-slate-400 font-mono uppercase tracking-wider block">Primary Diagnosed Condition</span>
              <p className="text-sm font-black text-slate-900 mt-0.5 font-sans">
                {latestReport.extractedDiagnosis || "Diagnostics Ingested"}
              </p>
            </div>

            {latestReport.detectedDiseases && latestReport.detectedDiseases.length > 0 && (
              <div>
                <span className="text-[9px] font-extrabold text-slate-400 font-mono uppercase tracking-wider block mb-1.5">Identified Bio-Metrics & Pathology Anomalies</span>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {latestReport.detectedDiseases.map((disease, dIdx) => (
                    <span 
                      key={dIdx} 
                      className={`text-[9.5px] font-bold font-mono px-2.5 py-1 rounded-lg border flex items-center gap-1 shadow-2xs ${
                        latestReport.clinicalSeverity === 'critical'
                          ? 'bg-rose-100/50 text-rose-900 border-rose-200'
                          : latestReport.clinicalSeverity === 'warning'
                          ? 'bg-amber-100/50 text-amber-950 border-amber-200'
                          : 'bg-emerald-100/40 text-[#065F46] border-emerald-300/30'
                      }`}
                    >
                      🧬 {disease}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Grid: Shared relatives & Daily pharmacology track */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        
        {/* Sync Relatives Dial Board */}
        <div className="glass-card rounded-2xl border border-[#10B981]/25 p-4 sm:p-5 shadow-[0_12px_35px_rgba(6,95,70,0.04)] space-y-3 sm:space-y-4">
          <div className="border-b border-[#10B981]/15 pb-2.5">
            <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm flex items-center gap-2 font-serif">
              <Smartphone className="w-4 h-4 text-[#10B981]" /> Relatives Live Network Sync
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">Four coordinated relative slots. All updates reflect instantly with offline database persistence backup.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            {patient.familyPhones.map((phone, idx) => (
              <div key={idx} className="flex flex-col justify-between bg-white/40 p-2.5 sm:p-3 rounded-xl border border-[#10B981]/15 hover:bg-white/60 transition-all duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-lg green-gradient text-white font-bold font-mono text-[9px] flex items-center justify-center border border-[#10B981]/20 shadow-2xs">
                      {idx + 1}
                    </div>
                    <span className="text-[9px] font-bold text-[#0D9488] tracking-wide uppercase font-mono">Relative Slot</span>
                  </div>
                  <span className="flex items-center gap-1 bg-[#F0FDF4] px-1.5 py-0.5 rounded-full border border-[#10B981]/20 shadow-3xs">
                    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-[7.5px] text-emerald-700 font-extrabold font-mono tracking-wider">SYNCED</span>
                  </span>
                </div>
                
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-800">{phone}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Daily pharmacology stats */}
        <div className="glass-card rounded-2xl border border-[#10B981]/25 p-4 sm:p-5 shadow-[0_12px_35px_rgba(6,95,70,0.04)] space-y-3 sm:space-y-4">
          <div className="border-b border-[#10B981]/15 pb-2.5">
            <h4 className="font-extrabold text-slate-900 text-xs sm:text-sm flex items-center gap-2 font-serif">
              <Activity className="w-4 h-4 text-[#10B981]" /> Compliance Monitor
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">Continuous reporting of daily pharmacology loops to mitigate omission events and human error.</p>
          </div>

          {totalTodayDoseCount === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 font-mono">
              No daily medication schedules configured yet.
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between text-xs flex-wrap gap-1">
                <span className="font-extrabold text-[#0D9488] font-mono uppercase text-[9px] tracking-wider">Today's Progress</span>
                <span className="font-semibold font-mono text-[#065F46] bg-[#F0FDF4] border border-[#10B981]/20 px-2 py-0.5 rounded-full shadow-3xs text-[10px]">{takenTodayCount} / {totalTodayDoseCount} Administered</span>
              </div>
              
              {/* Progress bar */}
              <div className="w-full bg-[#D1EBE1]/30 h-2.5 rounded-full overflow-hidden border border-[#10B981]/20 p-px">
                <div 
                  className="green-gradient h-full rounded-full transition-all duration-500 shadow-sm" 
                  style={{ width: `${(takenTodayCount / totalTodayDoseCount) * 100}%` }}
                ></div>
              </div>

              {/* Badges */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 text-xs pt-0.5">
                <div className="p-2 sm:p-3 bg-white/40 rounded-xl border border-[#10B981]/15 text-center">
                  <span className="block text-[8px] text-emerald-700 font-extrabold font-mono uppercase tracking-widest">Administered</span>
                  <span className="text-base sm:text-lg font-extrabold text-emerald-800 font-mono leading-none mt-1 inline-block">{takenTodayCount}</span>
                </div>
                <div className="p-2 sm:p-3 bg-white/40 rounded-xl border border-[#10B981]/15 text-center">
                  <span className="block text-[8px] text-[#0D9488] font-extrabold font-mono uppercase tracking-widest">Missed / Unmarked</span>
                  <span className="text-base sm:text-lg font-extrabold text-emerald-950 font-mono leading-none mt-1 inline-block">{missedTodayCount}</span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-[#F0FDF4]/50 border border-[#10B981]/15 p-2.5 sm:p-3.5 rounded-xl text-[10px] text-slate-500 leading-relaxed font-sans">
            <strong className="text-slate-800 font-semibold font-sans">Caregiver Sync Loop: </strong>
            To guarantee real-time oversight, this tracking matrix synchronizes with all caregiver devices. If any logged administrator signs off a metric as administered, it flashes onto sibling devices seamlessly.
          </div>

        </div>

      </div>

    </div>
  );
}
