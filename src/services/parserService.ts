export interface GameScriptEntry {
  id: string;
  original: string;
  translated: string;
  context?: string;
  path: string; // Path inside the JSON or file
  tmEngineMatch?: string;
}

export interface TranslationProject {
  id: string;
  name: string;
  engine: "kirikiri" | "rpgmaker" | "renpy" | "unity" | "generic" | "subtitles";
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

    // Actors.json
    if (Array.isArray(data) && data.length > 0 && data[0] === null && data[1] && data[1].nickname !== undefined) {
      data.forEach((actor: any, idx: number) => {
        if (!actor) return;
        if (actor.name) {
          entries.push({
            id: `actor-${filename}-${idx}-name`,
            original: actor.name,
            translated: "",
            path: `[${idx}].name`,
            context: "Actor Name"
          });
        }
        if (actor.nickname) {
          entries.push({
            id: `actor-${filename}-${idx}-nick`,
            original: actor.nickname,
            translated: "",
            path: `[${idx}].nickname`,
            context: "Actor Nickname"
          });
        }
        if (actor.profile) {
          entries.push({
            id: `actor-${filename}-${idx}-prof`,
            original: actor.profile,
            translated: "",
            path: `[${idx}].profile`,
            context: "Actor Profile"
          });
        }
      });
    }

    // System.json
    if (data.gameTitle !== undefined && data.terms !== undefined) {
      entries.push({
        id: `system-${filename}-title`,
        original: data.gameTitle,
        translated: "",
        path: "gameTitle",
        context: "Game Title"
      });
      
      // Basic terms
      if (data.terms.basic) {
        data.terms.basic.forEach((term: string, idx: number) => {
          if (term) {
            entries.push({
              id: `system-${filename}-term-basic-${idx}`,
              original: term,
              translated: "",
              path: `terms.basic[${idx}]`,
              context: "System Term (Basic)"
            });
          }
        });
      }
      
      // Commands
      if (data.terms.commands) {
        data.terms.commands.forEach((term: string, idx: number) => {
          if (term) {
            entries.push({
              id: `system-${filename}-term-cmd-${idx}`,
              original: term,
              translated: "",
              path: `terms.commands[${idx}]`,
              context: "System Term (Command)"
            });
          }
        });
      }

      // Params
      if (data.terms.params) {
        data.terms.params.forEach((term: string, idx: number) => {
          if (term) {
            entries.push({
              id: `system-${filename}-term-param-${idx}`,
              original: term,
              translated: "",
              path: `terms.params[${idx}]`,
              context: "System Term (Param)"
            });
          }
        });
      }

      // Messages
      if (data.terms.messages) {
        Object.entries(data.terms.messages).forEach(([key, value]) => {
          if (typeof value === 'string' && value) {
            entries.push({
              id: `system-${filename}-term-msg-${key}`,
              original: value,
              translated: "",
              path: `terms.messages.${key}`,
              context: `System Message: ${key}`
            });
          }
        });
      }

      // Types
      const typeFields = ['weaponTypes', 'armorTypes', 'skillTypes', 'elements'];
      typeFields.forEach(field => {
        if (Array.isArray(data[field])) {
          data[field].forEach((type: string, idx: number) => {
            if (type) {
              entries.push({
                id: `system-${filename}-${field}-${idx}`,
                original: type,
                translated: "",
                path: `${field}[${idx}]`,
                context: `System ${field}`
              });
            }
          });
        }
      });
    }

