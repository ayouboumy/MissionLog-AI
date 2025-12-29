import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";
import {
  Calendar,
  MapPin,
  FileText,
  Settings as SettingsIcon,
  Plus,
  Home,
  ChevronLeft,
  ChevronRight,
  Share,
  Download,
  Wand2,
  Search,
  X,
  Mail,
  Loader2,
  Trash2,
  CheckCircle,
  Info,
  ArrowRight,
  Archive,
  Clock,
  ChevronDown,
  User,
  Briefcase,
  Sparkles,
  Globe,
  Smartphone,
  Upload,
  RefreshCw,
  FileCheck,
  Copy,
  Sun,
  Moon,
  Keyboard
} from 'lucide-react';
import { Mission, Settings, Template, UserProfile, Language, BeforeInstallPromptEvent } from './types';
import { DEFAULT_TEMPLATE_BASE64, TRANSLATIONS } from './constants';

// We access these from window because we loaded them via script tags in index.html
declare const PizZip: any;
declare const docxtemplater: any;

// --- Constants & Helper Functions ---

const STORAGE_KEY_MISSIONS = 'missionlog_missions_v1';
const STORAGE_KEY_SETTINGS = 'missionlog_settings_v1';
const STORAGE_KEY_USER_PROFILE = 'missionlog_user_profile_v1';

const generateId = () => Math.random().toString(36).substr(2, 9);

// Safe JSON Parse Wrapper
const safeJsonParse = <T,>(key: string, fallback: T): T => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : fallback;
    } catch (e) {
        console.warn(`Failed to parse ${key}, resetting to default.`);
        return fallback;
    }
};

const formatDate = (dateStr: string, locale: string = 'en-US') => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
};

const formatTime = (timeStr?: string) => {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    if (isNaN(hour)) return timeStr;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
};

const getGreeting = (t: any) => {
    const hour = new Date().getHours();
    if (hour < 12) return t.greetingMorning;
    if (hour < 18) return t.greetingAfternoon;
    return t.greetingEvening;
};

const base64ToArrayBuffer = (base64: string) => {
    // Basic validation
    if (!base64 || base64.length % 4 !== 0) {
        throw new Error("Invalid Base64 string");
    }
    const binaryString = window.atob(base64.replace(/[\s\n\r]/g, ''));
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

/**
 * Robustly loads a template buffer. 
 * Prioritizes custom/default files, but guaranteed to return valid buffer (fallback to internal base64) to prevent crashes.
 */
const getTemplateBuffer = async (settings: Settings): Promise<ArrayBuffer> => {
    // 1. Custom Template
    if (settings.activeTemplateId !== 'default') {
        const custom = settings.customTemplates.find(t => t.id === settings.activeTemplateId);
        if (custom) {
            return base64ToArrayBuffer(custom.data);
        }
    }

    // 2. Default.docx from public folder
    try {
        // Use absolute path to ensure we hit the file in public/
        const response = await fetch('/default.docx');
        const contentType = response.headers.get('content-type');
        
        // Ensure we didn't get the HTML index page back (common in SPA)
        if (response.ok && (!contentType || !contentType.includes('text/html'))) {
            const buffer = await response.arrayBuffer();
            if (buffer.byteLength > 100) { // arbitrary small size check to ensure not empty
                 return buffer;
            }
        }
        console.warn("default.docx fetch failed or returned HTML. Using fallback.");
    } catch (e) {
        console.warn("Network error fetching default.docx. Using fallback.", e);
    }

    // 3. Fallback to internal Base64 (Guaranteed to exist)
    return base64ToArrayBuffer(DEFAULT_TEMPLATE_BASE64);
};

/**
 * Generates a DOCX Blob for a single mission based on settings.
 */
const generateDocxBlob = async (mission: Mission, settings: Settings, userProfile: UserProfile): Promise<Blob | null> => {
    try {
        const PizZip = (window as any).PizZip;
        const Docxtemplater = (window as any).docxtemplater;

        if (!PizZip || !Docxtemplater) {
            alert("Error: PizZip or Docxtemplater libraries not loaded. Please check internet.");
            return null;
        }

        let templateBuffer;
        try {
            templateBuffer = await getTemplateBuffer(settings);
        } catch(e) {
             console.error("Template Buffer Error", e);
             alert("Error loading template file.");
             return null;
        }
        
        let zip;
        // Try to load zip. If custom template is corrupt, fallback to default.
        try {
            zip = new PizZip(templateBuffer);
        } catch (e) {
            console.error("Template corrupt, using fallback", e);
            try {
                templateBuffer = base64ToArrayBuffer(DEFAULT_TEMPLATE_BASE64);
                zip = new PizZip(templateBuffer);
            } catch(fallbackError) {
                alert("Critical Error: Fallback template is also invalid. Please clear browser cache or contact support.");
                return null;
            }
        }

        const data = {
            title: mission.title || "",
            location: mission.location || "",
            date: mission.date || "",
            finishDate: mission.finishDate || mission.date || "",
            startTime: mission.startTime || "",
            finishTime: mission.finishTime || "",
            notes: mission.notes || "",
            fullName: userProfile.fullName || "",
            profession: userProfile.profession || "",
            cni: userProfile.cni || "",
            ppn: userProfile.ppn || ""
        };

        // Pass 1: Handle block conditions {}
        try {
            const doc1 = new Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
                delimiters: {start: '{', end: '}'},
                nullGetter: (part: any) => part.raw || ""
            });
            doc1.render(data);

            // Pass 2: Handle inline variables ()
            const zip2 = new PizZip(doc1.getZip().generate({type: "uint8array"}));
            const doc2 = new Docxtemplater(zip2, {
                paragraphLoop: true,
                linebreaks: true,
                delimiters: {start: '(', end: ')'},
                nullGetter: (part: any) => part.raw || ""
            });
            doc2.render(data);

            return doc2.getZip().generate({
                type: "blob",
                mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            });
        } catch(renderError: any) {
             console.error("Render Error", renderError);
             alert(`Document Generation Error: ${renderError.message}`);
             return null;
        }

    } catch (e: any) {
        console.error("General Generation Error", e);
        alert(`Failed to generate document: ${e.message}`);
        return null;
    }
};

