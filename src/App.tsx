import React, { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X, ChevronRight, Globe, Download, Play, CheckCircle2, Loader2, Square, CheckSquare, Layers } from 'lucide-react';
import { cn } from './lib/utils';
import { parseRPGMaker, parseKiriKiri, applyTranslations, type GameScriptEntry, type TranslationProject } from './services/parserService';
import { translateGameText } from './services/geminiService';
import JSZip from 'jszip';

type TranslationProvider = 'gemini' | 'google' | 'bing';

export default function App() {
  const [project, setProject] = useState<TranslationProject | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [targetLang, setTargetLang] = useState('Indonesian');
  const [provider, setProvider] = useState<TranslationProvider>('gemini');
  const [activeTab, setActiveTab] = useState<'upload' | 'editor'>('upload');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const newFiles: { name: string; content: string }[] = [];
    let allEntries: GameScriptEntry[] = [];
    let detectedEngine: "kirikiri" | "rpgmaker" = "rpgmaker";

    for (const file of acceptedFiles) {
      const content = await file.text();
      newFiles.push({ name: file.name, content });

      if (file.name.endsWith('.json')) {
        detectedEngine = "rpgmaker";
        allEntries = [...allEntries, ...parseRPGMaker(file.name, content)];
      } else if (file.name.endsWith('.ks') || file.name.endsWith('.tjs')) {
        detectedEngine = "kirikiri";
        allEntries = [...allEntries, ...parseKiriKiri(file.name, content)];
      }
    }

    if (allEntries.length > 0) {
      setProject({
        id: Math.random().toString(36).substr(2, 9),
        name: "New Translation Project",
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
        const entryIdx = updatedEntries.findIndex(e => e.id === batch[idx].id);
        if (entryIdx !== -1) {
          updatedEntries[entryIdx].translated = res.translated;
        }
      });

      setProject({ ...project, entries: updatedEntries });
    }

    setIsTranslating(false);
  };

  const handleDownload = async () => {
    if (!project) return;
    const zip = new JSZip();

    project.files.forEach(file => {
      const fileEntries = project.entries.filter(e => e.id.includes(file.name));
      const translatedContent = applyTranslations(file.content, fileEntries, project.engine);
      // Ensure the file name in the zip matches the original file name
      zip.file(file.name, translatedContent);
    });

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Use the project name but keep it clean
    const safeName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    a.download = `${safeName}_translated.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  const toggleSelect = (id: string, event?: React.MouseEvent) => {
    const newSelected = new Set(selectedIds);
    
    if (event?.shiftKey && lastSelectedId && project) {
      const ids = project.entries.map(e => e.id);
      const start = ids.indexOf(lastSelectedId);
      const end = ids.indexOf(id);
      const range = ids.slice(Math.min(start, end), Math.max(start, end) + 1);
      
      const isSelecting = !selectedIds.has(id);
      range.forEach(rangeId => {
        if (isSelecting) newSelected.add(rangeId);
        else newSelected.delete(rangeId);
      });
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
    if (selectedIds.size === project?.entries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(project?.entries.map(e => e.id)));
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--line)] bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[var(--ink)] rounded-lg flex items-center justify-center">
              <Globe className="text-[var(--bg)] w-5 h-5" />
            </div>
            <h1 className="font-serif italic text-xl tracking-tight">GameScript.ai</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-[var(--bg)] px-3 py-1 rounded-full border border-[var(--line)]">
              <span className="text-[10px] font-mono uppercase opacity-50">Provider:</span>
              <select 
                value={provider}
                onChange={(e) => setProvider(e.target.value as TranslationProvider)}
                className="bg-transparent text-xs font-medium focus:outline-none"
              >
                <option value="gemini">Gemini AI</option>
                <option value="google">Google Translate</option>
                <option value="bing">Bing Translate</option>
              </select>
            </div>

            <select 
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="bg-transparent border border-[var(--line)] rounded-full px-4 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--ink)]"
            >
              <option>Indonesian</option>
              <option>English</option>
              <option>Spanish</option>
              <option>French</option>
              <option>Japanese</option>
              <option>Chinese</option>
            </select>
            
            {project && (
              <button 
                onClick={handleDownload}
                className="flex items-center gap-2 bg-[var(--ink)] text-[var(--bg)] px-5 py-1.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Download size={16} />
                Export ZIP
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6">
        {activeTab === 'upload' ? (
          <div className="h-[calc(100vh-12rem)] flex flex-col items-center justify-center">
            <div className="text-center mb-12 max-w-2xl">
              <h2 className="text-5xl font-serif italic mb-4">Translate your game scripts with precision.</h2>
              <p className="text-muted-foreground text-lg">
                Upload your RPG Maker JSON or KiriKiri KS files. Our AI preserves engine tags while delivering natural translations.
              </p>
            </div>

            <div 
              {...getRootProps()} 
              className={cn(
                "w-full max-w-2xl aspect-video border-2 border-dashed rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all",
                isDragActive ? "border-[var(--ink)] bg-[var(--ink)]/5" : "border-[var(--line)] hover:border-[var(--ink)]/50"
              )}
            >
              <input {...getInputProps()} />
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-[var(--line)] flex items-center justify-center mb-6">
                <Upload className="text-[var(--ink)]" />
              </div>
              <p className="text-lg font-medium mb-1">Drop your script files here</p>
              <p className="text-sm text-muted-foreground">Supports .json, .ks, .tjs</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-[calc(100vh-10rem)]">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-serif italic">{project?.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-mono uppercase tracking-widest opacity-50">{project?.engine} ENGINE</span>
                  <span className="text-xs opacity-50">•</span>
                  <span className="text-xs font-mono uppercase tracking-widest opacity-50">{project?.entries.length} STRINGS</span>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {selectedIds.size > 0 && (
                  <button 
                    onClick={() => handleTranslateBatch()}
                    disabled={isTranslating}
                    className="flex items-center gap-2 px-6 py-2 rounded-full text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-all disabled:opacity-50"
                  >
                    <Layers size={16} />
                    Translate Selected ({selectedIds.size})
                  </button>
                )}

                <button 
                  onClick={() => handleTranslateBatch(project?.entries.map(e => e.id))}
                  disabled={isTranslating}
                  className={cn(
                    "flex items-center gap-2 px-6 py-2 rounded-full text-sm font-medium transition-all",
                    isTranslating 
                      ? "bg-[var(--line)] text-[var(--ink)] cursor-not-allowed" 
                      : "bg-[var(--ink)] text-[var(--bg)] hover:scale-105 active:scale-95"
                  )}
                >
                  {isTranslating ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      Translating...
                    </>
                  ) : (
                    <>
                      <Play size={16} fill="currentColor" />
                      Translate All
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden border border-[var(--line)] rounded-2xl bg-white flex flex-col">
              {/* Table Header */}
              <div className="grid grid-cols-[60px_40px_1fr_1fr_100px] bg-[var(--bg)] border-b border-[var(--line)] px-4 py-3">
                <div className="text-[10px] font-mono uppercase tracking-widest opacity-50">ID</div>
                <div className="flex items-center justify-center">
                  <button onClick={toggleSelectAll} className="opacity-50 hover:opacity-100">
                    {selectedIds.size === project?.entries.length ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                </div>
                <div className="text-[10px] font-mono uppercase tracking-widest opacity-50">Original Text</div>
                <div className="text-[10px] font-mono uppercase tracking-widest opacity-50">Translation ({targetLang})</div>
                <div className="text-[10px] font-mono uppercase tracking-widest opacity-50 text-right">Status</div>
              </div>

              {/* Table Body */}
              <div className="flex-1 overflow-y-auto">
                {project?.entries.map((entry, idx) => (
                  <div 
                    key={entry.id} 
                    className={cn(
                      "grid grid-cols-[60px_40px_1fr_1fr_100px] border-b border-[var(--line)] px-4 py-4 transition-colors group",
                      selectedIds.has(entry.id) ? "bg-emerald-50/50" : "hover:bg-[var(--bg)]/50"
                    )}
                  >
                    <div className="text-[10px] font-mono opacity-30 mt-1">{idx + 1}</div>
                    <div className="flex items-start justify-center pt-1">
                      <button onClick={(e) => toggleSelect(entry.id, e)} className={cn(
                        "transition-colors",
                        selectedIds.has(entry.id) ? "text-emerald-600" : "opacity-20 group-hover:opacity-100"
                      )}>
                        {selectedIds.has(entry.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                    </div>
                    <div className="pr-6">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{entry.original}</p>
                      {entry.context && (
                        <span className="text-[10px] font-mono uppercase tracking-tighter opacity-40 mt-2 block">
                          {entry.context}
                        </span>
                      )}
                    </div>
                    <div className="pr-6">
                      {entry.translated ? (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--ink)]">{entry.translated}</p>
                      ) : (
                        <p className="text-sm italic opacity-30">Pending translation...</p>
                      )}
                    </div>
                    <div className="flex justify-end items-start pt-1">
                      {entry.translated ? (
                        <CheckCircle2 size={16} className="text-emerald-500" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-[var(--line)]" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--line)] py-6 bg-white">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <p className="text-xs opacity-40 font-mono">© 2024 GAMESCRIPT.AI • MULTI-ENGINE SUPPORT</p>
          <div className="flex gap-6">
            <a href="#" className="text-xs opacity-40 hover:opacity-100 transition-opacity font-mono uppercase tracking-widest">Documentation</a>
            <a href="#" className="text-xs opacity-40 hover:opacity-100 transition-opacity font-mono uppercase tracking-widest">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
