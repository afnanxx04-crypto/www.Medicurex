export interface Patient {
  id: string;
  name: string;
  age: number;
  gender: string;
  diseases: string;
  caretakerName: string;
  familyPhones: string[];
  createdAt: any;
}

export interface LabReport {
  id: string;
  patientId: string;
  systolic: number | null;
  diastolic: number | null;
  sugar: number | null;
  sugarType: 'fasting' | 'postprandial' | 'hba1c' | null;
  temperature: number | null;
  heartRate: number | null;
  consultationNeeded: boolean;
  aiAssessment: string;
  createdByPhone: string;
  createdAt: any;
  extractedDiagnosis?: string;
  clinicalSeverity?: 'stable' | 'warning' | 'critical';
  detectedDiseases?: string[];
}

export interface MedicationSchedule {
  id: string;
  patientId: string;
  name: string;
  dosage: string;
  time: string; // e.g. "08:30"
  instructions: string;
  createdAt: any;
}

export interface DosageRecord {
  id: string;
  patientId: string;
  medicationId: string;
  medicationName: string;
  dosage: string;
  scheduledTime: string; // e.g. "08:30"
  dateStr: string; // e.g. "2026-05-29"
  status: 'given' | 'missed' | 'pending';
  markedByPhone: string;
  markedAt: any;
}

export function getLocalDateString(date = new Date()): string {
  const d = new Date(date);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - (offset * 60 * 1000));
  return local.toISOString().substring(0, 10);
}