// --- Error Boundary ---

interface ErrorBoundaryProps {
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen p-6 bg-red-50 text-center" style={{ height: '100dvh' }}>
            <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full border border-red-100">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                    <Trash2 size={24} />
                </div>
                <h1 className="text-lg font-bold text-gray-900 mb-2">Something went wrong</h1>
                <p className="text-xs text-gray-500 mb-6 font-mono bg-gray-50 p-2 rounded break-all">{this.state.error?.message}</p>
                
                <button 
                    onClick={() => {
                        localStorage.clear();
                        window.location.reload();
                    }} 
                    className="w-full py-3 bg-red-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-red-500/30 hover:bg-red-700 transition-all"
                >
                    Reset App Data
                </button>
            </div>
        </div>
      );
    }
    // Fix: Cast this to any to avoid "Property 'props' does not exist on type 'ErrorBoundary'" TypeScript error
    return (this as any).props.children;
  }
}

// --- Components ---

const OnboardingView = ({ onSave, settings, onUpdateSettings }: { onSave: (p: UserProfile) => void, settings: Settings, onUpdateSettings: (s: Settings) => void }) => {
    const [form, setForm] = useState<UserProfile>({ fullName: '', profession: '', cni: '', ppn: '' });
    
    // Ensure translation is ready
    const t = TRANSLATIONS[settings.language] || TRANSLATIONS['en'];

    const handleSubmit = () => {
        if (!form.fullName || !form.profession || !form.cni || !form.ppn) {
            alert(t.pleaseFill);
            return;
        }
        onSave(form);
    };

    const toggleLanguage = () => {
        const nextLang = settings.language === 'en' ? 'ar' : 'en';
        onUpdateSettings({...settings, language: nextLang});
    };

    return (
        <div 
            className="h-screen w-full bg-gradient-to-br from-brand-600 to-brand-900 flex flex-col items-center justify-center p-6 text-white animate-in fade-in duration-500 relative overflow-hidden"
            style={{ height: '100dvh' }}
        >
            {/* Abstract Shapes */}
            <div className="absolute top-0 left-0 w-64 h-64 bg-white opacity-5 rounded-full -translate-x-1/2 -translate-y-1/2 blur-3xl"></div>
            <div className="absolute bottom-0 right-0 w-64 h-64 bg-blue-400 opacity-10 rounded-full translate-x-1/2 translate-y-1/2 blur-3xl"></div>

            {/* Language Toggle */}
            <button 
                onClick={toggleLanguage}
                className="absolute top-6 right-6 z-20 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold border border-white/20 hover:bg-white/20 transition-all flex items-center gap-2 rtl:left-6 rtl:right-auto"
            >
                <Globe size={14} />
                {settings.language === 'en' ? 'العربية' : 'English'}
            </button>

            <div className="w-full max-w-sm relative z-10">
                <div className="text-center mb-10">
                    <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-glow border border-white/20">
                         <Sparkles size={40} className="text-white" />
                    </div>
                    <h1 className="text-3xl font-bold mb-2 tracking-tight">MissionLog AI</h1>
                    <p className="text-brand-100 text-sm">{t.welcomeDesc}</p>
                </div>

                <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/20 shadow-2xl space-y-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-brand-100 uppercase tracking-wider ml-1 rtl:mr-1 rtl:ml-0">{t.fullName}</label>
                        <input 
                            type="text"
                            value={form.fullName}
                            onChange={e => setForm({...form, fullName: e.target.value})}
                            className="w-full p-3 rounded-xl bg-black/20 border border-transparent text-white placeholder-white/40 focus:ring-2 focus:ring-brand-400 outline-none transition-all text-start"
                            placeholder={settings.language === 'en' ? "John Doe" : "الاسم الكامل"}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-brand-100 uppercase tracking-wider ml-1 rtl:mr-1 rtl:ml-0">{t.profession}</label>
                        <input 
                            type="text"
                            value={form.profession}
                            onChange={e => setForm({...form, profession: e.target.value})}
                            className="w-full p-3 rounded-xl bg-black/20 border border-transparent text-white placeholder-white/40 focus:ring-2 focus:ring-brand-400 outline-none transition-all text-start"
                            placeholder={settings.language === 'en' ? "Field Engineer" : "مهندس ميداني"}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                         <div className="space-y-1">
                            <label className="text-[10px] font-bold text-brand-100 uppercase tracking-wider ml-1 rtl:mr-1 rtl:ml-0">{t.cni}</label>
                            <input 
                                type="text"
                                value={form.cni}
                                onChange={e => setForm({...form, cni: e.target.value})}
                                className="w-full p-3 rounded-xl bg-black/20 border border-transparent text-white placeholder-white/40 focus:ring-2 focus:ring-brand-400 outline-none transition-all text-start"
                                placeholder={t.idNum}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-brand-100 uppercase tracking-wider ml-1 rtl:mr-1 rtl:ml-0">{t.ppn}</label>
                            <input 
                                type="text"
                                value={form.ppn}
                                onChange={e => setForm({...form, ppn: e.target.value})}
                                className="w-full p-3 rounded-xl bg-black/20 border border-transparent text-white placeholder-white/40 focus:ring-2 focus:ring-brand-400 outline-none transition-all text-start"
                                placeholder={t.passport}
                            />
                        </div>
                    </div>
                    
                    <button 
                        onClick={handleSubmit}
                        className="w-full mt-4 py-4 bg-white text-brand-700 rounded-xl font-bold shadow-lg hover:bg-brand-50 active:scale-[0.98] transition-all"
                    >
                        {t.getStarted}
                    </button>
                </div>
            </div>
        </div>
    );
};

