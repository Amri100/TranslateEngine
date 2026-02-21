import express from "express";
import { createServer as createViteServer } from "vite";
import { translate as googleTranslate } from "@vitalets/google-translate-api";
import { translate as bingTranslate } from "bing-translate-api";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

// Translation API
app.post("/api/translate", async (req, res) => {
  const { texts, targetLang, engine, provider, context } = req.body;

  if (!texts || !Array.isArray(texts)) {
    return res.status(400).json({ error: "Invalid texts" });
  }

  try {
    if (provider === "google") {
      const results = await Promise.all(
        texts.map(async (text) => {
          try {
            const res = await googleTranslate(text, { to: targetLang });
            return res.text;
          } catch (e) {
            return text;
          }
        })
      );
      return res.json({ translated: results });
    } 
    
    if (provider === "bing") {
      const results = await Promise.all(
        texts.map(async (text) => {
          try {
            const res = await bingTranslate(text, null, targetLang);
            return res.translation;
          } catch (e) {
            return text;
          }
        })
      );
      return res.json({ translated: results });
    }

    // Default to Gemini
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    const model = "gemini-3-flash-preview";
    const systemInstruction = `You are a professional game translator specializing in ${engine} engine scripts.
    Your task is to translate game dialogue and UI text from the source language to ${targetLang}.
    
    CRITICAL RULES:
    1. PRESERVE ALL ENGINE TAGS AND CONTROL CHARACTERS.
    2. Maintain the tone and personality of characters.
    3. If a line is just a command or technical tag without translatable text, return it as is.
    4. Context: ${context || "General game dialogue"}.
    5. Return the translations in the exact same order as the input.`;

    const geminiResponse = await ai.models.generateContent({
      model,
      contents: `Translate the following array of strings to ${targetLang}. Return a JSON array of strings.
      
      Strings to translate:
      ${JSON.stringify(texts)}`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    let text = geminiResponse.text || "[]";
    text = text.replace(/```json\n?|```/g, "").trim();
    const translatedTexts = JSON.parse(text);
    return res.json({ translated: translatedTexts });

  } catch (error: any) {
    console.error("Translation error:", error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
