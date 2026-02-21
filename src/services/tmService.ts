export interface TMEntry {
  original: string;
  translated: string;
  targetLang: string;
  engine: string;
}

const TM_KEY = 'game_script_tm';

export function saveToTM(original: string, translated: string, targetLang: string, engine: string) {
  if (!original || !translated) return;
  
  const tm = getTM();
  const key = `${targetLang}:${original}`;
  tm[key] = { original, translated, targetLang, engine };
  
  localStorage.setItem(TM_KEY, JSON.stringify(tm));
}

export function getTM(): Record<string, TMEntry> {
  const stored = localStorage.getItem(TM_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch (e) {
    return {};
  }
}

export function findInTM(original: string, targetLang: string): TMEntry | null {
  const tm = getTM();
  const key = `${targetLang}:${original}`;
  return tm[key] || null;
}

export function clearTM() {
  localStorage.removeItem(TM_KEY);
}