const SettingsView = ({ 
    settings, 
    onUpdate, 
    userProfile, 
    onUpdateProfile, 
    onBack,
    installPrompt,
    onInstall
}: { 
    settings: Settings, 
    onUpdate: (s: Settings) => void, 
    userProfile: UserProfile, 
    onUpdateProfile: (p: UserProfile) => void, 
    onBack: () => void,
    installPrompt: BeforeInstallPromptEvent | null,
    onInstall: () => void
}) => {
    const t = TRANSLATIONS[settings.language];
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = (event.target?.result as string).split(',')[1];
                const newTemplate: Template = {
                    id: generateId(),
                    name: file.name.replace('.docx', ''),
                    data: base64
                };
                
                // Automatically set as active since user likely wants to use it
                onUpdate({
                    ...settings,
                    customTemplates: [newTemplate, ...settings.customTemplates], // Add to top
                    activeTemplateId: newTemplate.id
                });
            };
            reader.readAsDataURL(file);
        }
    };

    const deleteTemplate = (id: string) => {
        onUpdate({
            ...settings,
            customTemplates: settings.customTemplates.filter(t => t.id !== id),
            activeTemplateId: settings.activeTemplateId === id ? 'default' : settings.activeTemplateId
        });
    };

    const activeTemplateName = settings.activeTemplateId === 'default' 
        ? t.defaultTemplate 
        : settings.customTemplates.find(t => t.id === settings.activeTemplateId)?.name || 'Unknown';

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="p-4 border-b border-gray-100 flex items-center gap-3 sticky top-0 bg-white z-10">
                 <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 rtl:rotate-180"><ChevronLeft size={24} /></button>
                 <h1 className="font-bold text-lg">{t.settings}</h1>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-24">
                {/* Install App Banner (Only visible if installable) */}
                {installPrompt && (
                    <section>
                         <div className="bg-gradient-to-r from-brand-600 to-brand-500 p-4 rounded-2xl shadow-lg flex items-center justify-between text-white">
                            <div>
                                <h3 className="font-bold flex items-center gap-2"><Smartphone size={18} /> {t.installApp}</h3>
                                <p className="text-xs text-brand-100 mt-1">Add to home screen for better experience</p>
                            </div>
                            <button 
                                onClick={onInstall}
                                className="bg-white text-brand-600 px-4 py-2 rounded-xl text-xs font-bold shadow hover:bg-brand-50 transition-colors"
                            >
                                Install
                            </button>
                         </div>
                    </section>
                )}

                {/* Report Template */}
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2"><Briefcase size={18} className="text-brand-500" /> {t.templates}</h3>
                    </div>
                    
                    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-brand-500"></div>
                        
                        <div className="flex items-start justify-between mb-4 pl-3 rtl:pl-0 rtl:pr-3">
                            <div>
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Active Template</p>
                                <h4 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                                    <FileCheck size={20} className="text-brand-600" />
                                    {activeTemplateName}
                                </h4>
                            </div>
                            {settings.activeTemplateId !== 'default' && (
                                <button 
                                    onClick={() => onUpdate({...settings, activeTemplateId: 'default'})}
                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Reset to Default"
                                >
                                    <RefreshCw size={18} />
                                </button>
                            )}
                        </div>

                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".docx" className="hidden" />
                        
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-3 bg-gray-50 border border-dashed border-gray-300 rounded-xl text-brand-600 font-bold text-sm hover:bg-brand-50 hover:border-brand-300 transition-all flex items-center justify-center gap-2"
                        >
                            <Upload size={16} />
                            {settings.activeTemplateId === 'default' ? 'Replace Default Template' : 'Upload New Template'}
                        </button>
                    </div>

                    {/* Custom Templates List */}
                    {settings.customTemplates.length > 0 && (
                        <div className="mt-4 space-y-2">
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider pl-1">History</p>
                            {settings.customTemplates.map(tpl => (
                                <div 
                                    key={tpl.id}
                                    onClick={() => onUpdate({...settings, activeTemplateId: tpl.id})}
                                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${settings.activeTemplateId === tpl.id ? 'border-brand-500 bg-brand-50' : 'border-gray-100 bg-gray-50 hover:bg-gray-100'}`}
                                >
                                    <span className={`text-sm font-medium ${settings.activeTemplateId === tpl.id ? 'text-brand-800' : 'text-gray-600'}`}>{tpl.name}</span>
                                    {settings.activeTemplateId !== tpl.id && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); deleteTemplate(tpl.id); }}
                                            className="text-gray-400 hover:text-red-500 p-1.5"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Language */}
                <section>
                    <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><Globe size={18} className="text-brand-500" /> {t.language}</h3>
                    <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                        <button 
                            onClick={() => onUpdate({...settings, language: 'en'})}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${settings.language === 'en' ? 'bg-white shadow text-brand-600' : 'text-gray-500'}`}
                        >
                            English
                        </button>
                        <button 
                            onClick={() => onUpdate({...settings, language: 'ar'})}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${settings.language === 'ar' ? 'bg-white shadow text-brand-600' : 'text-gray-500'}`}
                        >
                            العربية
                        </button>
                    </div>
                </section>

                {/* Profile */}
                <section>
                    <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><User size={18} className="text-brand-500" /> {t.profile}</h3>
                    <div className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                         <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t.fullName}</label>
                            <input type="text" value={userProfile.fullName} onChange={e => onUpdateProfile({...userProfile, fullName: e.target.value})} className="w-full p-2 bg-white rounded-lg border border-gray-200 text-sm" />
                         </div>
                         <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t.profession}</label>
                            <input type="text" value={userProfile.profession} onChange={e => onUpdateProfile({...userProfile, profession: e.target.value})} className="w-full p-2 bg-white rounded-lg border border-gray-200 text-sm" />
                         </div>
                         <div className="grid grid-cols-2 gap-3">
                             <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t.cni}</label>
                                <input type="text" value={userProfile.cni} onChange={e => onUpdateProfile({...userProfile, cni: e.target.value})} className="w-full p-2 bg-white rounded-lg border border-gray-200 text-sm" />
                             </div>
                             <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t.ppn}</label>
                                <input type="text" value={userProfile.ppn} onChange={e => onUpdateProfile({...userProfile, ppn: e.target.value})} className="w-full p-2 bg-white rounded-lg border border-gray-200 text-sm" />
                             </div>
                         </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

// ... CalendarWidget, Dashboard, MissionEditor, MissionDetails remain the same ...

const CalendarWidget = ({ 
    missions, 
    selectedDate, 
    onDateSelect,
    viewDate, 
    onViewDateChange,
    settings
}: { 
    missions: Mission[], 
    selectedDate: string | null, 
    onDateSelect: (d: string | null) => void,
    viewDate: Date,
    onViewDateChange: (d: Date) => void,
    settings: Settings
}) => {
    
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    
    const monthName = new Intl.DateTimeFormat(settings.language === 'ar' ? 'ar-EG' : 'en-US', { month: 'long' }).format(viewDate);
    const dayNames = settings.language === 'ar' 
        ? ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
        : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 is Sunday

    const prevMonth = () => onViewDateChange(new Date(year, month - 1, 1));
    const nextMonth = () => onViewDateChange(new Date(year, month + 1, 1));

    const getDateString = (d: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const hasMission = (dateStr: string) => missions.some(m => m.date === dateStr);

    const renderDays = () => {
        const els = [];
        for(let i=0; i<firstDayOfMonth; i++) els.push(<div key={`empty-${i}`} />);
        for(let d=1; d<=daysInMonth; d++) {
            const dateStr = getDateString(d);
            const isSelected = selectedDate === dateStr;
            const isMissionDay = hasMission(dateStr);
            const isToday = dateStr === new Date().toISOString().split('T')[0];

            els.push(
                <button 
                    key={d} 
                    onClick={() => onDateSelect(isSelected ? null : dateStr)}
                    className={`
                        h-9 w-9 rounded-full flex items-center justify-center text-xs font-medium transition-all relative mx-auto
                        ${isSelected 
                            ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/40 transform scale-105' 
                            : isMissionDay 
                                ? 'bg-brand-100 text-brand-700 font-bold hover:bg-brand-200' 
                                : 'text-gray-700 hover:bg-gray-100'}
                        ${!isSelected && isToday ? 'ring-2 ring-brand-400 text-brand-600' : ''}
                    `}
                >
                    {d.toLocaleString(settings.language === 'ar' ? 'ar-EG' : 'en-US')}
                    {isMissionDay && !isSelected && (
                         <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-500 opacity-60"></div>
                    )}
                </button>
            );
        }
        return els;
    };

    return (
        <div className="bg-white rounded-3xl shadow-soft p-5 border border-gray-100/50">
            <div className="flex justify-between items-center mb-4">
                <button onClick={prevMonth} className="p-2 hover:bg-gray-50 rounded-full text-gray-500 transition-colors rtl:rotate-180"><ChevronLeft size={18} /></button>
                <h3 className="font-bold text-gray-800 text-sm tracking-wide">{monthName} {year.toLocaleString(settings.language === 'ar' ? 'ar-EG' : 'en-US', {useGrouping: false})}</h3>
                <button onClick={nextMonth} className="p-2 hover:bg-gray-50 rounded-full text-gray-500 transition-colors rtl:rotate-180"><ChevronRight size={18} /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2">
                {dayNames.map(d => (
                    <div key={d} className="text-center text-[10px] uppercase font-bold text-gray-400">{d}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-y-2 gap-x-1">
                {renderDays()}
            </div>
        </div>
    );
};

const Dashboard = ({ missions, settings, userProfile, onSelect, onAdd, onOpenSettings }: { missions: Mission[], settings: Settings, userProfile: UserProfile, onSelect: (id: string) => void, onAdd: () => void, onOpenSettings: () => void }) => {
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState(new Date()); 
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportDates, setExportDates] = useState({ start: '', end: '' });

  const t = TRANSLATIONS[settings.language];

  const filteredMissions = missions.filter(m => {
    const searchMatch = m.title.toLowerCase().includes(search.toLowerCase()) || m.location.toLowerCase().includes(search.toLowerCase()) || m.date.includes(search);
    let dateMatch = true;
    if (selectedDate) dateMatch = m.date === selectedDate;
    return searchMatch && dateMatch;
  });

  const openExportModal = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    // Default to current view month
    const start = new Date(Date.UTC(year, month, 1)).toISOString().split('T')[0];
    const end = new Date(Date.UTC(year, month + 1, 0)).toISOString().split('T')[0];
    setExportDates({ start, end });
    setShowExportModal(true);
  };

  const performExport = async () => {
    setIsExporting(true);
    setShowExportModal(false);
    try {
        const PizZip = (window as any).PizZip;
        if (!PizZip) throw new Error("PizZip not loaded");

        const start = new Date(exportDates.start);
        const end = new Date(exportDates.end);
        
        // Include the end date fully
        end.setHours(23, 59, 59, 999);

        const missionsInRange = missions.filter(m => {
            const mDate = new Date(m.date);
            return mDate >= start && mDate <= end;
        });

        if (missionsInRange.length === 0) {
            alert(t.noMissions);
            return;
        }

        const masterZip = new PizZip();
        let count = 0;
        for (const mission of missionsInRange) {
            const docBlob = await generateDocxBlob(mission, settings, userProfile);
            if (docBlob) {
                const buffer = await docBlob.arrayBuffer();
                const safeName = mission.title.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
                const fileName = `${mission.date}_${safeName}.docx`;
                masterZip.file(fileName, buffer);
                count++;
            }
        }
        if (count === 0) {
            alert("Failed to generate any reports.");
            return;
        }

        const content = masterZip.generate({ type: "blob" });
        const url = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Reports_${exportDates.start}_to_${exportDates.end}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error("Batch Export Error", e);
        alert("An error occurred during export.");
    } finally {
        setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-br from-brand-600 to-brand-800 text-white p-6 pt-8 pb-10 rounded-b-[2.5rem] shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl rtl:right-auto rtl:left-0 rtl:-translate-x-1/2"></div>
            
            <div className="flex justify-between items-start mb-6 relative z-10">
                <div>
                    <p className="text-brand-200 text-xs uppercase tracking-wider font-semibold">{getGreeting(t)}</p>
                    <h1 className="text-2xl font-bold">{userProfile.fullName}</h1>
                    <p className="text-sm text-brand-100 opacity-80">{userProfile.profession}</p>
                </div>
                <button onClick={onOpenSettings} className="p-2 bg-white/10 backdrop-blur-sm rounded-full hover:bg-white/20 transition-colors">
                    <User size={20} className="text-white" />
                </button>
            </div>

            {/* Search Bar Floating */}
            <div className="relative z-10">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-200 rtl:left-auto rtl:right-4" size={18} />
                <input 
                    type="text" 
                    placeholder={t.searchPlaceholder}
                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl border-none bg-white/10 backdrop-blur-md text-white placeholder-brand-200 focus:bg-white focus:text-gray-900 focus:placeholder-gray-400 shadow-inner outline-none transition-all rtl:pl-4 rtl:pr-11 text-start"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>
        </div>

        <div className="px-5 space-y-6 relative">
            <CalendarWidget 
                missions={missions} 
                selectedDate={selectedDate} 
                onDateSelect={setSelectedDate}
                viewDate={viewDate}
                onViewDateChange={setViewDate}
                settings={settings}
            />

            {/* Batch Export */}
            <div className="flex justify-end rtl:justify-start">
                <button 
                    onClick={openExportModal}
                    disabled={isExporting}
                    className="flex items-center gap-2 text-xs font-semibold text-brand-600 bg-white hover:bg-brand-50 py-2.5 px-4 rounded-xl transition-all shadow-sm border border-gray-100"
                >
                    {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                    {t.exportData}
                </button>
            </div>

            {/* Export Modal */}
            {showExportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-lg text-gray-800">{t.exportOptions}</h3>
                            <button onClick={() => setShowExportModal(false)} className="p-1 rounded-full hover:bg-gray-100 text-gray-500">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="space-y-4">
                             <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase ml-1 rtl:mr-1 rtl:ml-0">{t.startDate}</label>
                                <input 
                                    type="date" 
                                    value={exportDates.start} 
                                    onChange={e => setExportDates({...exportDates, start: e.target.value})} 
                                    className="w-full p-3 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-brand-300 outline-none text-sm text-start" 
                                />
                             </div>
                             <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase ml-1 rtl:mr-1 rtl:ml-0">{t.endDate}</label>
                                <input 
                                    type="date" 
                                    value={exportDates.end} 
                                    onChange={e => setExportDates({...exportDates, end: e.target.value})} 
                                    className="w-full p-3 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-brand-300 outline-none text-sm text-start" 
                                />
                             </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                             <button 
                                onClick={() => setShowExportModal(false)}
                                className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors"
                             >
                                {t.cancel}
                             </button>
                             <button 
                                onClick={performExport}
                                className="flex-1 py-3 bg-brand-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-brand-500/30 hover:bg-brand-700 active:scale-[0.98] transition-all"
                             >
                                {t.exportBtn}
                             </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mission List */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-gray-800">
                        {selectedDate ? t.selectedDate : (search ? t.results : t.recentMissions)}
                    </h2>
                    {selectedDate && (
                        <button onClick={() => setSelectedDate(null)} className="text-xs text-brand-600 font-medium hover:text-brand-800 bg-brand-50 px-2 py-1 rounded-lg">
                            {t.clearFilter}
                        </button>
                    )}
                </div>
                
                {filteredMissions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center text-gray-400 space-y-3 bg-white rounded-3xl border border-dashed border-gray-200">
                        <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center">
                            <FileText size={24} className="opacity-40" />
                        </div>
                        <div>
                            <p className="font-medium text-gray-500">{t.noMissions}</p>
                            <p className="text-xs mt-1">{t.tryDifferent}</p>
                        </div>
                    </div>
                ) : (
                    filteredMissions.map(mission => {
                         const dateObj = new Date(mission.date);
                         const day = dateObj.getDate();
                         const month = dateObj.toLocaleDateString(settings.language === 'ar' ? 'ar-EG' : 'en-US', { month: 'short' }).toUpperCase();
                         const dayDisplay = day.toLocaleString(settings.language === 'ar' ? 'ar-EG' : 'en-US');

                         return (
                            <div 
                                key={mission.id} 
                                onClick={() => onSelect(mission.id)}
                                className="bg-white p-4 rounded-2xl shadow-soft border border-gray-100 active:scale-[0.98] transition-all cursor-pointer group relative overflow-hidden flex items-center gap-4"
                            >
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-500 rtl:left-auto rtl:right-0"></div>
                                
                                {/* Date Box */}
                                <div className="flex-shrink-0 w-14 h-14 bg-gray-50 rounded-xl flex flex-col items-center justify-center border border-gray-100">
                                    <span className="text-[10px] font-bold text-gray-400">{month}</span>
                                    <span className="text-xl font-bold text-gray-800">{dayDisplay}</span>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-gray-800 truncate mb-1">{mission.title || t.untitled}</h3>
                                    <div className="flex items-center text-gray-500 text-xs">
                                        <MapPin size={12} className="mr-1 text-brand-400 rtl:ml-1 rtl:mr-0" />
                                        <span className="truncate">{mission.location || t.unknown}</span>
                                    </div>
                                </div>
                                
                                <ChevronRight size={18} className="text-gray-300 group-hover:text-brand-500 transition-colors rtl:rotate-180" />
                            </div>
                        )
                    })
                )}
            </div>
            {/* Add Button */}
            <button 
                onClick={onAdd}
                className="fixed bottom-6 right-6 z-30 w-14 h-14 bg-brand-600 rounded-full text-white shadow-xl shadow-brand-500/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-all rtl:right-auto rtl:left-6"
            >
                <Plus size={28} />
            </button>
        </div>
    </div>
  );
};

const MissionEditor = ({ onSave, onCancel, settings }: { onSave: (m: Mission) => void, onCancel: () => void, settings: Settings }) => {
    const [mode, setMode] = useState<'magic' | 'manual'>('magic');
    const [magicInput, setMagicInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [timeMode, setTimeMode] = useState<'presets' | 'custom'>('presets');
    
    const [form, setForm] = useState<Partial<Mission>>({
        title: '',
        location: '',
        date: new Date().toISOString().split('T')[0],
        finishDate: new Date().toISOString().split('T')[0], // Added Default End Date
        startTime: '10:00',
        finishTime: '17:00',
        notes: ''
    });

    const t = TRANSLATIONS[settings.language];

    const START_HOURS = ['04:00', '10:00', '17:00'];
    const END_HOURS = ['04:00', '10:00', '17:00', '22:00'];

    const handleMagicFill = async () => {
        if (!magicInput.trim()) return;
        
        setIsLoading(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `Extract event details from this text: "${magicInput}". Use today's date ${new Date().toISOString().split('T')[0]} if date is not specified.`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: { 
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            location: { type: Type.STRING },
                            date: { type: Type.STRING },
                            finishDate: { type: Type.STRING },
                            startTime: { type: Type.STRING },
                            finishTime: { type: Type.STRING },
                            notes: { type: Type.STRING }
                        }
                    }
                }
            });
            
            const text = response.text;
            if (text) {
                const data = JSON.parse(text);
                setForm(prev => ({ 
                    ...prev, 
                    ...data,
                    finishDate: data.finishDate || data.date // Ensure finish date is set
                }));
                setMode('manual');
            } else {
                alert("AI returned no data. Please try again.");
            }
        } catch (error: any) {
            console.error("AI Error", error);
            // Show more detailed error for debugging
            alert(`AI Analysis failed: ${error.message || "Network or API Key Error"}. Please check your internet connection.`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = () => {
        if (!form.title) {
            alert(t.pleaseFill);
            return;
        }
        
        onSave({
            id: generateId(),
            title: form.title || t.untitled,
            location: form.location || '',
            date: form.date || new Date().toISOString().split('T')[0],
            finishDate: form.finishDate || form.date, 
            startTime: form.startTime,
            finishTime: form.finishTime,
            notes: form.notes || '',
            createdAt: Date.now()
        });
    };

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <button onClick={onCancel} className="text-gray-500 hover:bg-gray-100 p-2 rounded-full"><X size={20} /></button>
                <h2 className="font-bold text-lg">{t.newMission}</h2>
                <button onClick={handleSave} className="text-brand-600 font-bold hover:bg-brand-50 px-3 py-1 rounded-lg">{t.save}</button>
            </div>

            <div className="flex p-2 bg-gray-50 m-4 rounded-xl">
                <button 
                    onClick={() => setMode('magic')}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${mode === 'magic' ? 'bg-white shadow text-brand-600' : 'text-gray-500'}`}
                >
                    <Wand2 size={14} /> {t.magicFill}
                </button>
                <button 
                    onClick={() => setMode('manual')}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${mode === 'manual' ? 'bg-white shadow text-brand-600' : 'text-gray-500'}`}
                >
                    <FileText size={14} /> {t.manual}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
                {mode === 'magic' ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="bg-brand-50 p-4 rounded-2xl border border-brand-100">
                            <h3 className="font-bold text-brand-800 text-sm mb-1 flex items-center gap-2"><Info size={14}/> {t.howItWorks}</h3>
                            <p className="text-xs text-brand-600 mb-2">{t.howItWorksDesc}</p>
                            <p className="text-xs text-brand-500 italic bg-white/50 p-2 rounded-lg border border-brand-100/50">{t.howItWorksExample}</p>
                        </div>
                        <textarea 
                            className="w-full h-40 p-4 rounded-2xl bg-gray-50 border border-gray-200 focus:bg-white focus:border-brand-300 focus:ring-4 focus:ring-brand-50 outline-none transition-all resize-none text-start"
                            placeholder={t.typeHere}
                            value={magicInput}
                            onChange={e => setMagicInput(e.target.value)}
                        />
                        <button 
                            onClick={handleMagicFill}
                            disabled={isLoading || !magicInput}
                            className="w-full py-4 bg-brand-600 text-white rounded-xl font-bold shadow-lg shadow-brand-500/30 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isLoading ? <Loader2 className="animate-spin" /> : <Sparkles size={18} />}
                            {isLoading ? t.analyzing : t.generateDetails}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase ml-1 rtl:mr-1 rtl:ml-0">{t.title}</label>
                            <input 
                                type="text" 
                                value={form.title}
                                onChange={e => setForm({...form, title: e.target.value})}
                                className="w-full p-3.5 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-brand-300 outline-none font-bold text-gray-800 text-start"
                                placeholder={t.titlePlaceholder}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase ml-1 rtl:mr-1 rtl:ml-0">{t.location}</label>
                            <div className="relative">
                                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 rtl:left-auto rtl:right-3.5" size={18} />
                                <input 
                                    type="text" 
                                    value={form.location}
                                    onChange={e => setForm({...form, location: e.target.value})}
                                    className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-brand-300 outline-none text-start rtl:pl-4 rtl:pr-10"
                                    placeholder={t.locationPlaceholder}
                                />
                            </div>
                        </div>

                        {/* Dates Section */}
                        <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-400 uppercase ml-1 rtl:mr-1 rtl:ml-0">{t.startDate}</label>
                                <input 
                                    type="date" 
                                    value={form.date}
                                    onChange={e => setForm({...form, date: e.target.value})}
                                    className="w-full p-3.5 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-brand-300 outline-none text-start"
                                />
                             </div>
                             <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-400 uppercase ml-1 rtl:mr-1 rtl:ml-0">{t.endDate}</label>
                                <input 
                                    type="date" 
                                    value={form.finishDate}
                                    onChange={e => setForm({...form, finishDate: e.target.value})}
                                    className="w-full p-3.5 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-brand-300 outline-none text-start"
                                />
                             </div>
                        </div>

                        {/* Time Section - Chips Style */}
                        <div className="space-y-2">
                             <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-gray-400 uppercase ml-1 rtl:mr-1 rtl:ml-0">{t.time}</label>
                                <button 
                                    onClick={() => setTimeMode(timeMode === 'presets' ? 'custom' : 'presets')}
                                    className="text-[10px] text-brand-600 font-bold bg-brand-50 px-2 py-1 rounded-lg flex items-center gap-1"
                                >
                                    {timeMode === 'presets' ? (
                                        <><span>Manual Input</span> <Keyboard size={12} /></>
                                    ) : (
                                        <><span>Quick Select</span> <Clock size={12} /></>
                                    )}
                                </button>
                             </div>

                             {timeMode === 'presets' ? (
                                <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                    <div className="space-y-1">
                                        <span className="text-[10px] uppercase font-bold text-gray-400">Start Time</span>
                                        <div className="flex gap-2">
                                            {START_HOURS.map((time) => (
                                                <button 
                                                    key={time}
                                                    onClick={() => setForm({...form, startTime: time})}
                                                    className={`
                                                        flex-1 py-2 rounded-lg font-bold text-xs transition-all
                                                        ${form.startTime === time 
                                                            ? 'bg-brand-600 text-white shadow-md shadow-brand-500/30' 
                                                            : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}
                                                    `}
                                                >
                                                    {time}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] uppercase font-bold text-gray-400">End Time</span>
                                        <div className="flex gap-2">
                                            {END_HOURS.map((time) => (
                                                <button 
                                                    key={time}
                                                    onClick={() => setForm({...form, finishTime: time})}
                                                    className={`
                                                        flex-1 py-2 rounded-lg font-bold text-xs transition-all
                                                        ${form.finishTime === time 
                                                            ? 'bg-brand-600 text-white shadow-md shadow-brand-500/30' 
                                                            : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}
                                                    `}
                                                >
                                                    {time}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                             ) : (
                                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase">{t.startTime}</label>
                                        <input 
                                            type="time" 
                                            value={form.startTime}
                                            onChange={e => setForm({...form, startTime: e.target.value})}
                                            className="w-full p-3.5 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-brand-300 outline-none text-start"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase">{t.endTime}</label>
                                        <input 
                                            type="time" 
                                            value={form.finishTime}
                                            onChange={e => setForm({...form, finishTime: e.target.value})}
                                            className="w-full p-3.5 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-brand-300 outline-none text-start"
                                        />
                                    </div>
                                </div>
                             )}
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-400 uppercase ml-1 rtl:mr-1 rtl:ml-0">{t.notes}</label>
                            <textarea 
                                value={form.notes}
                                onChange={e => setForm({...form, notes: e.target.value})}
                                className="w-full h-32 p-3.5 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-brand-300 outline-none resize-none text-start"
                                placeholder={t.notesPlaceholder}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const MissionDetails = ({ mission, settings, userProfile, onBack, onDelete }: { mission: Mission, settings: Settings, userProfile: UserProfile, onBack: () => void, onDelete: () => void }) => {
    const t = TRANSLATIONS[settings.language];
    const [isDrafting, setIsDrafting] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            const blob = await generateDocxBlob(mission, settings, userProfile);
            if (blob) {
                // Ensure filename is safe
                const safeName = mission.title.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
                const fileName = `${mission.date}_${safeName}.docx`;
                
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = fileName;
                a.style.display = 'none';
                
                document.body.appendChild(a);
                // Trigger download with a slight delay for mobile stability
                setTimeout(() => {
                    a.click();
                    setTimeout(() => {
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    }, 100);
                }, 0);
            } else {
                // generateDocxBlob handles alerting for failure
            }
        } catch (e) {
            alert("Unexpected error during download.");
        } finally {
            setIsDownloading(false);
        }
    };

    const handleShareReport = async () => {
        setIsDrafting(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `Write a short, professional email report for a field mission.
            Mission: ${mission.title}
            Date: ${mission.date}
            Time: ${mission.startTime} - ${mission.finishTime}
            Location: ${mission.location}
            Notes: ${mission.notes}
            
            Reporter: ${userProfile.fullName} (${userProfile.profession})
            Language: ${settings.language === 'ar' ? 'Arabic' : 'English'}
            
            Return only the body of the email.`;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt
            });

            const body = response.text || "";
            const subject = `${t.missionNotes}: ${mission.title}`;
            
            // Mobile Native Share (Web Share API)
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: subject,
                        text: `${subject}\n\n${body}`,
                    });
                } catch (shareError) {
                    console.log("Share cancelled or failed", shareError);
                }
            } else {
                // Fallback: Copy to Clipboard
                try {
                    await navigator.clipboard.writeText(`${subject}\n\n${body}`);
                    alert("Report copied to clipboard! You can now paste it into your email app.");
                } catch (clipboardError) {
                    alert("Could not share or copy. Please try manually copying the notes.");
                }
            }
        } catch (e: any) {
            console.error(e);
            alert(`Error generating draft: ${e.message || "Unknown error"}`);
        } finally {
            setIsDrafting(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="p-4 border-b border-gray-100 flex items-center gap-3 sticky top-0 bg-white z-10">
                <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 rtl:rotate-180"><ChevronLeft size={24} /></button>
                <h1 className="flex-1 font-bold text-lg truncate">{mission.title}</h1>
                <button onClick={onDelete} className="p-2 hover:bg-red-50 text-red-400 rounded-full"><Trash2 size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                        <div className="text-gray-400 mb-2"><Calendar size={20} /></div>
                        <p className="text-xs font-bold text-gray-500 uppercase">{t.startDate}</p>
                        <p className="font-bold text-gray-800">{formatDate(mission.date, settings.language === 'ar' ? 'ar-EG' : 'en-US')}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                         <div className="text-gray-400 mb-2"><Clock size={20} /></div>
                         <p className="text-xs font-bold text-gray-500 uppercase">{t.time}</p>
                         <p className="font-bold text-gray-800">{formatTime(mission.startTime)} - {formatTime(mission.finishTime)}</p>
                    </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-start gap-3">
                    <MapPin className="text-brand-500 mt-1 shrink-0" size={20} />
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase mb-1">{t.location}</p>
                        <p className="font-bold text-gray-800 leading-snug">{mission.location || t.unknown}</p>
                    </div>
                </div>

                <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 min-h-[120px]">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-2"><FileText size={14}/> {t.notes}</p>
                    <p className="text-gray-700 leading-relaxed whitespace-pre-wrap text-sm">{mission.notes}</p>
                </div>
            </div>

            <div className="p-4 border-t border-gray-100 bg-white grid grid-cols-2 gap-3 pb-24">
                <button 
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="flex flex-col items-center justify-center gap-2 bg-brand-50 text-brand-700 p-4 rounded-2xl font-bold text-xs hover:bg-brand-100 transition-colors"
                >
                    {isDownloading ? <Loader2 size={24} className="animate-spin" /> : <Download size={24} />}
                    {t.downloadDocx}
                </button>
                <button 
                    onClick={handleShareReport}
                    disabled={isDrafting}
                    className="flex flex-col items-center justify-center gap-2 bg-gray-900 text-white p-4 rounded-2xl font-bold text-xs hover:bg-gray-800 transition-colors"
                >
                    {isDrafting ? <Loader2 size={24} className="animate-spin" /> : <Share size={24} />}
                    {navigator.share ? "Share Report" : "Copy Report"}
                </button>
            </div>
        </div>
    );
};

const App = () => {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [settings, setSettings] = useState<Settings>({
    activeTemplateId: 'default',
    customTemplates: [],
    language: 'en'
  });
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => 
    safeJsonParse(STORAGE_KEY_USER_PROFILE, null)
  );
  
  const [view, setView] = useState<'dashboard' | 'add' | 'details' | 'settings'>('dashboard');
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);

  // Capture PWA Install Prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    setInstallPrompt(null);
  };

  useEffect(() => {
    const savedMissions = safeJsonParse(STORAGE_KEY_MISSIONS, []);
    setMissions(savedMissions);

    const savedSettings = safeJsonParse(STORAGE_KEY_SETTINGS, {
        activeTemplateId: 'default',
        customTemplates: [],
        language: 'en'
    });
    setSettings(savedSettings);
  }, []);

  useEffect(() => {
    document.documentElement.lang = settings.language;
    document.documentElement.dir = settings.language === 'ar' ? 'rtl' : 'ltr';
  }, [settings.language]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MISSIONS, JSON.stringify(missions));
  }, [missions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (userProfile) {
        localStorage.setItem(STORAGE_KEY_USER_PROFILE, JSON.stringify(userProfile));
    }
  }, [userProfile]);

  const addMission = (mission: Mission) => {
    setMissions([mission, ...missions]);
    setView('dashboard');
  };

  const updateMission = (id: string, updates: Partial<Mission>) => {
    setMissions(missions.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const deleteMission = (id: string) => {
    setMissions(missions.filter(m => m.id !== id));
    if (selectedMissionId === id) {
        setSelectedMissionId(null);
        setView('dashboard');
    }
  };

  const goToDetails = (id: string) => {
    setSelectedMissionId(id);
    setView('details');
  };

  const t = TRANSLATIONS[settings.language];

  if (!userProfile) {
      return <OnboardingView onSave={setUserProfile} settings={settings} onUpdateSettings={setSettings} />;
  }

  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return (
            <Dashboard 
                missions={missions} 
                settings={settings}
                userProfile={userProfile}
                onSelect={goToDetails} 
                onAdd={() => setView('add')}
                onOpenSettings={() => setView('settings')}
            />
        );
      case 'add':
        return <MissionEditor onSave={addMission} onCancel={() => setView('dashboard')} settings={settings} />;
      case 'details':
        const mission = missions.find(m => m.id === selectedMissionId);
        if (!mission) return <div className="p-4">Mission not found</div>;
        return (
            <MissionDetails 
                mission={mission} 
                settings={settings}
                userProfile={userProfile}
                onBack={() => setView('dashboard')} 
                onDelete={() => deleteMission(mission.id)}
            />
        );
      case 'settings':
        return <SettingsView 
            settings={settings} 
            onUpdate={setSettings} 
            userProfile={userProfile} 
            onUpdateProfile={setUserProfile} 
            onBack={() => setView('dashboard')}
            installPrompt={installPrompt}
            onInstall={handleInstallClick}
        />;
      default:
        return (
            <Dashboard 
                missions={missions} 
                settings={settings}
                userProfile={userProfile}
                onSelect={goToDetails} 
                onAdd={() => setView('add')}
                onOpenSettings={() => setView('settings')}
            />
        );
    }
  };

  return (
    <div 
        className="max-w-md mx-auto h-screen bg-gray-50 flex flex-col shadow-2xl overflow-hidden relative font-sans text-gray-900 group"
        style={{ height: '100dvh' }}
    >
      <div className="flex-1 overflow-y-auto no-scrollbar bg-gray-50 pb-20">
        {renderView()}
      </div>

      <div className="absolute bottom-6 left-4 right-4 h-16 bg-white/90 backdrop-blur-md border border-white/50 rounded-2xl shadow-soft flex justify-around items-center z-20">
        <button 
            onClick={() => setView('dashboard')}
            className={`p-2 rounded-xl flex flex-col items-center gap-1 transition-all duration-300 ${view === 'dashboard' ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
        >
            <Home size={24} className={view === 'dashboard' ? 'fill-current opacity-20' : ''} />
        </button>
        
        <button 
            onClick={() => setView('add')}
            className="w-14 h-14 -mt-8 bg-gradient-to-tr from-brand-600 to-brand-500 text-white rounded-full shadow-lg shadow-brand-500/30 flex items-center justify-center transition-transform hover:scale-105 active:scale-95 border-4 border-gray-50"
        >
            <Plus size={28} />
        </button>

         <button 
            onClick={() => setView('settings')}
            className={`p-2 rounded-xl flex flex-col items-center gap-1 transition-all duration-300 ${view === 'settings' ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}
        >
            <SettingsIcon size={24} className={view === 'settings' ? 'animate-spin-slow' : ''} />
        </button>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);