    // Items, Skills, Weapons, Armors, Enemies, States (General Data)
    // We check for 'name' as a common denominator for these data files
    if (Array.isArray(data) && data.length > 0 && data[0] === null && data[1] && data[1].name !== undefined) {
      data.forEach((item: any, idx: number) => {
        if (!item) return;
        if (item.name) {
          entries.push({
            id: `data-${filename}-${idx}-name`,
            original: item.name,
            translated: "",
            path: `[${idx}].name`,
            context: `${filename} Name`
          });
        }
        if (item.description) {
          entries.push({
            id: `data-${filename}-${idx}-desc`,
            original: item.description,
            translated: "",
            path: `[${idx}].description`,
            context: `${filename} Description`
          });
        }
        if (item.message1) {
          entries.push({
            id: `data-${filename}-${idx}-msg1`,
            original: item.message1,
            translated: "",
            path: `[${idx}].message1`,
            context: `${filename} Message 1`
          });
        }
        if (item.message2) {
          entries.push({
            id: `data-${filename}-${idx}-msg2`,
            original: item.message2,
            translated: "",
            path: `[${idx}].message2`,
            context: `${filename} Message 2`
          });
        }
        if (item.message3) {
          entries.push({
            id: `data-${filename}-${idx}-msg3`,
            original: item.message3,
            translated: "",
            path: `[${idx}].message3`,
            context: `${filename} Message 3`
          });
        }
        if (item.message4) {
          entries.push({
            id: `data-${filename}-${idx}-msg4`,
            original: item.message4,
            translated: "",
            path: `[${idx}].message4`,
            context: `${filename} Message 4`
          });
        }
        // Victory/Defeat messages in Enemies.json or similar
        if (item.victoryMessage) {
          entries.push({
            id: `data-${filename}-${idx}-vic`,
            original: item.victoryMessage,
            translated: "",
            path: `[${idx}].victoryMessage`,
            context: `${filename} Victory Message`
          });
        }
        if (item.defeatMessage) {
          entries.push({
            id: `data-${filename}-${idx}-def`,
            original: item.defeatMessage,
            translated: "",
            path: `[${idx}].defeatMessage`,
            context: `${filename} Defeat Message`
          });
        }
      });
    }

    // Troops.json
    if (Array.isArray(data) && data.length > 0 && data[0] === null && data[1] && data[1].members !== undefined) {
      data.forEach((troop: any, troopIdx: number) => {
        if (!troop) return;
        if (troop.name) {
          entries.push({
            id: `troop-${filename}-${troopIdx}-name`,
            original: troop.name,
            translated: "",
            path: `[${troopIdx}].name`,
            context: "Troop Name"
          });
        }
        troop.pages.forEach((page: any, pageIdx: number) => {
          page.list.forEach((cmd: any, cmdIdx: number) => {
            if (cmd.code === 401) {
              entries.push({
                id: `troop-cmd-${filename}-${troopIdx}-${pageIdx}-${cmdIdx}`,
                original: cmd.parameters[0],
                translated: "",
                path: `[${troopIdx}].pages[${pageIdx}].list[${cmdIdx}].parameters[0]`,
                context: `Troop Event: ${troop.name}`
              });
            }
          });
        });
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
    if (!trimmed) return;

    // Skip full-line comments
    if (trimmed.startsWith(";") || trimmed.startsWith("//")) return;
    
    // Skip labels
    if (trimmed.startsWith("*")) return;

    // KiriKiri/KAG dialogue detection:
    // 1. Lines starting with @ are commands.
    // 2. Lines starting with [ and ending with ] MIGHT be commands, 
    //    but if there's text outside or multiple tags, it's likely dialogue.
    const isCommand = trimmed.startsWith("@");
    const isTagOnly = trimmed.startsWith("[") && trimmed.endsWith("]") && !trimmed.includes("][") && !/[^\s\[\]]/.test(trimmed.replace(/\[.*?\]/g, ""));
    
    if (!isCommand && !isTagOnly) {
      // It's dialogue. We keep the whole line to preserve tags like [r], [l], [ruby], etc.
      // The AI should be instructed to only translate the text parts.
      entries.push({
        id: `ks-${filename}-${idx}`,
        original: line,
        translated: "",
        path: `line-${idx}`,
        context: "KiriKiri Dialogue"
      });
    }
  });
  
  return entries;
}

export function parseRenPy(filename: string, content: string): GameScriptEntry[] {
  const entries: GameScriptEntry[] = [];
  const lines = content.split(/\r?\n/);
  
  // Regex for Ren'Py dialogue: character "text" or just "text"
  // Handles escaped quotes and simple cases
  const dialogueRegex = /^(\s*(?:[\w\d_]+)?\s*)"((?:[^"\\]|\\.)*)"\s*$/;
  
  lines.forEach((line, idx) => {
    const match = line.match(dialogueRegex);
    if (match) {
      const text = match[2];
      if (text && text.trim().length > 0) {
        entries.push({
          id: `rpy-${filename}-${idx}`,
          original: text,
          translated: "",
          path: `line-${idx}`,
          context: "Ren'Py Dialogue"
        });
      }
    }
  });
  
  return entries;
}

