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
  Copy
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
        const response = await fetch('./default.docx');
        if (response.ok) {
            const buffer = await response.arrayBuffer();
            if (buffer.byteLength > 0) {
                 return buffer;
            }
        }
    } catch (e) {
        console.warn("Could not fetch default.docx, using fallback.");
    }

    // 3. Fallback to internal Base64
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
            alert("Document generation libraries not loaded. Please check your internet connection and refresh.");
            return null;
        }

        let templateBuffer = await getTemplateBuffer(settings);
        let zip;

        // Try to load zip. If custom template is corrupt, fallback to default.
        try {
            zip = new PizZip(templateBuffer);
        } catch (e) {
            console.error("Template corrupt, using fallback", e);
            templateBuffer = base64ToArrayBuffer(DEFAULT_TEMPLATE_BASE64);
            zip = new PizZip(templateBuffer);
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
    } catch (e) {
        console.error("Error generating docx", e);
        alert("Failed to generate document. Please try again.");
        return null;
    }
};

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
    const [form, setForm] = useState<Partial<Mission>>({
        title: '',
        location: '',
        date: new Date().toISOString().split('T')[0],
        startTime: '09:00',
        finishTime: '17:00',
        notes: ''
    });

    const t = TRANSLATIONS[settings.language];

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
                setForm(prev => ({ ...prev, ...data }));
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
            finishDate: form.date, // simple assumption for single day
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
                                <label className="text-xs font-bold text-gray-400 uppercase ml-1 rtl:mr-1 rtl:ml-0">{t.startTime}</label>
                                <input 
                                    type="time" 
                                    value={form.startTime}
                                    onChange={e => setForm({...form, startTime: e.target.value})}
                                    className="w-full p-3.5 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-brand-300 outline-none text-start"
                                />
                             </div>
                        </div>

                         <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-400 uppercase ml-1 rtl:mr-1 rtl:ml-0">{t.endTime}</label>
                                <input 
                                    type="time" 
                                    value={form.finishTime}
                                    onChange={e => setForm({...form, finishTime: e.target.value})}
                                    className="w-full p-3.5 rounded-xl bg-gray-50 border border-gray-100 focus:bg-white focus:border-brand-300 outline-none text-start"
                                />
                             </div>
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
    const [settings, setSettings] = useState<Settings>({ activeTemplateId: 'default', customTemplates: [], language: 'en' });
    const [userProfile, setUserProfile] = useState<UserProfile>({ fullName: '', profession: '', cni: '', ppn: '' });
    const [view, setView] = useState<'onboarding' | 'dashboard' | 'editor' | 'details'>('onboarding');
    const [viewMissionId, setViewMissionId] = useState<string | null>(null);

    useEffect(() => {
        const storedMissions = localStorage.getItem(STORAGE_KEY_MISSIONS);
        if (storedMissions) setMissions(JSON.parse(storedMissions));
        
        const storedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
        if (storedSettings) setSettings(JSON.parse(storedSettings));

        const storedProfile = localStorage.getItem(STORAGE_KEY_USER_PROFILE);
        if (storedProfile) {
            setUserProfile(JSON.parse(storedProfile));
            setView('dashboard');
        }
    }, []);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_MISSIONS, JSON.stringify(missions));
    }, [missions]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    }, [settings]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_USER_PROFILE, JSON.stringify(userProfile));
    }, [userProfile]);

    useEffect(() => {
        document.documentElement.dir = settings.language === 'ar' ? 'rtl' : 'ltr';
    }, [settings.language]);

    const handleSaveProfile = (profile: UserProfile) => {
        setUserProfile(profile);
        setView('dashboard');
    };

    const handleSaveMission = (mission: Mission) => {
        setMissions(prev => [mission, ...prev]);
        setView('dashboard');
    };

    const handleDeleteMission = () => {
        if (viewMissionId) {
            setMissions(prev => prev.filter(m => m.id !== viewMissionId));
            setView('dashboard');
            setViewMissionId(null);
        }
    };

    if (view === 'onboarding') {
        return <OnboardingView onSave={handleSaveProfile} settings={settings} onUpdateSettings={setSettings} />;
    }

    if (view === 'editor') {
        return <MissionEditor onSave={handleSaveMission} onCancel={() => setView('dashboard')} settings={settings} />;
    }

    if (view === 'details' && viewMissionId) {
        const mission = missions.find(m => m.id === viewMissionId);
        if (mission) {
            return (
                <MissionDetails 
                    mission={mission} 
                    settings={settings} 
                    userProfile={userProfile} 
                    onBack={() => setView('dashboard')} 
                    onDelete={handleDeleteMission}
                />
            );
        }
    }

    return (
        <Dashboard 
            missions={missions} 
            settings={settings} 
            userProfile={userProfile} 
            onSelect={(id) => { setViewMissionId(id); setView('details'); }}
            onAdd={() => setView('editor')}
            onOpenSettings={() => {
                // Settings view implementation could be added here
                alert("Settings not implemented in this demo.");
            }}
        />
    );
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}
