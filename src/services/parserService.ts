export interface GameScriptEntry {
  id: string;
  original: string;
  translated: string;
  context?: string;
  path: string; // Path inside the JSON or file
}

export interface TranslationProject {
  id: string;
  name: string;
  engine: "kirikiri" | "rpgmaker";
  entries: GameScriptEntry[];
  files: { name: string; content: string }[];
}

export function parseRPGMaker(filename: string, content: string): GameScriptEntry[] {
  const entries: GameScriptEntry[] = [];
  try {
    const data = JSON.parse(content);
    
    // RPG Maker MV/MZ Map files
    if (data.events) {
      data.events.forEach((event: any, eventIdx: number) => {
        if (!event) return;
        event.pages.forEach((page: any, pageIdx: number) => {
          page.list.forEach((cmd: any, cmdIdx: number) => {
            // Code 401 is "Show Text"
            if (cmd.code === 401) {
              entries.push({
                id: `map-${filename}-${eventIdx}-${pageIdx}-${cmdIdx}`,
                original: cmd.parameters[0],
                translated: "",
                path: `events[${eventIdx}].pages[${pageIdx}].list[${cmdIdx}].parameters[0]`,
                context: `Event: ${event.name || "Unnamed"}`
              });
            }
            // Code 102 is "Show Choices"
            if (cmd.code === 102) {
              cmd.parameters[0].forEach((choice: string, choiceIdx: number) => {
                entries.push({
                  id: `choice-${filename}-${eventIdx}-${pageIdx}-${cmdIdx}-${choiceIdx}`,
                  original: choice,
                  translated: "",
                  path: `events[${eventIdx}].pages[${pageIdx}].list[${cmdIdx}].parameters[0][${choiceIdx}]`,
                  context: `Choice in Event: ${event.name || "Unnamed"}`
                });
              });
            }
          });
        });
      });
    }
    
    // CommonEvents.json
    if (Array.isArray(data) && data[0] === null && data.length > 1 && data[1].list) {
       data.forEach((event: any, eventIdx: number) => {
         if (!event) return;
         event.list.forEach((cmd: any, cmdIdx: number) => {
            if (cmd.code === 401) {
              entries.push({
                id: `common-${filename}-${eventIdx}-${cmdIdx}`,
                original: cmd.parameters[0],
                translated: "",
                path: `[${eventIdx}].list[${cmdIdx}].parameters[0]`,
                context: `Common Event: ${event.name}`
              });
            }
         });
       });
    }

    // Items, Skills, Weapons, Armors, Enemies, States
    if (Array.isArray(data) && data.length > 0 && (data[0] === null || data[0].name !== undefined)) {
      data.forEach((item: any, idx: number) => {
        if (!item) return;
        if (item.name) {
          entries.push({
            id: `data-${filename}-${idx}-name`,
            original: item.name,
            translated: "",
            path: `[${idx}].name`,
            context: `${filename} name`
          });
        }
        if (item.description) {
          entries.push({
            id: `data-${filename}-${idx}-desc`,
            original: item.description,
            translated: "",
            path: `[${idx}].description`,
            context: `${filename} description`
          });
        }
        if (item.note) {
          // Often notes contain meta-data or messages, but usually we skip them unless requested.
          // For now, let's skip notes to keep it clean.
        }
      });
    }

  } catch (e) {
    console.error("Failed to parse RPG Maker file", filename, e);
  }
  return entries;
}

export function parseKiriKiri(filename: string, content: string): GameScriptEntry[] {
  const entries: GameScriptEntry[] = [];
  const lines = content.split(/\r?\n/);
  
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    // Skip empty lines, comments, and lines starting with @ or [ (commands)
    // Note: KiriKiri is complex, this is a simplified parser.
    // Real dialogue lines usually don't start with @ or [ or ;
    if (trimmed && !trimmed.startsWith("@") && !trimmed.startsWith("[") && !trimmed.startsWith(";") && !trimmed.startsWith("*")) {
      entries.push({
        id: `ks-${filename}-${idx}`,
        original: line,
        translated: "",
        path: `line-${idx}`,
        context: "Dialogue"
      });
    }
    
    // Handle [ruby] or other inline tags by keeping them in 'original'
    // The Gemini prompt handles preserving them.
  });
  
  return entries;
}

export function applyTranslations(content: string, entries: GameScriptEntry[], engine: "kirikiri" | "rpgmaker"): string {
  if (engine === "rpgmaker") {
    try {
      const data = JSON.parse(content);
      entries.forEach(entry => {
        if (!entry.translated) return;
        // Use a simple path-based setter
        const pathParts = entry.path.replace(/\[(\d+)\]/g, '.$1').split('.');
        let current = data;
        for (let i = 0; i < pathParts.length - 1; i++) {
          current = current[pathParts[i]];
        }
        current[pathParts[pathParts.length - 1]] = entry.translated;
      });
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return content;
    }
  } else {
    // KiriKiri: replace lines by index
    const lines = content.split(/\r?\n/);
    entries.forEach(entry => {
      if (!entry.translated) return;
      const match = entry.path.match(/line-(\d+)/);
      if (match) {
        const idx = parseInt(match[1]);
        lines[idx] = entry.translated;
      }
    });
    return lines.join("\n");
  }
}