export function parseGenericJSON(filename: string, content: string): GameScriptEntry[] {
  const entries: GameScriptEntry[] = [];
  try {
    const data = JSON.parse(content);
    
    const traverse = (obj: any, path: string) => {
      if (typeof obj === 'string' && obj.trim().length > 0) {
        entries.push({
          id: `json-${filename}-${path}`,
          original: obj,
          translated: "",
          path: path,
          context: "JSON Text"
        });
      } else if (Array.isArray(obj)) {
        obj.forEach((item, i) => traverse(item, `${path}[${i}]`));
      } else if (typeof obj === 'object' && obj !== null) {
        Object.entries(obj).forEach(([key, value]) => {
          traverse(value, path ? `${path}.${key}` : key);
        });
      }
    };
    
    traverse(data, "");
  } catch (e) {
    console.error("Failed to parse Generic JSON", filename);
  }
  return entries;
}

export function parseCSV(filename: string, content: string): GameScriptEntry[] {
  const entries: GameScriptEntry[] = [];
  const lines = content.split(/\r?\n/);
  
  lines.forEach((line, rowIdx) => {
    const cols = line.split(','); // Simple CSV split
    cols.forEach((col, colIdx) => {
      const trimmed = col.trim().replace(/^"|"$/g, '');
      if (trimmed.length > 0 && !/^\d+$/.test(trimmed)) {
        entries.push({
          id: `csv-${filename}-${rowIdx}-${colIdx}`,
          original: trimmed,
          translated: "",
          path: `row-${rowIdx}-col-${colIdx}`,
          context: `CSV Cell [${rowIdx}, ${colIdx}]`
        });
      }
    });
  });
  
  return entries;
}

export function parseSRT(filename: string, content: string): GameScriptEntry[] {
  const entries: GameScriptEntry[] = [];
  const blocks = content.split(/\r?\n\r?\n/);
  
  blocks.forEach((block, blockIdx) => {
    const lines = block.split(/\r?\n/);
    if (lines.length >= 3) {
      // Line 0: Index, Line 1: Time, Line 2+: Text
      const text = lines.slice(2).join("\n");
      if (text.trim().length > 0) {
        entries.push({
          id: `srt-${filename}-${blockIdx}`,
          original: text,
          translated: "",
          path: `block-${blockIdx}`,
          context: `Subtitle Block ${lines[0]}`
        });
      }
    }
  });
  
  return entries;
}

export function applyTranslations(content: string, entries: GameScriptEntry[], engine: TranslationProject["engine"]): string {
  if (engine === "rpgmaker" || engine === "unity" || engine === "generic") {
    try {
      const data = JSON.parse(content);
      entries.forEach(entry => {
        if (!entry.translated) return;
        
        const pathParts = entry.path.replace(/\[(\d+)\]/g, '.$1').split('.');
        let current = data;
        
        for (let i = 0; i < pathParts.length - 1; i++) {
          if (current && current[pathParts[i]] !== undefined) {
            current = current[pathParts[i]];
          } else {
            return; // Path broken
          }
        }
        
        if (current && pathParts[pathParts.length - 1] !== undefined) {
          current[pathParts[pathParts.length - 1]] = entry.translated;
        }
      });
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return content;
    }
  } else if (engine === "renpy") {
    const lines = content.split(/\r?\n/);
    entries.forEach(entry => {
      if (!entry.translated) return;
      const match = entry.path.match(/line-(\d+)/);
      if (match) {
        const idx = parseInt(match[1]);
        if (lines[idx] !== undefined) {
          // Replace only the text inside quotes
          const dialogueRegex = /^(\s*(?:[\w\d_]+)?\s*)"((?:[^"\\]|\\.)*)"\s*$/;
          lines[idx] = lines[idx].replace(dialogueRegex, (m, p1) => `${p1}"${entry.translated}"`);
        }
      }
    });
    return lines.join("\n");
  } else if (engine === "kirikiri") {
    const lines = content.split(/\r?\n/);
    entries.forEach(entry => {
      if (!entry.translated) return;
      const match = entry.path.match(/line-(\d+)/);
      if (match) {
        const idx = parseInt(match[1]);
        if (lines[idx] !== undefined) {
          lines[idx] = entry.translated;
        }
      }
    });
    return lines.join("\n");
  } else if (engine === "subtitles") {
    const blocks = content.split(/\r?\n\r?\n/);
    entries.forEach(entry => {
      if (!entry.translated) return;
      const match = entry.path.match(/block-(\d+)/);
      if (match) {
        const idx = parseInt(match[1]);
        if (blocks[idx] !== undefined) {
          const lines = blocks[idx].split(/\r?\n/);
          if (lines.length >= 3) {
            blocks[idx] = lines.slice(0, 2).join("\n") + "\n" + entry.translated;
          }
        }
      }
    });
    return blocks.join("\n\n");
  }
  return content;
}
