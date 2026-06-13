import React from 'react';
import { Patient, LabReport, DosageRecord, MedicationSchedule } from '../types';

interface PrintPDFReportProps {
  patient: Patient;
  reports: LabReport[];
  schedules: MedicationSchedule[];
  records: DosageRecord[];
  onClose: () => void;
}

export default function PrintPDFReport({ patient, reports, schedules, records, onClose }: PrintPDFReportProps) {
  const latestReport = reports[0] || null;
  const printDateString = new Date().toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  const triggerPrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-[#061A14]/75 backdrop-blur-md z-50 overflow-y-auto flex items-center justify-center p-4 text-slate-850">
      <div className="glass-card-dark bg-gradient-to-br from-[#0F2D24] via-[#061A14] to-[#030D0A] border border-[#10B981]/50 rounded-2xl w-full max-w-4xl p-6 sm:p-8 shadow-[0_24px_60px_rgba(6,95,70,0.15)] flex flex-col space-y-6 print:bg-white print:text-black print:border-none print:p-0">
        
        {/* Header Action Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#10B981]/25 pb-4 print:hidden font-sans">
          <div>
            <h3 className="text-sm font-extrabold text-[#10B981] uppercase tracking-widest font-mono">Export Clinical Dossier</h3>
            <p className="text-xs text-slate-400">Preview of the authenticated clinical diagnostics. Set destination to "Save as PDF" in your print layout.</p>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-[#10B981]/30 hover:bg-[#10B981]/10 rounded-xl text-xs font-semibold text-slate-300 transition-colors cursor-pointer active:scale-95"
            >
              Dismiss Preview
            </button>
            <button
              onClick={triggerPrint}
              className="px-5 py-2.5 green-gradient text-white rounded-xl text-xs font-black shadow-md transition-colors cursor-pointer active:scale-95 border border-[#10B981]/40"
            >
              Print / Save PDF
            </button>
          </div>
        </div>
 
        {/* PRINT AREA CONTAINER */}
        <div id="print-area" className="bg-white text-slate-850 p-8 border border-[#10B981]/20 rounded-2xl font-sans max-w-none w-full print:border-none print:p-0 shadow-sm">
          
          {/* Diagnostic Lab Header */}
          <div className="flex justify-between items-start border-b border-slate-900 pb-5">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-emerald-600 flex items-center justify-center text-white font-mono text-[10px] font-extrabold print:bg-slate-900 print:text-[#10B981]">✚</div>
                <h1 className="text-lg font-black tracking-widest text-[#111111] uppercase font-mono">Patient Clinical Dossier</h1>
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5 font-mono uppercase tracking-wider">Medicurex Health Network App</p>
            </div>
            
            <div className="text-right text-xs">
               <span className="font-bold text-slate-400 block uppercase tracking-wider text-[9px] font-mono">Dossier Access Token</span>
              <span className="font-mono text-slate-900 font-extrabold uppercase tracking-wide text-xs">{patient.id}</span>
              <span className="text-[9px] text-slate-450 font-mono block mt-1.5">RECORDED: {printDateString}</span>
            </div>
          </div>
 
          {/* Demographic Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 py-6 border-b border-slate-150 text-xs">
            <div>
              <span className="text-[9px] text-slate-450 font-bold uppercase tracking-wider block font-mono mb-0.5">Patient Name</span>
              <span className="text-xs font-extrabold text-slate-900">{patient.name}</span>
            </div>
            <div>
              <span className="text-[9px] text-slate-450 font-bold uppercase tracking-wider block font-mono mb-0.5">Patient Demographics</span>
              <span className="text-xs font-semibold text-slate-850">{patient.age} Yrs • {patient.gender}</span>
            </div>
            <div>
              <span className="text-[9px] text-slate-455 font-bold uppercase tracking-wider block font-mono mb-0.5">Primary Caretaker</span>
              <span className="text-xs font-semibold text-slate-850">{patient.caretakerName}</span>
            </div>
            <div>
              <span className="text-[9px] text-slate-450 font-bold uppercase tracking-wider block font-mono mb-0.5">Authorized Contacts</span>
              <span className="text-[10px] font-mono text-slate-650 block leading-tight">{patient.familyPhones.join(', ')}</span>
            </div>
          </div>
 
          {/* Primary Diseases */}
          <div className="py-4 border-b border-slate-150 bg-slate-50/55 px-4 -mx-4 flex items-center justify-between text-xs">
            <div>
              <span className="text-[9px] text-[#475569] font-bold uppercase tracking-wide block font-mono">Active Disease Registry Markers</span>
              <span className="text-xs font-extrabold text-slate-900">{patient.diseases || 'Nil Diagnosed'}</span>
            </div>
            <span className="text-[8px] text-[#047857] font-mono font-bold uppercase tracking-widest bg-[#F0FDF4] px-2 py-0.5 rounded border border-[#10B981]/20 shadow-3xs">STABLE PROTOCOL</span>
          </div>
 
          {/* Core Vitals Summary Panel (Latest Scores) */}
          <div className="py-6">
            <h2 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest pl-2.5 mb-4 border-l-2 border-slate-900 font-mono">I. Baseline Laboratory Indicators</h2>
            
            {latestReport ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                
                <div className="border border-slate-150 p-3.5 rounded-xl text-center bg-white/50">
                  <span className="text-[9px] text-slate-440 font-bold uppercase tracking-wider block font-mono">Blood Pressure</span>
                  <strong className="text-sm text-slate-900 font-mono block mt-1">
                    {latestReport.systolic !== null && latestReport.diastolic !== null ? (
                      <>
                        {latestReport.systolic}/{latestReport.diastolic} <span className="text-[10px] font-normal text-slate-455">mmHg</span>
                      </>
                    ) : (
                      'N/A'
                    )}
                  </strong>
                  <span className={`text-[8px] tracking-wider uppercase font-extrabold font-mono mt-1.5 inline-block px-1.5 py-0.5 rounded-sm ${
                    latestReport.systolic === null || latestReport.diastolic === null ? 'bg-slate-100 text-slate-600 border border-slate-200' :
                    latestReport.systolic >= 140 || latestReport.systolic <= 90 || latestReport.diastolic >= 90 || latestReport.diastolic <= 60
                      ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  }`}>
                    {latestReport.systolic === null || latestReport.diastolic === null ? 'Absent' :
                     latestReport.systolic >= 140 || latestReport.systolic <= 90 || latestReport.diastolic >= 90 || latestReport.diastolic <= 60 ? 'Abnormal' : 'Stable'}
                  </span>
                </div>
 
                <div className="border border-slate-150 p-3.5 rounded-xl text-center bg-white/50">
                  <span className="text-[9px] text-slate-440 font-bold uppercase tracking-wider block font-mono">Blood Glucose</span>
                  <strong className="text-sm text-slate-900 font-mono block mt-1">
                    {latestReport.sugar !== null ? (
                      <>
                        {latestReport.sugar} <span className="text-[10px] font-normal text-slate-455">mg/dL</span>
                      </>
                    ) : (
                      'N/A'
                    )}
                  </strong>
                  <span className="text-[8px] text-slate-500 font-mono mt-1.5 block uppercase tracking-wider">
                    {latestReport.sugar !== null && latestReport.sugarType ? `(${latestReport.sugarType})` : 'Absent'}
                  </span>
                </div>
 
                <div className="border border-slate-150 p-3.5 rounded-xl text-center bg-white/50">
                  <span className="text-[9px] text-slate-440 font-bold uppercase tracking-wider block font-mono">Body Temp</span>
                  <strong className="text-sm text-slate-900 font-mono block mt-1">
                    {latestReport.temperature !== null ? (
                      <>
                        {latestReport.temperature} <span className="text-[10px] font-normal text-[#10B981]">°F</span>
                      </>
                    ) : (
                      'N/A'
                    )}
                  </strong>
                  <span className={`text-[8px] tracking-wider uppercase font-extrabold font-mono mt-1.5 inline-block px-1.5 py-0.5 rounded-sm ${
                    latestReport.temperature === null ? 'bg-slate-100 text-slate-600 border border-slate-200' :
                    latestReport.temperature >= 100.4 || latestReport.temperature <= 95 ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-[#065F46] border border-emerald-100'
                  }`}>
                    {latestReport.temperature === null ? 'Absent' :
                     latestReport.temperature >= 100.4 || latestReport.temperature <= 95 ? 'Critical' : 'Stable'}
                  </span>
                </div>
 
                <div className="border border-slate-150 p-3.5 rounded-xl text-center bg-white/50">
                  <span className="text-[9px] text-slate-440 font-bold uppercase tracking-wider block font-mono">Resting Heart Rate</span>
                  <strong className="text-sm text-slate-900 font-mono block mt-1">
                    {latestReport.heartRate !== null ? (
                      <>
                        {latestReport.heartRate} <span className="text-[10px] font-normal text-[#10B981]">bpm</span>
                      </>
                    ) : (
                      'N/A'
                    )}
                  </strong>
                  <span className={`text-[8px] tracking-wider uppercase font-extrabold font-mono mt-1.5 inline-block px-1.5 py-0.5 rounded-sm ${
                    latestReport.heartRate === null ? 'bg-slate-100 text-slate-600 border border-slate-200' :
                    latestReport.heartRate >= 100 || latestReport.heartRate <= 55 ? 'bg-rose-55 text-rose-700 border border-rose-100' : 'bg-emerald-50 text-[#065F46] border border-emerald-100'
                  }`}>
                    {latestReport.heartRate === null ? 'Absent' :
                     latestReport.heartRate >= 100 || latestReport.heartRate <= 55 ? 'Warning' : 'Stable'}
                  </span>
                </div>
 
              </div>
            ) : (
              <p className="text-xs text-slate-450 italic">No health parameters recorded in database yet.</p>
            )}
          </div>
 
          {/* Current Doctor urgency */}
          {latestReport && (
            <div className={`p-4.5 rounded-2xl mb-6 flex flex-col justify-center border text-xs ${
              latestReport.consultationNeeded 
                ? 'bg-rose-50 border-rose-200 text-rose-955' 
                : 'bg-emerald-50 border-emerald-200 text-[#065F46]'
            }`}>
              <span className="text-[9px] uppercase font-bold tracking-widest block mb-1 font-mono">Diagnostics Advisor Flag</span>
              <strong className="text-xs font-extrabold tracking-wide">
                {latestReport.consultationNeeded 
                  ? '🚨 REQUISITE ACTION: ESCALATE TO CLINICAL PRACTITIONER FOR VERIFICATION STAT' 
                  : '🟢 ADVISORY SUMMARY: PATIENT METRICS EXCLUDE ESCALATION OUTCOMES.'}
              </strong>
              <div className="text-xs mt-2 text-slate-755 whitespace-pre-line leading-relaxed font-sans border-t pt-2 border-slate-200">
                {latestReport.aiAssessment}
              </div>
            </div>
          )}
 
          {/* Full lab history table */}
          <div className="py-2 font-sans">
            <h2 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest pl-2.5 mb-4 border-l-2 border-slate-900 font-mono">II. Historic Physiology Timeline</h2>
            <table className="min-w-full text-xs text-left text-slate-850 border border-[#10B981]/20 rounded-xl overflow-hidden shadow-xs">
              <thead className="bg-[#F0FDF4] uppercase font-bold text-slate-750 text-[9px] tracking-widest font-mono border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 border-r border-slate-200 text-[#0D9488]">Date Logged</th>
                  <th className="px-4 py-2.5 border-r border-slate-200">Blood Pressure</th>
                  <th className="px-4 py-2.5 border-r border-slate-200">Blood Glucose</th>
                  <th className="px-4 py-2.5 border-r border-slate-200">Temp / Pulse</th>
                  <th className="px-4 py-2.5">Advisory Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-[11px]">
                {reports.slice(0, 10).map((rep) => {
                  const rDate = new Date(rep.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                  return (
                    <tr key={rep.id} className="hover:bg-slate-50/20 font-medium">
                      <td className="px-4 py-2 font-mono text-slate-900 border-r border-slate-200">{rDate}</td>
                      <td className="px-4 py-2 border-r border-slate-150 font-mono">
                        {rep.systolic !== null && rep.diastolic !== null ? `${rep.systolic}/${rep.diastolic} mmHg` : 'N/A'}
                      </td>
                      <td className="px-4 py-2 border-r border-slate-150 font-mono">
                        {rep.sugar !== null ? `${rep.sugar} mg/dL ${rep.sugarType ? `(${rep.sugarType})` : ''}` : 'N/A'}
                      </td>
                      <td className="px-4 py-2 border-r border-slate-150 font-mono">
                        {rep.temperature !== null ? `${rep.temperature}°F` : 'N/A'} / {rep.heartRate !== null ? `${rep.heartRate} bpm` : 'N/A'}
                      </td>
                      <td className={`px-4 py-2 font-mono font-bold text-[9px] tracking-wider uppercase ${rep.consultationNeeded ? 'text-red-700 bg-red-50/25' : 'text-emerald-705 bg-emerald-50/20'}`}>
                        {rep.consultationNeeded ? 'IMMEDIATE CONSULT' : 'STABLE'}
                      </td>
                    </tr>
                  );
                })}
                {reports.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-5 text-center text-slate-400 italic">No laboratory records recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
 
          {/* Today's Dosage records table */}
          <div className="py-6 page-break-before font-sans">
            <h2 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest pl-2.5 mb-4 border-l-2 border-slate-900 font-mono">III. Daily Pharmacology Administration Log</h2>
            <table className="min-w-full text-xs text-left text-slate-850 border border-[#10B981]/25 rounded-xl overflow-hidden shadow-xs animate-fade-in">
              <thead className="bg-[#F0FDF4] uppercase font-bold text-slate-750 text-[9px] tracking-widest font-mono border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 border-r border-slate-200 text-[#0D9488]">Scheduled timeline</th>
                  <th className="px-4 py-2.5 border-r border-slate-200">Medicine Protocol parameters</th>
                  <th className="px-4 py-2.5 border-r border-slate-200">Compliance outcome</th>
                  <th className="px-4 py-2.5">Caretaker Node Signature</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-[11px]">
                {schedules.map((sched) => {
                  const todayRec = records.find(r => r.medicationId === sched.id && r.dateStr === new Date().toISOString().substring(0, 10));
                  return (
                    <tr key={sched.id} className="hover:bg-slate-50/20 font-medium">
                      <td className="px-4 py-2 font-mono text-slate-900 border-r border-slate-200">{sched.time}</td>
                      <td className="px-4 py-2 border-r border-slate-200 font-bold">{sched.name} <span className="font-normal text-slate-450">({sched.dosage})</span></td>
                      <td className="px-4 py-2 border-r border-slate-200">
                        {todayRec ? (
                          todayRec.status === 'given' 
                            ? <span className="text-emerald-700 uppercase font-mono font-bold text-[9px] tracking-wider">● GIVEN</span> 
                            : <span className="text-red-655 uppercase font-mono font-bold text-[9px] tracking-wider">● MISSED</span>
                        ) : (
                          <span className="text-slate-400 italic">PENDING VERIFICATION</span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-slate-600 text-[10px]">
                        {todayRec ? todayRec.markedByPhone : '—'}
                      </td>
                    </tr>
                  );
                })}
                {schedules.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-5 text-center text-slate-400 italic">No active pharmacological parameters today.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Legal Signatures */}
          <div className="mt-20 flex justify-between gap-10 pt-10 border-t border-slate-200 text-xs font-mono">
            <div className="w-48 text-center">
              <div className="border-b border-slate-400 h-8"></div>
              <span className="text-[9px] text-slate-450 uppercase font-bold block mt-1.5">Primary Caretaker Signature</span>
            </div>
            
            <div className="text-right flex flex-col justify-end text-[8px] text-slate-400 italic uppercase tracking-wider font-semibold">
              <span>Electronic Authenticator Security Protocol</span>
              <span>Secure Cloud Synchronised clinical Document</span>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
