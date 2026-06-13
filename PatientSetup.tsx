import React, { useState } from 'react';
import { User, Phone, Clipboard, Heart, Loader2, Users } from 'lucide-react';
import { doc, collection, setDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Patient } from '../types';

interface PatientSetupProps {
  onPatientLoaded: (patient: Patient, userPhone: string) => void;
}

export default function PatientSetup({ onPatientLoaded }: PatientSetupProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'autoreg'>('login');
  const [phoneNumberInput, setPhoneNumberInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Register state
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('Male');
  const [diseases, setDiseases] = useState('');
  const [caretakerName, setCaretakerName] = useState('');
  const [phones, setPhones] = useState<string[]>(['', '', '', '']);

  // Autoreg / Smart lab scanner state
  const [caregiverNameAutoreg, setCaregiverNameAutoreg] = useState('');
  const [autoregPhones, setAutoregPhones] = useState<string[]>(['', '', '', '']);
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [reportFileName, setReportFileName] = useState('');
  const [reportBase64, setReportBase64] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);

  const handlePhoneChange = (index: number, val: string) => {
    const updated = [...phones];
    updated[index] = val.replace(/\D/g, ''); // standard digits validation
    setPhones(updated);
  };

  const handleAutoregPhoneChange = (index: number, val: string) => {
    const updated = [...autoregPhones];
    updated[index] = val.replace(/\D/g, ''); // standard digits validation
    setAutoregPhones(updated);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const sanitizedPhone = phoneNumberInput.trim().replace(/\D/g, '');
    if (!sanitizedPhone || sanitizedPhone.length < 8) {
      setErrorMsg('Please enter a valid phone number.');
      return;
    }

    setIsLoading(true);
    try {
      const q = query(collection(db, 'patients'), where('familyPhones', 'array-contains', sanitizedPhone));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        setErrorMsg('No active patient record matches this family phone number. If this is your first time setting up, please register your patient below.');
        setIsLoading(false);
        return;
      }

      const docSnap = querySnapshot.docs[0];
      const patientData = docSnap.data() as Patient;
      patientData.id = docSnap.id;
      
      // Store in localStorage
      localStorage.setItem('paired_patient_id', patientData.id);
      localStorage.setItem('currentUserPhone', sanitizedPhone);
      
      onPatientLoaded(patientData, sanitizedPhone);
    } catch (err) {
      console.error(err);
      setErrorMsg('Database synchronization failed. Please verify internet access and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim()) return setErrorMsg('Patient Name is required.');
    if (!age || Number(age) <= 0) return setErrorMsg('Please enter a valid Patient Age.');
    if (!caretakerName.trim()) return setErrorMsg('Primary Caretaker Name is required.');

    const filledPhones = phones.map(p => p.trim()).filter(Boolean);
    if (filledPhones.length < 4) {
      return setErrorMsg('You must provide at least 4 family member phone numbers to ensure shared monitoring.');
    }

    // validate length
    for (const ph of filledPhones) {
      if (ph.length < 8) {
        return setErrorMsg(`The phone number "${ph}" is too short. Please use standard format.`);
      }
    }

    setIsLoading(true);
    try {
      const patientId = 'pat_' + Math.random().toString(36).substring(2, 11);
      
      // Select the first family phone as the registered phone of the current creator
      const creatorPhone = filledPhones[0];

      const newPatient: Patient = {
        id: patientId,
        name: name.trim(),
        age: Number(age),
        gender,
        diseases: diseases.trim() || 'None diagnosed',
        caretakerName: caretakerName.trim(),
        familyPhones: filledPhones,
        createdAt: new Date().toISOString()
      };

      // Set in Firebase
      await setDoc(doc(db, 'patients', patientId), newPatient);

      localStorage.setItem('paired_patient_id', patientId);
      localStorage.setItem('currentUserPhone', creatorPhone);

      onPatientLoaded(newPatient, creatorPhone);
    } catch (err: any) {
      try {
        handleFirestoreError(err, OperationType.CREATE, 'patients');
      } catch (wrapperErr: any) {
        setErrorMsg('Failed to register patient profile: ' + wrapperErr.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelection(file);
    }
  };

  const handleFileSelection = (file: File) => {
    setErrorMsg('');
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setErrorMsg('Unsupported file format. Please upload an image (JPEG, PNG, WEBP) or a PDF report.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('The selected file size exceeds the 10MB limit.');
      return;
    }

    setReportFileName(file.name);
    setReportFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setReportBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAutoRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedCaretaker = caregiverNameAutoreg.trim();
    if (!trimmedCaretaker) return setErrorMsg('Primary Caregiving Parent/Caretaker Name is required.');
    
    const filledPhones = autoregPhones.map(p => p.trim()).filter(Boolean);
    if (filledPhones.length < 4) {
      return setErrorMsg('You must provide at least 4 family member phone numbers to ensure shared monitoring.');
    }

    // validate length
    for (const ph of filledPhones) {
      if (ph.length < 8) {
        return setErrorMsg(`The phone number "${ph}" is too short. Please use standard format.`);
      }
    }

    if (!reportBase64) {
      return setErrorMsg('Please select or upload a lab report image or PDF.');
    }

    setIsLoading(true);
    try {
      // 1. Submit scan to server side OCR and intelligence
      const response = await fetch('/api/scan-onboarding-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: reportBase64, filename: reportFileName })
      });

      if (!response.ok) {
        let errMsg = 'The lab report processor returned an unexpected code.';
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }

      const parsed = await response.json();

      // 2. Setup standard 4 family members.
      const baseNumStr = filledPhones[0];
      const familyPhones = filledPhones;

      // 3. Build patient document
      const patientId = 'pat_' + Math.random().toString(36).substring(2, 11);
      const newPatient: Patient = {
        id: patientId,
        name: parsed.patientName || 'Anonymous Patient',
        age: parsed.patientAge || 35,
        gender: parsed.patientGender || 'Male',
        diseases: parsed.detectedDiseases ? parsed.detectedDiseases.join(', ') : (parsed.extractedDiagnosis || 'Baseline Lab Scan Ingestion'),
        caretakerName: trimmedCaretaker,
        familyPhones: familyPhones,
        createdAt: new Date().toISOString()
      };

      // 4. Set patient profile on Firestore
      await setDoc(doc(db, 'patients', patientId), newPatient);

      // 5. Store parsed lab report instantly in Firestore nesting labReports
      const reportId = 'rep_' + Math.random().toString(36).substring(2, 11);
      const newReport = {
        patientId,
        systolic: parsed.systolic !== undefined && parsed.systolic !== null ? parsed.systolic : null,
        diastolic: parsed.diastolic !== undefined && parsed.diastolic !== null ? parsed.diastolic : null,
        sugar: parsed.sugar !== undefined && parsed.sugar !== null ? parsed.sugar : null,
        sugarType: parsed.sugarType || null,
        temperature: parsed.temperature !== undefined && parsed.temperature !== null ? parsed.temperature : null,
        heartRate: parsed.heartRate !== undefined && parsed.heartRate !== null ? parsed.heartRate : null,
        consultationNeeded: typeof parsed.consultationNeeded === 'boolean' ? parsed.consultationNeeded : true,
        aiAssessment: parsed.aiAssessment || 'Setup diagnostic complete.',
        createdByPhone: baseNumStr,
        createdAt: new Date().toISOString(),
        extractedDiagnosis: parsed.extractedDiagnosis || 'Lab Scan Ingestion',
        clinicalSeverity: parsed.clinicalSeverity || 'stable',
        detectedDiseases: parsed.detectedDiseases || ['Ingested Baseline']
      };

      await setDoc(doc(db, 'patients', patientId, 'labReports', reportId), newReport);

      // 6. Complete paired storage
      localStorage.setItem('paired_patient_id', patientId);
      localStorage.setItem('currentUserPhone', baseNumStr);

      onPatientLoaded(newPatient, baseNumStr);

    } catch (err: any) {
      console.error(err);
      if (err instanceof Error && !err.message.includes('permission') && !err.message.includes('auth')) {
        setErrorMsg('Patient profile setup failed: ' + err.message);
      } else {
        try {
          handleFirestoreError(err, OperationType.CREATE, 'patients');
        } catch (wrapperErr: any) {
          setErrorMsg('Failed to process lab scan onboarding: ' + wrapperErr.message);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F4FAF8] via-[#E3F6EE] to-[#CFEDE0] flex flex-col justify-center py-6 sm:py-12 px-4 sm:px-6 lg:px-8 font-sans antialiased relative overflow-hidden">
      
      {/* Absolute Luxury Jade & Soft Mint Glass Orbs */}
      <div className="absolute top-[-120px] left-[-150px] w-[550px] h-[550px] rounded-full bg-gradient-to-tr from-[#10B981] to-[#047857] opacity-[0.25] blur-[125px] pointer-events-none animate-pulse-halo" style={{ animationDuration: '7s' }}></div>
      <div className="absolute bottom-[-150px] right-[-150px] w-[600px] h-[600px] rounded-full bg-gradient-to-bl from-[#059669] to-[#0f172a] opacity-[0.18] blur-[140px] pointer-events-none"></div>
      <div className="absolute top-[25%] right-[-100px] w-[450px] h-[450px] rounded-full bg-[#A7F3D0] opacity-[0.2] blur-[130px] pointer-events-none animate-float-soothing"></div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10 animate-float-soothing">
        <div className="flex justify-center">
          <div className="p-3 green-gradient text-white rounded-2xl shadow-xl border border-[#10B981]/30 animate-pulse-halo">
            <Heart className="w-6 h-6 sm:w-8 sm:h-8 animate-heartbeat" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-[10px] sm:text-xs font-serif font-bold tracking-widest text-[#0F766E] uppercase">
          M E D I C U R E X
        </h2>
        <h3 className="mt-1 text-center text-lg sm:text-2xl font-extrabold tracking-tight text-slate-900">
          Clinical Portal & Vitals Ingestion
        </h3>
        <p className="mt-1 text-center text-[11px] sm:text-xs text-[#0F766E]/80 font-medium">
          Collaborative Health Diagnostics & Shared Medication Network
        </p>
      </div>

      <div className="mt-6 sm:mt-8 sm:mx-auto sm:w-full sm:max-w-lg relative z-10">
        <div className="glass-container py-6 px-4 sm:py-8 sm:px-10 border border-[#10B981]/30 rounded-2xl sm:rounded-3xl shadow-[0_20px_50px_rgba(6,95,70,0.08)] backdrop-blur-md">
          
          <div className="flex bg-[#D1EBE1]/40 p-1 rounded-xl border border-[#10B981]/20 mb-6 backdrop-blur-xs gap-1">
            <button
              onClick={() => { setMode('login'); setErrorMsg(''); }}
              className={`flex-1 py-1.5 sm:py-2 text-center font-bold rounded-lg text-[10px] sm:text-xs transition-all duration-300 cursor-pointer ${
                mode === 'login'
                  ? 'bg-gradient-to-r from-[#0D9488] to-[#10B981] text-white shadow-sm'
                  : 'text-[#065F46] hover:text-[#047857]'
              }`}
            >
              Sign In (Caretaker)
            </button>
            <button
              onClick={() => { setMode('register'); setErrorMsg(''); }}
              className={`flex-1 py-1.5 sm:py-2 text-center font-bold rounded-lg text-[10px] sm:text-xs transition-all duration-300 cursor-pointer ${
                mode === 'register'
                  ? 'bg-gradient-to-r from-[#0D9488] to-[#10B981] text-white shadow-sm'
                  : 'text-[#065F46] hover:text-[#047857]'
              }`}
            >
              Setup Manually
            </button>
            <button
              onClick={() => { setMode('autoreg'); setErrorMsg(''); }}
              className={`flex-1 py-1.5 sm:py-2 text-center font-bold rounded-lg text-[10px] sm:text-xs transition-all duration-300 cursor-pointer flex items-center justify-center gap-1 ${
                mode === 'autoreg'
                  ? 'bg-gradient-to-r from-[#0D9488] to-[#10B981] text-white shadow-sm'
                  : 'text-[#065F46] hover:text-[#047857]'
              }`}
            >
              <span>🪄</span> Instant Scan Setup
            </button>
          </div>

          {errorMsg && (
            <div className="mb-5 p-3.5 bg-rose-50/80 text-rose-900 rounded-xl text-xs border border-rose-100 flex items-start gap-2 leading-relaxed">
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label htmlFor="login-phone" className="block text-[9px] font-bold text-[#0F766E] uppercase tracking-widest mb-1.5 font-mono">
                  Registered Family Phone Number
                </label>
                <div className="mt-1 relative rounded-xl shadow-2xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Phone className="h-4 w-4 text-[#10B981]" />
                  </div>
                  <input
                    type="tel"
                    id="login-phone"
                    required
                    value={phoneNumberInput}
                    onChange={(e) => setPhoneNumberInput(e.target.value)}
                    placeholder="e.g. Enter one of the 4 parent numbers"
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 focus:border-[#10B981] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#10B981] bg-white/55 text-slate-800 placeholder-slate-400 text-xs transition-all"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center py-2.5 px-4 rounded-xl shadow-md text-xs font-bold text-white bg-gradient-to-r from-[#0D9488] to-[#10B981] hover:opacity-95 focus:outline-none focus:ring-1 focus:ring-[#10B981] border-t border-white/20 transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                  id="sign-in-submit"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                       <Loader2 className="w-3.5 h-3.5 animate-spin" /> Aligning Secure Profiles...
                    </span>
                  ) : 'Access Shared Patient Dashboard'}
                </button>
              </div>

              <div className="text-center pt-1">
                <p className="text-[10px] text-slate-500 leading-normal">
                  Authenticating with an authorized phone number immediately loads live diagnostics data, weekly doctor checks, and the pharmaceutical alarm desk.
                </p>
              </div>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-6">
              <h3 className="text-xs font-bold text-[#0F766E] uppercase tracking-widest border-l-2 border-[#10B981] pl-2 font-mono">
                1. Patient Demographics & Baseline Vitals
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="reg-name" className="block text-[10px] font-bold text-slate-600 uppercase font-mono">
                    Patient Name
                  </label>
                  <input
                    type="text"
                    id="reg-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Johnathan Doe"
                    className="mt-1 block w-full px-3 py-2 border border-slate-200 focus:border-[#10B981] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#10B981] text-slate-800 text-xs bg-white/55"
                  />
                </div>

                <div>
                  <label htmlFor="reg-age" className="block text-[10px] font-bold text-slate-600 uppercase font-mono">
                    Patient Age
                  </label>
                  <input
                    type="number"
                    id="reg-age"
                    required
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="Age in years"
                    className="mt-1 block w-full px-3 py-2 border border-slate-200 focus:border-[#10B981] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#10B981] text-slate-800 text-xs bg-white/55"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="reg-gender" className="block text-[10px] font-bold text-slate-600 uppercase font-mono">
                    Gender
                  </label>
                  <select
                    id="reg-gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-slate-200 bg-white/70 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#10B981] text-slate-855 text-xs focus:ring-[#10B981]"
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="reg-caretaker" className="block text-[10px] font-bold text-slate-600 uppercase font-mono">
                    Primary Caregiver Name
                  </label>
                  <input
                    type="text"
                    id="reg-caretaker"
                    required
                    value={caretakerName}
                    onChange={(e) => setCaretakerName(e.target.value)}
                    placeholder="e.g. Caregiver Name"
                    className="mt-1 block w-full px-3 py-2 border border-slate-200 focus:border-[#10B981] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#10B981] text-slate-800 text-xs bg-white/55"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reg-diseases" className="block text-[10px] font-bold text-slate-600 uppercase font-mono">
                  Primary diagnosed chronic diseases (If None, Enter 'None')
                </label>
                <input
                  type="text"
                  id="reg-diseases"
                  value={diseases}
                  onChange={(e) => setDiseases(e.target.value)}
                  placeholder="e.g. Type 2 Diabetes, Severe hypertension"
                  className="mt-1 block w-full px-3 py-2 border border-slate-200 focus:border-[#10B981] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#10B981] text-slate-800 text-xs bg-white/55"
                />
              </div>

              <div className="pt-2">
                <h3 className="text-xs font-bold text-[#0F766E] uppercase tracking-widest border-l-2 border-[#10B981] pl-2 font-mono">
                  2. Relative Nodes Sync System
                </h3>
                <p className="text-[10px] text-slate-500 mt-1 leading-normal font-normal">
                  Provide 4 active family members. Anyone connecting from their device using these physical numbers can login in real-time, view summaries, and check dosages.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {phones.map((phone, idx) => (
                  <div key={idx}>
                    <label htmlFor={`phone-${idx}`} className="block text-[10px] font-bold text-slate-600 uppercase font-mono">
                      Relative Phone Node #{idx + 1} {idx === 0 ? '(You)' : ''}
                    </label>
                    <div className="mt-1 relative rounded-xl shadow-3xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-450">
                        <Users className="h-3.5 w-3.5 text-[#10B981]" />
                      </div>
                      <input
                        type="tel"
                        id={`phone-${idx}`}
                        required
                        value={phone}
                        onChange={(e) => handlePhoneChange(idx, e.target.value)}
                        placeholder="Format digits only"
                        className="block w-full pl-9 pr-3 py-2 border border-slate-200 focus:border-[#10B981] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#10B981] text-slate-800 text-xs bg-white/55"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center py-2.5 px-4 rounded-xl shadow-md text-xs font-bold text-white bg-gradient-to-r from-[#0D9488] to-[#10B981] hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[#10B981] border-t border-white/20 transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                  id="reg-submit-btn"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Provisioning Secure System...
                    </span>
                  ) : (
                    'Provision Diagnostic Database'
                  )}
                </button>
              </div>
            </form>
          )}

          {mode === 'autoreg' && (
            <form onSubmit={handleAutoRegister} className="space-y-6">
              <div className="bg-[#10B981]/5 border border-[#10B981]/25 p-3.5 rounded-xl text-center space-y-1">
                <p className="text-[11px] font-bold text-[#0D9488] uppercase tracking-wider font-mono">
                  ✨ Instant Onboarding Engine
                </p>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Skip the manual fields! Upload your laboratory picture, Complete Blood Count (CBC) report, or pathological sheet. Our OCR instantly parses patient name, age, gender, and clinical findings.
                </p>
              </div>

              <div>
                <label htmlFor="autoreg-caretaker" className="block text-[10px] font-bold text-slate-600 uppercase font-mono">
                  Primary Caregiver Name
                </label>
                <input
                  type="text"
                  id="autoreg-caretaker"
                  required
                  value={caregiverNameAutoreg}
                  onChange={(e) => setCaregiverNameAutoreg(e.target.value)}
                  placeholder="e.g. Sarah Rashid"
                  className="mt-1 block w-full px-3 py-2.5 border border-slate-200 focus:border-[#10B981] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#10B981] text-slate-800 text-xs bg-white/55"
                />
              </div>

              <div>
                <h3 className="text-xs font-bold text-[#0F766E] uppercase tracking-widest border-l-2 border-[#10B981] pl-2 font-mono">
                  Relative Nodes Sync System
                </h3>
                <p className="text-[10px] text-slate-500 mt-1 leading-normal font-normal">
                  Provide 4 active family members. Node #1 is the primary caregiver/caretaker.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {autoregPhones.map((phone, idx) => (
                  <div key={idx}>
                    <label htmlFor={`autoreg-phone-${idx}`} className="block text-[10px] font-bold text-slate-600 uppercase font-mono">
                      Relative Phone Node #{idx + 1} {idx === 0 ? '(Caretaker)' : ''}
                    </label>
                    <div className="mt-1 relative rounded-xl shadow-3xs">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-450">
                        <Users className="h-3.5 w-3.5 text-[#10B981]" />
                      </div>
                      <input
                        type="tel"
                        id={`autoreg-phone-${idx}`}
                        required
                        value={phone}
                        onChange={(e) => handleAutoregPhoneChange(idx, e.target.value)}
                        placeholder="Format digits only"
                        className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 focus:border-[#10B981] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#10B981] text-slate-800 text-xs bg-white/55"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Upload section with Drag and Drop */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase font-mono mb-2">
                  Select Lab Report Image or PDF (e.g. CBC, Blood Panel)
                </label>
                <div
                  onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleFileSelection(file);
                  }}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                    dragActive 
                      ? 'border-[#10B981] bg-[#10B981]/10' 
                      : reportFileName 
                        ? 'border-emerald-500/50 bg-[#10B981]/5' 
                        : 'border-slate-200 bg-white/40 hover:border-[#10B981]/40'
                  }`}
                >
                  <input
                    type="file"
                    id="autoreg-upload-input"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <label htmlFor="autoreg-upload-input" className="cursor-pointer flex flex-col items-center justify-center gap-2">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
                      <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    {reportFileName ? (
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-emerald-800 break-all">{reportFileName}</p>
                        <p className="text-[10px] text-slate-500 font-medium">File attached successfully. Click or drag to change.</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-700">Drag & drop your file here, or <span className="text-[#0D9488] hover:underline font-extrabold">browse</span></p>
                        <p className="text-[10px] text-slate-400">Supports JPEG, PNG, WEBP, or PDF (Max 10MB)</p>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              {/* Action buttons */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading || !reportBase64}
                  className="w-full flex justify-center py-2.5 px-4 rounded-xl shadow-md text-xs font-bold text-white bg-gradient-to-r from-[#0D9488] to-[#10B981] hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[#10B981] border-t border-white/20 transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning Report & Creating Profile...
                    </span>
                  ) : (
                    '🪄 Run AI Diagnostic Scan & Auto-Setup'
                  )}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
