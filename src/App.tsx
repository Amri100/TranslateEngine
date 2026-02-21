import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, FileText, X, ChevronRight, Globe, Download, Play, 
  CheckCircle2, Loader2, Square, CheckSquare, Layers, 
  History, Settings, Zap, Shield, Sparkles, Search, Trash2,
  BookOpen, MessageSquare, Heart, Coffee, ExternalLink,
  Info, HelpCircle, Users, CreditCard
} from 'lucide-react';
import { cn } from './lib/utils';
import { 
  parseRPGMaker, parseKiriKiri, parseRenPy, parseGenericJSON, parseCSV, parseSRT,
  applyTranslations, type GameScriptEntry, type TranslationProject 
} from './services/parserService';
import { translateGameText } from './services/geminiService';
import { saveToTM, findInTM, clearTM, getTM } from './services/tmService';
import JSZip from 'jszip';
import { motion, AnimatePresence } from 'motion/react';

type TranslationProvider = 'gemini' | 'google' | 'bing' | 'mymemory' | 'lingva';

export default function App() {
  const [project, setProject] = useState<TranslationProject | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [targetLang, setTargetLang] = useState('Indonesian');
  const [provider, setProvider] = useState<TranslationProvider>('gemini');
  const [exportMode, setExportMode] = useState<'zip' | 'individual'>('zip');
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'editor' | 'tm' | 'guide' | 'community' | 'donate'>('upload');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [useTM, setUseTM] = useState(true);

  // Load TM matches when project changes
  useEffect(() => {
    if (project && useTM) {
      const updatedEntries = project.entries.map(entry => {
        if (!entry.translated) {
          const match = findInTM(entry.original, targetLang);
          if (match) {
            return { 
              ...entry, 
              translated: match.translated,
              tmEngineMatch: match.engine 
            };
          }
        }
        return entry;
      });
      
      // Only update if something changed to avoid infinite loops
      const hasChanges = updatedEntries.some((e, i) => 
        e.translated !== project.entries[i].translated ||
        e.tmEngineMatch !== project.entries[i].tmEngineMatch
      );
      if (hasChanges) {
        setProject({ ...project, entries: updatedEntries });
      }
    }
  }, [project?.id, targetLang, useTM]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const newFiles: { name: string; content: string }[] = [];
    let allEntries: GameScriptEntry[] = [];
    let detectedEngine: TranslationProject["engine"] = "generic";

    for (const file of acceptedFiles) {
      const content = await file.text();
      newFiles.push({ name: file.name, content });

      if (file.name.endsWith('.json')) {
        // Try to detect RPG Maker vs Generic JSON
        try {
          const data = JSON.parse(content);
          if (data.events || (Array.isArray(data) && data[0] === null)) {
            detectedEngine = "rpgmaker";
            allEntries = [...allEntries, ...parseRPGMaker(file.name, content)];
          } else {
            detectedEngine = "unity"; // Assume Unity/Generic if not RPG Maker
            allEntries = [...allEntries, ...parseGenericJSON(file.name, content)];
          }
        } catch (e) {
          detectedEngine = "generic";
          allEntries = [...allEntries, ...parseGenericJSON(file.name, content)];
        }
      } else if (file.name.endsWith('.ks') || file.name.endsWith('.tjs')) {
        detectedEngine = "kirikiri";
        allEntries = [...allEntries, ...parseKiriKiri(file.name, content)];
      } else if (file.name.endsWith('.rpy')) {
        detectedEngine = "renpy";
        allEntries = [...allEntries, ...parseRenPy(file.name, content)];
      } else if (file.name.endsWith('.csv')) {
        detectedEngine = "generic";
        allEntries = [...allEntries, ...parseCSV(file.name, content)];
      } else if (file.name.endsWith('.srt')) {
        detectedEngine = "subtitles";
        allEntries = [...allEntries, ...parseSRT(file.name, content)];
      } else {
        // Fallback for unknown text files
        detectedEngine = "generic";
        allEntries = [...allEntries, {
          id: `raw-${file.name}`,
          original: content,
          translated: "",
          path: "raw",
          context: "Raw File Content"
        }];
      }
    }

    if (allEntries.length > 0) {
      setProject({
        id: Math.random().toString(36).substr(2, 9),
        name: acceptedFiles[0].name.split('.')[0] || "New Project",
        engine: detectedEngine,
        entries: allEntries,
        files: newFiles
      });
      setActiveTab('editor');
      setSelectedIds(new Set());
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const handleTranslateBatch = async (ids?: string[]) => {
    if (!project) return;
    setIsTranslating(true);

    const targetIds = ids || Array.from(selectedIds);
    const entriesToTranslate = project.entries.filter(e => targetIds.includes(e.id));
    
    if (entriesToTranslate.length === 0) {
      setIsTranslating(false);
      return;
    }

    const batchSize = 10;
    const updatedEntries = [...project.entries];

    for (let i = 0; i < entriesToTranslate.length; i += batchSize) {
      const batch = entriesToTranslate.slice(i, i + batchSize);
      const texts = batch.map(e => e.original);
      
      const results = await translateGameText(texts, targetLang, project.engine, provider);
      
      results.forEach((res, idx) => {
        const originalText = batch[idx].original;
        const translatedText = res.translated;
        
        // Update ALL entries with the same original text
        updatedEntries.forEach((ent, entIdx) => {
          if (ent.original === originalText) {
            updatedEntries[entIdx].translated = translatedText;
            updatedEntries[entIdx].tmEngineMatch = project.engine;
          }
        });
        
        // Save to TM
        saveToTM(originalText, translatedText, targetLang, project.engine);
      });

      setProject({ ...project, entries: updatedEntries });
    }

    setIsTranslating(false);
  };

  const handleDownload = async () => {
    if (!project) return;
    
    if (exportMode === 'zip') {
      const zip = new JSZip();
      project.files.forEach(file => {
        const fileEntries = project.entries.filter(e => e.id.includes(file.name));
        const translatedContent = applyTranslations(file.content, fileEntries, project.engine);
        zip.file(file.name, translatedContent);
      });

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      a.download = `${safeName}_translated.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      // Individual files
      for (const file of project.files) {
        const fileEntries = project.entries.filter(e => e.id.includes(file.name));
        const translatedContent = applyTranslations(file.content, fileEntries, project.engine);
        const blob = new Blob([translatedContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Small delay to prevent browser blocking multiple downloads
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  };

  const handleExport = handleDownload;

  // Auto-save project to localStorage
  useEffect(() => {
    if (project) {
      setIsAutoSaving(true);
      localStorage.setItem('gs_project', JSON.stringify(project));
      const timer = setTimeout(() => setIsAutoSaving(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [project]);

  // Load project from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('gs_project');
    if (saved) {
      try {
        setProject(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load saved project");
      }
    }
  }, []);

  const handleBulkAction = (action: 'copy' | 'clear') => {
    if (!project) return;
    if (!confirm(`Are you sure you want to ${action === 'copy' ? 'copy all original text to translations' : 'clear all translations'}?`)) return;

    const newEntries = project.entries.map(e => ({
      ...e,
      translated: action === 'copy' ? e.original : "",
      tmEngineMatch: action === 'copy' ? project.engine : undefined
    }));
    setProject({ ...project, entries: newEntries });
  };

  const toggleSelect = (id: string, event?: React.MouseEvent) => {
    const newSelected = new Set(selectedIds);
    
    if (event?.shiftKey && lastSelectedId && filteredEntries.length > 0) {
      const ids = filteredEntries.map(e => e.id);
      const start = ids.indexOf(lastSelectedId);
      const end = ids.indexOf(id);
      
      if (start !== -1 && end !== -1) {
        const range = ids.slice(Math.min(start, end), Math.max(start, end) + 1);
        const isSelecting = !selectedIds.has(id);
        range.forEach(rangeId => {
          if (isSelecting) newSelected.add(rangeId);
          else newSelected.delete(rangeId);
        });
      }
    } else {
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
    }
    
    setSelectedIds(newSelected);
    setLastSelectedId(id);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredEntries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEntries.map(e => e.id)));
    }
  };

  const filteredEntries = useMemo(() => {
    if (!project) return [];
    if (!searchQuery) return project.entries;
    const q = searchQuery.toLowerCase();
    return project.entries.filter(e => 
      e.original.toLowerCase().includes(q) || 
      e.translated.toLowerCase().includes(q)
    );
  }, [project, searchQuery]);

  const tmData = useMemo(() => getTM(), [activeTab]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-main text-white">
      {/* Header */}
      <header className="border-b border-white/5 bg-[#0B0118]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('upload')}>
            <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center shadow-lg shadow-accent/20">
              <Globe className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight leading-none">Game Translation Hub</h1>
              <span className="text-[10px] opacity-50">Multi-engine • RPGMaker MV/MZ • All game formats</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 mr-4">
              <span className="px-2 py-0.5 bg-white/5 rounded text-[10px] font-bold text-white/40 border border-white/10">Free • No install</span>
            </div>
            
            <nav className="hidden lg:flex items-center gap-1 bg-white/5 p-1 rounded-xl">
              <button 
                onClick={() => setActiveTab('community')}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold text-white/60 hover:text-white hover:bg-white/5 transition-all"
              >
                <MessageSquare size={14} />
                Forum
              </button>
              <button 
                onClick={() => setActiveTab('donate')}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold text-white/60 hover:text-white hover:bg-white/5 transition-all"
              >
                <Heart size={14} />
                Donasi
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6">
        <AnimatePresence mode="wait">
          {activeTab === 'upload' && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center pt-8"
            >
              <div className="text-center mb-12 max-w-3xl">
                <div className="flex items-center justify-center gap-4 mb-6">
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="inline-flex items-center gap-2 bg-accent/10 text-accent px-4 py-1.5 rounded-full text-[10px] font-bold border border-accent/20"
                  >
                    <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
                    v2.5.0 Stable
                  </motion.div>
                  {isAutoSaving && (
                    <div className="flex items-center gap-2 text-[10px] font-bold text-white/20 uppercase tracking-widest">
                      <Loader2 size={10} className="animate-spin" />
                      Auto-saving...
                    </div>
                  )}
                </div>
                <h2 className="text-5xl font-bold tracking-tight mb-4 leading-tight">
                  Terjemahkan Game <br />
                  <span className="text-secondary">Tanpa Sentuh Kode</span>
                </h2>
                <p className="text-white/40 text-sm leading-relaxed max-w-2xl mx-auto">
                  Platform all-in-one untuk fansub dan translator game. Ekstrak teks otomatis dari berbagai engine, terjemahkan dengan AI tercanggih, dan ekspor kembali ke format asli.
                </p>
              </div>

              {project && (
                <div className="w-full max-w-4xl bg-accent/5 border border-accent/20 rounded-2xl p-6 mb-8 flex items-center justify-between shadow-2xl shadow-accent/5">
                  <div className="flex items-center gap-6">
                    <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center text-accent border border-accent/20">
                      <FileText size={24} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">{project.name}</h4>
                      <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest mt-0.5">{project.engine} • {project.entries.length} Strings</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-white/20 uppercase mb-1">Completion</p>
                      <p className="text-xl font-black text-accent">{stats.percent}%</p>
                    </div>
                    <button 
                      onClick={() => {
                        if(confirm('Reset current project?')) {
                          setProject(null);
                          localStorage.removeItem('gs_project');
                        }
                      }}
                      className="p-3 rounded-xl bg-white/5 border border-white/10 text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-4xl mb-8">
                {[
                  { name: "RPGMaker MV/MZ", desc: "Full support for Maps, Common Events, Actors, Items, and System terms.", icon: <Zap size={18} />, color: "text-amber-400" },
                  { name: "Ren'Py Engine", desc: "Dialogue extraction from .rpy files with character name detection.", icon: <BookOpen size={18} />, color: "text-purple-400" },
                  { name: "KiriKiri / KAG", desc: "Smart extraction for .ks and .tjs files with tag preservation.", icon: <Layers size={18} />, color: "text-blue-400" },
                  { name: "Subtitles / SRT", desc: "Translate movie subtitles or cutscenes with timestamp preservation.", icon: <FileText size={18} />, color: "text-emerald-400" },
                  { name: "Unity / JSON", desc: "Recursive parsing for complex localization files and i18n data.", icon: <Globe size={18} />, color: "text-indigo-400" },
                  { name: "Generic / CSV", desc: "Support for spreadsheet-based game data and simple text tables.", icon: <Play size={18} />, color: "text-cyan-400" },
                ].map((engine, i) => (
                  <div key={i} className="engine-card p-4 rounded-xl flex items-start gap-3 cursor-default group">
                    <div className={cn("w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center transition-colors group-hover:bg-white/10", engine.color)}>
                      {engine.icon}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white/80">{engine.name}</h4>
                      <p className="text-[10px] text-white/40 mt-1 leading-relaxed">{engine.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="w-full max-w-4xl bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2 flex items-center justify-between mb-8">
                <div className="flex items-center gap-2 text-amber-500 text-[10px] font-bold">
                  <Info size={14} />
                  RPGMaker MV/MZ — Smart Parser Active
                </div>
                <button className="text-[10px] text-amber-500/60 hover:text-amber-500 flex items-center gap-1 font-bold">
                  ▼ show files
                </button>
              </div>

              <div className="w-full max-w-4xl bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
                <div className="flex items-center gap-2 mb-6 text-xs font-bold text-white/60">
                  <Globe size={14} />
                  Pengaturan Bahasa & Encoding
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold text-white/40 uppercase mb-2">Bahasa Sumber</label>
                    <div className="relative">
                      <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
                      <select className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-xs font-bold focus:outline-none focus:border-accent appearance-none">
                        <option>🌏 Auto Detect</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-white/40 uppercase mb-2">Bahasa Target</label>
                    <div className="relative">
                      <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
                      <select 
                        value={targetLang}
                        onChange={(e) => setTargetLang(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-xs font-bold focus:outline-none focus:border-accent appearance-none"
                      >
                        <option>🇮🇩 Indonesian</option>
                        <option>🇺🇸 English</option>
                        <option>🇪🇸 Spanish</option>
                        <option>🇫🇷 French</option>
                        <option>🇯🇵 Japanese</option>
                        <option>🇨🇳 Chinese</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <label className="block text-[10px] font-bold text-white/40 uppercase mb-2">File Encoding</label>
                  <div className="relative">
                    <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
                    <select className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-xs font-bold focus:outline-none focus:border-accent appearance-none">
                      <option>🌏 Auto Detect</option>
                      <option>UTF-8</option>
                      <option>Shift-JIS</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-white/20 mt-2 italic">Auto detect works best for Japanese (Shift-JIS) files</p>
                </div>
              </div>

              <div className="w-full max-w-4xl bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
                <div className="flex items-center gap-2 mb-6 text-xs font-bold text-white/60">
                  <Zap size={14} />
                  Engine Terjemahan
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { name: "Google Translate", status: "Free", desc: "Free, fast, supports 100+ languages", icon: <Globe size={16} />, active: provider === 'google', id: 'google' },
                    { name: "MyMemory", status: "Free", desc: "Free up to 5000 chars/day, no key required", icon: <History size={16} />, active: provider === 'mymemory', id: 'mymemory' },
                    { name: "Lingva Translate", status: "Free", desc: "Free Google Translate alternative frontend", icon: <Zap size={16} />, active: provider === 'lingva', id: 'lingva' },
                    { name: "LibreTranslate", status: "Free", desc: "Open source, privacy-friendly", icon: <Shield size={16} />, active: false, id: 'libre' },
                    { name: "Bing Translate", status: "Free", desc: "Microsoft translation engine", icon: <Zap size={16} />, active: provider === 'bing', id: 'bing' },
                    { name: "Apertium", status: "Free", desc: "Free open-source rule-based translation", icon: <Globe size={16} />, active: false, id: 'apertium' },
                    { name: "DeepL", status: "Pro", desc: "High quality, requires free API key", icon: <Sparkles size={16} />, active: false, id: 'deepl' },
                    { name: "ChatGPT (OpenAI)", status: "Pro", desc: "AI-powered, best quality, requires API key", icon: <MessageSquare size={16} />, active: false, id: 'openai' },
                    { name: "Gemini (Google AI)", status: "Pro", desc: "AI-powered, best quality, requires API key", icon: <Sparkles size={16} />, active: provider === 'gemini', id: 'gemini' },
                  ].map((p) => (
                    <div 
                      key={p.id} 
                      onClick={() => (p.id === 'gemini' || p.id === 'google' || p.id === 'bing' || p.id === 'mymemory' || p.id === 'lingva') && setProvider(p.id as any)}
                      className={cn(
                        "p-4 rounded-xl border flex items-center gap-4 cursor-pointer transition-all",
                        p.active ? "bg-accent/20 border-accent" : "bg-white/5 border-white/10 hover:border-white/20"
                      )}
                    >
                      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", p.active ? "bg-accent text-white" : "bg-white/5 text-white/40")}>
                        {p.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold">{p.name}</h4>
                          <span className={cn("text-[8px] font-bold px-1.5 py-0.5 rounded", p.status === 'Free' ? "bg-emerald-500/20 text-emerald-500" : "bg-blue-500/20 text-blue-500")}>{p.status}</span>
                        </div>
                        <p className="text-[9px] text-white/40 mt-0.5">{p.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button 
                onClick={() => project && setActiveTab('editor')}
                disabled={!project}
                className="w-full max-w-4xl btn-primary py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale mb-12"
              >
                Terjemahkan Files
                <ChevronRight size={18} />
              </button>

              <div className="w-full max-w-4xl bg-white/5 border border-white/10 rounded-2xl p-8 mb-12">
                <div className="flex items-center gap-2 mb-8 text-xs font-bold text-white/60">
                  <BookOpen size={14} />
                  Panduan Penggunaan
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {[
                    { step: "1", title: "RPGMaker MV/MZ", desc: "Upload file dari folder /data/ game kamu. Map001.json, Actors.json, Items.json, CommonEvents.json, dll. Parser khusus akan mengekstrak dialog dan teks otomatis." },
                    { step: "2", title: "KiriKiri2 / Visual Novel", desc: "Upload file .ks, .scn, atau .tjs. Teks dialog akan diekstrak, tag KAG seperti [r] [l][p] akan dipertahankan." },
                    { step: "3", title: "File Bertanda Jepang (Shift-JIS)", desc: "Pilih encoding 'Auto Detect' atau 'Shift-JIS' secara manual di bagian Language Settings untuk file game Jepang lama." },
                    { step: "4", title: "Batch & Download", desc: "Upload banyak file sekaligus. Setelah selesai, download satu per satu atau klik 'Download All (ZIP)' untuk semua file sekaligus." },
                  ].map((item, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-white/40 flex-shrink-0">
                        {item.step}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white/80 mb-1">{item.title}</h4>
                        <p className="text-[11px] text-white/40 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-full max-w-4xl flex items-center justify-between">
                <button 
                  onClick={() => setActiveTab('community')}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-white/60 hover:text-white hover:bg-white/10 transition-all"
                >
                  <MessageSquare size={16} />
                  Komunitas Forum
                </button>
                <button 
                  onClick={() => setActiveTab('donate')}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-500 hover:bg-red-500/20 transition-all"
                >
                  <Heart size={16} fill="currentColor" />
                  Dukung Developer via QRIS
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'editor' && project && (
            <motion.div 
              key="editor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col h-[calc(100vh-10rem)]"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-6">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">{project.name}</h2>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="px-2 py-0.5 bg-white/5 rounded text-[10px] font-bold uppercase tracking-widest text-white/40 border border-white/10">{project.engine}</span>
                      <span className="text-xs font-medium text-white/20">{project.entries.length} Strings</span>
                      <div className="flex items-center gap-2 ml-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={useTM} 
                            onChange={(e) => setUseTM(e.target.checked)}
                            className="w-4 h-4 rounded border-white/10 bg-white/5 text-accent focus:ring-accent"
                          />
                          <span className="text-xs font-semibold text-white/40">Auto-TM</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="h-10 w-[1px] bg-white/5" />

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-white/20 uppercase">Engine:</span>
                    <select 
                      value={provider}
                      onChange={(e) => setProvider(e.target.value as any)}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-accent appearance-none cursor-pointer"
                    >
                      <option value="gemini">Gemini 3.0</option>
                      <option value="google">Google API</option>
                      <option value="bing">Bing API</option>
                      <option value="mymemory">MyMemory</option>
                      <option value="lingva">Lingva</option>
                    </select>
                  </div>

                  <div className="h-10 w-[1px] bg-white/5" />

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                    <input 
                      type="text"
                      placeholder="Search strings..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm w-64 focus:outline-none focus:border-accent transition-all text-white"
                    />
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end mr-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold text-white/40 uppercase">Progress</span>
                      <span className="text-xs font-bold text-accent">{stats.percent}%</span>
                    </div>
                    <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/10">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${stats.percent}%` }}
                        className="h-full bg-accent"
                      />
                    </div>
                  </div>

                  <div className="h-10 w-[1px] bg-white/5" />

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-white/20 uppercase">Bulk:</span>
                    <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
                      <button 
                        onClick={() => handleBulkAction('copy')}
                        title="Copy Original to Translated"
                        className="p-2 rounded-md text-white/40 hover:text-white hover:bg-white/5 transition-all"
                      >
                        <Copy size={14} />
                      </button>
                      <button 
                        onClick={() => handleBulkAction('clear')}
                        title="Clear All Translations"
                        className="p-2 rounded-md text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="h-10 w-[1px] bg-white/5" />

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-white/20 uppercase">Format:</span>
                    <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
                      <button 
                        onClick={() => setExportMode('zip')}
                        className={cn(
                          "px-3 py-1 rounded-md text-[10px] font-bold transition-all",
                          exportMode === 'zip' ? "bg-white/10 text-white" : "text-white/20 hover:text-white/40"
                        )}
                      >
                        ZIP
                      </button>
                      <button 
                        onClick={() => setExportMode('individual')}
                        className={cn(
                          "px-3 py-1 rounded-md text-[10px] font-bold transition-all",
                          exportMode === 'individual' ? "bg-white/10 text-white" : "text-white/20 hover:text-white/40"
                        )}
                      >
                        FILES
                      </button>
                    </div>
                  </div>

                  <div className="h-10 w-[1px] bg-white/5" />

                  {selectedIds.size > 0 && (
                    <button 
                      onClick={() => handleTranslateBatch()}
                      disabled={isTranslating}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-600/30 transition-all disabled:opacity-50"
                    >
                      <Layers size={16} />
                      Translate Selected ({selectedIds.size})
                    </button>
                  )}

                  <button 
                    onClick={() => handleTranslateBatch(project.entries.map(e => e.id))}
                    disabled={isTranslating}
                    className={cn(
                      "flex items-center gap-2 px-8 py-2.5 rounded-xl text-sm font-bold transition-all",
                      isTranslating 
                        ? "bg-white/5 text-white/20 cursor-not-allowed" 
                        : "btn-primary text-white active:scale-95"
                    )}
                  >
                    {isTranslating ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Play size={16} fill="currentColor" />
                        Translate All
                      </>
                    )}
                  </button>

                  <button 
                    onClick={handleExport}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all active:scale-95"
                  >
                    <Download size={16} />
                    Export
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden border border-white/10 rounded-[2rem] bg-white/5 flex flex-col shadow-2xl">
                {/* Table Header */}
                <div className="grid grid-cols-[60px_40px_1fr_1fr_120px] bg-white/[0.02] border-b border-white/5 px-6 py-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/20">#</div>
                  <div className="flex items-center justify-center">
                    <button onClick={toggleSelectAll} className="text-white/20 hover:text-white transition-colors">
                      {selectedIds.size === filteredEntries.length && filteredEntries.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
                    </button>
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/20">Source Text</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/20">Translation</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/20 text-right">Status</div>
                </div>

                {/* Table Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {filteredEntries.map((entry, idx) => (
                    <div 
                      key={entry.id} 
                      className={cn(
                        "grid grid-cols-[60px_40px_1fr_1fr_120px] border-b border-white/[0.02] px-6 py-6 transition-all group",
                        selectedIds.has(entry.id) ? "bg-accent/5" : "hover:bg-white/[0.02]"
                      )}
                    >
                      <div className="text-[10px] font-mono font-bold text-white/10 mt-1">{idx + 1}</div>
                      <div className="flex items-start justify-center pt-1">
                        <button onClick={(e) => toggleSelect(entry.id, e)} className={cn(
                          "transition-all",
                          selectedIds.has(entry.id) ? "text-accent scale-110" : "text-white/10 group-hover:text-white/30"
                        )}>
                          {selectedIds.has(entry.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                        </button>
                      </div>
                      <div className="pr-10">
                        <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap text-white/80">{entry.original}</p>
                        {entry.context && (
                          <span className="inline-block px-2 py-0.5 bg-white/5 text-[9px] font-bold uppercase tracking-tighter text-white/30 mt-3 rounded border border-white/5">
                            {entry.context}
                          </span>
                        )}
                      </div>
                      <div className="pr-10">
                        {entry.translated ? (
                          <div className="relative group/edit">
                            <textarea 
                              value={entry.translated}
                              onChange={(e) => {
                                const val = e.target.value;
                                const newEntries = project.entries.map(ent => 
                                  ent.original === entry.original ? { ...ent, translated: val, tmEngineMatch: project.engine } : ent
                                );
                                setProject({ ...project, entries: newEntries });
                                saveToTM(entry.original, val, targetLang, project.engine);
                              }}
                              className="w-full bg-transparent text-sm leading-relaxed whitespace-pre-wrap text-white focus:outline-none focus:ring-1 focus:ring-white/10 rounded p-1 resize-none"
                              rows={Math.max(1, entry.translated.split('\n').length)}
                            />
                            {entry.tmEngineMatch && (
                              <div className={cn(
                                "absolute -right-2 -top-2 flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full border",
                                entry.tmEngineMatch === project.engine 
                                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/20"
                                  : "bg-amber-500/20 text-amber-400 border-amber-500/20"
                              )}>
                                <History size={8} />
                                {entry.tmEngineMatch === project.engine ? "TM MATCH" : `TM (${entry.tmEngineMatch.toUpperCase()})`}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm italic text-white/10">Awaiting translation...</p>
                        )}
                      </div>
                      <div className="flex justify-end items-start pt-1">
                        {entry.translated ? (
                          <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-bold border border-emerald-500/20">
                            <CheckCircle2 size={12} />
                            DONE
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 bg-white/5 text-white/20 px-3 py-1 rounded-full text-[10px] font-bold border border-white/10">
                            <Loader2 size={12} className={isTranslating ? "animate-spin" : ""} />
                            PENDING
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'tm' && (
            <motion.div 
              key="tm"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="max-w-4xl mx-auto pt-12"
            >
              <div className="flex items-center justify-between mb-12">
                <div>
                  <h2 className="text-4xl font-bold tracking-tight mb-2">Translation Memory</h2>
                  <p className="text-white/40">Manage your stored translations for consistent results.</p>
                </div>
                <button 
                  onClick={() => {
                    if (confirm('Clear all translation memory?')) {
                      clearTM();
                      setActiveTab('upload');
                    }
                  }}
                  className="flex items-center gap-2 text-red-400 hover:text-red-300 font-bold text-sm px-4 py-2 rounded-xl hover:bg-red-500/10 transition-all"
                >
                  <Trash2 size={18} />
                  Clear All
                </button>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
                <div className="grid grid-cols-[1fr_1fr_100px] bg-white/[0.02] px-8 py-4 border-b border-white/5">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/20">Source</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/20">Translation</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/20 text-right">Lang</div>
                </div>
                <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                  {Object.values(tmData).length > 0 ? (
                    Object.values(tmData).map((entry, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_100px] px-8 py-6 border-b border-white/[0.02] hover:bg-white/[0.02] transition-all">
                        <div className="text-sm font-medium text-white/40 pr-8">{entry.original}</div>
                        <div className="text-sm font-bold text-white pr-8">{entry.translated}</div>
                        <div className="text-right">
                          <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-bold text-white/20 border border-white/5">{entry.targetLang}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-20 text-center">
                      <History size={48} className="mx-auto text-white/5 mb-4" />
                      <p className="text-white/20 font-medium">No translations stored yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'guide' && (
            <motion.div 
              key="guide"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto pt-12"
            >
              <div className="text-center mb-12">
                <h2 className="text-4xl font-bold tracking-tight mb-4">User Guide</h2>
                <p className="text-white/40">Learn how to translate your game scripts efficiently.</p>
              </div>

              <div className="grid grid-cols-1 gap-8">
                <div className="bg-white/5 p-8 rounded-[2rem] border border-white/10 shadow-2xl">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-10 h-10 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center border border-blue-500/20">
                      <span className="font-bold">1</span>
                    </div>
                    <h3 className="text-xl font-bold">Upload Your Files</h3>
                  </div>
                  <p className="text-white/60 leading-relaxed mb-4 text-sm">
                    Drag and drop your game script files onto the upload area. We support:
                  </p>
                  <ul className="list-disc list-inside text-white/60 space-y-2 ml-4 text-sm">
                    <li><strong>RPG Maker MV/MZ</strong>: .json files from the <code className="bg-white/5 px-1 rounded border border-white/10">data/</code> folder.</li>
                    <li><strong>KiriKiri</strong>: .ks and .tjs script files.</li>
                  </ul>
                </div>

                <div className="bg-white/5 p-8 rounded-[2rem] border border-white/10 shadow-2xl">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center border border-emerald-500/20">
                      <span className="font-bold">2</span>
                    </div>
                    <h3 className="text-xl font-bold">Configure Translation</h3>
                  </div>
                  <p className="text-white/60 leading-relaxed text-sm">
                    Select your target language and preferred AI provider (Gemini, Google, or Bing) from the header. 
                    Enable <strong>Auto-TM</strong> to automatically reuse previous translations.
                  </p>
                </div>

                <div className="bg-white/5 p-8 rounded-[2rem] border border-white/10 shadow-2xl">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-10 h-10 bg-purple-500/10 text-purple-400 rounded-xl flex items-center justify-center border border-purple-500/20">
                      <span className="font-bold">3</span>
                    </div>
                    <h3 className="text-xl font-bold">Edit & Translate</h3>
                  </div>
                  <p className="text-white/60 leading-relaxed text-sm">
                    Use the Editor to review strings. You can translate strings individually, in batches, or all at once. 
                    Manually edit any translation by clicking on the text area.
                  </p>
                </div>

                <div className="bg-white/5 p-8 rounded-[2rem] border border-white/10 shadow-2xl">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-10 h-10 bg-amber-500/10 text-amber-400 rounded-xl flex items-center justify-center border border-amber-500/20">
                      <span className="font-bold">4</span>
                    </div>
                    <h3 className="text-xl font-bold">Export Results</h3>
                  </div>
                  <p className="text-white/60 leading-relaxed text-sm">
                    Once finished, click the <strong>Export</strong> button to download a ZIP file containing your translated scripts. 
                    Simply replace the original files in your game directory.
                  </p>
                </div>

                <div className="bg-emerald-500/10 p-8 rounded-[2rem] border border-emerald-500/20 shadow-2xl">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-10 h-10 bg-white/5 text-emerald-400 rounded-xl flex items-center justify-center border border-white/10">
                      <ExternalLink size={20} />
                    </div>
                    <h3 className="text-xl font-bold text-emerald-400">Vercel Deployment</h3>
                  </div>
                  <p className="text-emerald-400/60 leading-relaxed text-sm">
                    This application is fully compatible with Vercel. You can deploy your own instance by connecting your GitHub repository. 
                    The API routes are already configured for serverless execution.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'community' && (
            <motion.div 
              key="community"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto pt-12"
            >
              <div className="flex items-center justify-between mb-12">
                <div>
                  <h2 className="text-4xl font-bold tracking-tight mb-2">Community Forum</h2>
                  <p className="text-white/40">Discuss translations, share tips, and get help.</p>
                </div>
                <button className="btn-primary text-white px-6 py-2 rounded-xl text-sm font-bold active:scale-95 transition-all">
                  New Topic
                </button>
              </div>

              <div className="space-y-4">
                {[
                  { title: "Best settings for RPG Maker MZ?", author: "GameDev99", replies: 12, time: "2h ago", tag: "Question", content: "I'm having trouble with some escape characters in MZ. Any tips?" },
                  { title: "KiriKiri tag preservation tips", author: "VisualNovelFan", replies: 8, time: "5h ago", tag: "Guide", content: "Here is how I preserve [ruby] tags using the custom context feature..." },
                  { title: "Gemini 3.0 vs Google Translate API", author: "TranslatorPro", replies: 24, time: "1d ago", tag: "Discussion", content: "I've noticed Gemini handles honorifics much better than Google..." },
                  { title: "Feature Request: Unity Support", author: "UnityDev", replies: 15, time: "2d ago", tag: "Request", content: "Can we get support for Unity .assets or .json localization files?" },
                  { title: "How to handle Shift-JIS encoding?", author: "RetroGamer", replies: 5, time: "3d ago", tag: "Question", content: "Old PC-98 games use Shift-JIS. How do I upload them here?" },
                ].map((topic, i) => (
                  <div key={i} className="bg-white/5 p-6 rounded-2xl border border-white/10 shadow-2xl hover:bg-white/[0.08] transition-all cursor-pointer group">
                    <div className="flex items-start justify-between">
                      <div className="flex gap-4">
                        <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-white/20">
                          <Users size={20} />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg group-hover:text-accent transition-colors">{topic.title}</h3>
                          <p className="text-xs text-white/40 mt-1 line-clamp-1">{topic.content}</p>
                          <div className="flex items-center gap-3 mt-3 text-[10px] text-white/20">
                            <span className="font-medium text-white/40">{topic.author}</span>
                            <span>•</span>
                            <span>{topic.time}</span>
                            <span>•</span>
                            <span className="px-2 py-0.5 bg-white/5 rounded uppercase font-bold tracking-wider border border-white/5">{topic.tag}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 text-white/20 text-sm">
                        <div className="flex items-center gap-2">
                          <MessageSquare size={16} />
                          <span>{topic.replies}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-12 p-8 bg-accent/10 rounded-[2rem] border border-accent/20 text-center">
                <HelpCircle className="mx-auto text-accent mb-4" size={32} />
                <h3 className="text-xl font-bold text-white mb-2">Need direct help?</h3>
                <p className="text-white/40 mb-6 text-sm">Join our Discord community for real-time support and collaboration.</p>
                <a 
                  href="https://discord.gg/gamescript" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-block btn-primary text-white px-8 py-3 rounded-xl font-bold active:scale-95 transition-all"
                >
                  Join Discord
                </a>
              </div>
            </motion.div>
          )}

          {activeTab === 'donate' && (
            <motion.div 
              key="donate"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-6xl mx-auto pt-12 pb-32"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
                {/* Left Column: Editorial Style */}
                <div className="lg:col-span-7">
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="mb-12"
                  >
                    <h2 className="text-[12vw] lg:text-[8rem] font-black leading-[0.85] tracking-tighter uppercase italic text-white mb-8">
                      Fuel the <br />
                      <span className="text-accent">Vision.</span>
                    </h2>
                    <div className="flex items-center gap-6 mb-12">
                      <div className="h-[1px] flex-1 bg-white/10" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.5em] text-white/20">Est. 2024</span>
                      <div className="h-[1px] flex-1 bg-white/10" />
                    </div>
                    <p className="text-2xl font-light leading-relaxed text-white/60 max-w-2xl">
                      Kami membangun alat ini untuk para fansub dan translator game yang ingin fokus pada cerita, bukan pada kerumitan kode. Dukungan Anda memastikan alat ini tetap gratis dan terus berkembang.
                    </p>
                  </motion.div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-8">
                      <div className="group">
                        <div className="text-4xl font-black text-white/10 mb-2 group-hover:text-accent/20 transition-colors">01</div>
                        <h4 className="text-xl font-bold mb-2">Infrastruktur AI</h4>
                        <p className="text-sm text-white/40 leading-relaxed">Biaya API Gemini Pro dan server GPU untuk pemrosesan bahasa alami yang akurat.</p>
                      </div>
                      <div className="group">
                        <div className="text-4xl font-black text-white/10 mb-2 group-hover:text-accent/20 transition-colors">02</div>
                        <h4 className="text-xl font-bold mb-2">Pengembangan Engine</h4>
                        <p className="text-sm text-white/40 leading-relaxed">Menambahkan dukungan untuk engine baru seperti Unity, Unreal, dan Wolf RPG.</p>
                      </div>
                    </div>
                    <div className="space-y-8">
                      <div className="group">
                        <div className="text-4xl font-black text-white/10 mb-2 group-hover:text-accent/20 transition-colors">03</div>
                        <h4 className="text-xl font-bold mb-2">Komunitas & Support</h4>
                        <p className="text-sm text-white/40 leading-relaxed">Menjaga forum tetap aktif dan memberikan bantuan teknis langsung di Discord.</p>
                      </div>
                      <div className="group">
                        <div className="text-4xl font-black text-white/10 mb-2 group-hover:text-accent/20 transition-colors">04</div>
                        <h4 className="text-xl font-bold mb-2">Open Source</h4>
                        <p className="text-sm text-white/40 leading-relaxed">Memastikan kode tetap terbuka dan dapat dikembangkan oleh siapa saja.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Premium Card Style */}
                <div className="lg:col-span-5">
                  <div className="sticky top-32">
                    <div className="relative group">
                      <div className="absolute -inset-1 bg-gradient-to-r from-accent to-purple-600 rounded-[3rem] blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                      <div className="relative bg-[#0B0118] border border-white/10 rounded-[3rem] p-10 shadow-2xl overflow-hidden">
                        {/* Decorative elements */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 blur-3xl rounded-full -mr-16 -mt-16" />
                        <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-600/10 blur-3xl rounded-full -ml-16 -mb-16" />

                        <div className="text-center mb-10">
                          <div className="inline-block px-4 py-1 bg-white/5 rounded-full border border-white/10 text-[10px] font-bold uppercase tracking-widest text-white/40 mb-4">
                            Metode Pembayaran
                          </div>
                          <h3 className="text-3xl font-black italic uppercase tracking-tighter">Scan & Support</h3>
                        </div>

                        <div className="bg-white p-6 rounded-[2.5rem] shadow-2xl mb-10 relative overflow-hidden group/qris">
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/qris:opacity-100 transition-all flex items-center justify-center backdrop-blur-sm">
                            <div className="bg-white text-black px-6 py-3 rounded-full font-black uppercase text-xs tracking-widest transform translate-y-4 group-hover/qris:translate-y-0 transition-transform">
                              Zoom QR Code
                            </div>
                          </div>
                          <img 
                            src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=MitraBL01576732|NMID:ID2023293495578" 
                            alt="Donation QRIS" 
                            className="w-full aspect-square object-contain"
                          />
                        </div>

                        <div className="space-y-4 mb-10">
                          <div className="flex items-center justify-between p-5 bg-white/5 rounded-2xl border border-white/10 group/info hover:bg-white/10 transition-colors">
                            <div>
                              <p className="text-[10px] font-bold text-white/20 uppercase mb-1">Merchant</p>
                              <p className="text-sm font-bold text-white/80">MitraBL01576732</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-bold text-white/20 uppercase mb-1">NMID</p>
                              <p className="text-[10px] font-mono font-bold text-white/40">ID2023293495578</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-8">
                          <button className="flex items-center justify-center gap-2 bg-white text-black py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-accent hover:text-white transition-all active:scale-95">
                            <Coffee size={16} />
                            Trakteer
                          </button>
                          <button className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-white/10 transition-all active:scale-95">
                            <CreditCard size={16} />
                            Saweria
                          </button>
                        </div>

                        <div className="flex items-center justify-center gap-6 opacity-30 grayscale hover:grayscale-0 transition-all duration-700">
                          <img src="https://upload.wikimedia.org/wikipedia/commons/e/e1/Logo_DANA.svg" alt="DANA" className="h-4" />
                          <img src="https://upload.wikimedia.org/wikipedia/commons/8/8e/Gopay_logo.svg" alt="Gopay" className="h-4" />
                          <img src="https://upload.wikimedia.org/wikipedia/commons/e/eb/Logo_ovo_purple.svg" alt="OVO" className="h-4" />
                          <img src="https://upload.wikimedia.org/wikipedia/commons/a/ad/Logo_LinkAja.svg" alt="LinkAja" className="h-4" />
                        </div>

                  <div className="mt-10 pt-8 border-t border-white/5 text-center">
                    <p className="text-[9px] font-mono font-bold text-white/10 uppercase tracking-[0.5em]">Auth: 93600503-X-2024</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-12 bg-white mt-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-[#1A1A1A] rounded-lg flex items-center justify-center">
                  <Globe className="text-white w-5 h-5" />
                </div>
                <h1 className="font-bold text-lg tracking-tight">GameScript.ai</h1>
              </div>
              <p className="text-gray-400 text-sm max-w-sm leading-relaxed">
                Professional game script translation tool. Supporting KiriKiri and RPG Maker engines with AI-powered accuracy and code preservation.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-sm uppercase tracking-widest mb-6">Engines</h4>
              <ul className="space-y-4 text-sm text-gray-400 font-medium">
                <li className="hover:text-[#1A1A1A] cursor-pointer transition-colors">RPG Maker MV/MZ</li>
                <li className="hover:text-[#1A1A1A] cursor-pointer transition-colors">KiriKiri (KS/TJS)</li>
                <li className="hover:text-[#1A1A1A] cursor-pointer transition-colors">Unity (Coming Soon)</li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-sm uppercase tracking-widest mb-6">Resources</h4>
              <ul className="space-y-4 text-sm text-gray-400 font-medium">
                <li className="hover:text-[#1A1A1A] cursor-pointer transition-colors">Documentation</li>
                <li className="hover:text-[#1A1A1A] cursor-pointer transition-colors">API Reference</li>
                <li className="hover:text-[#1A1A1A] cursor-pointer transition-colors">Community</li>
              </ul>
            </div>
          </div>
          <div className="flex justify-between items-center pt-12 border-t border-gray-50">
            <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.2em]">© 2024 GAMESCRIPT HUB • BUILT FOR TRANSLATORS</p>
            <div className="flex gap-8">
              <a href="#" className="text-[10px] font-bold text-gray-300 hover:text-[#1A1A1A] transition-colors uppercase tracking-[0.2em]">Privacy</a>
              <a href="#" className="text-[10px] font-bold text-gray-300 hover:text-[#1A1A1A] transition-colors uppercase tracking-[0.2em]">Terms</a>
            </div>
          </div>
        </div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #E5E7EB;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #D1D5DB;
        }
      `}</style>
    </div>
  );
}
