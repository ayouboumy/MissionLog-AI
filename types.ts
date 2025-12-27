export interface Mission {
  id: string;
  title: string;
  location: string;
  date: string; // ISO Date string YYYY-MM-DD
  finishDate?: string; // ISO Date string YYYY-MM-DD
  startTime?: string; // HH:mm
  finishTime?: string; // HH:mm
  notes: string;
  createdAt: number;
}

export type Language = 'en' | 'ar';

export interface Settings {
  activeTemplateId: string; // 'default' or a custom ID
  customTemplates: Template[];
  language: Language;
}

export interface Template {
  id: string;
  name: string;
  data: string; // Base64 encoded docx
}

export interface AIMagicFillResponse {
  title: string;
  location: string;
  date: string;
  finishDate?: string;
  startTime?: string;
  finishTime?: string;
  notes: string;
}

export interface UserProfile {
  fullName: string;
  profession: string;
  cni: string;
  ppn: string;
}