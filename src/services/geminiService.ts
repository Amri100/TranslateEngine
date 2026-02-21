import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface TranslationResult {
  original: string;
  translated: string;
}

export async function translateGameText(
  texts: string[],
  targetLang: string,
  engine: "kirikiri" | "rpgmaker",
  provider: "gemini" | "google" | "bing" = "gemini",
  context?: string
): Promise<TranslationResult[]> {
  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts, targetLang, engine, provider, context })
    });

    if (!response.ok) throw new Error("Translation request failed");

    const data = await response.json();
    const translatedTexts: string[] = data.translated;
    
    return texts.map((original, index) => ({
      original,
      translated: translatedTexts[index] || original
    }));
  } catch (error) {
    console.error("Translation error:", error);
    return texts.map(t => ({ original: t, translated: t }));
  }
}
