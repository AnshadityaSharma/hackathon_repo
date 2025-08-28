// backend/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const PORT = process.env.PORT || 4029;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-pro";

if (!GEMINI_KEY) {
  console.error("Missing GEMINI_API_KEY in backend/.env");
  process.exit(1);
}

const app = express();
app.use(cors({ origin: true })); // lock this down in production
app.use(express.json());

// Simple chat endpoint that forwards to Gemini generateContent
app.post("/api/chat", async (req, res) => {
  try {
    const { userMessage, conversationHistory = [] } = req.body;

    // Build contents for Gemini generateContent: system, history, then user
    const systemPart = {
      role: "system",
      parts: [{ text: "You are an HR Assistant AI that helps employees with HR-related questions, policies, leave requests, and workplace guidance. Be helpful, professional, and concise." }]
    };

    const historyParts = (conversationHistory || []).map(msg => ({
      role: msg.role || "user",
      parts: [{ text: msg.content || msg }]
    }));

    const userPart = {
      role: "user",
      parts: [{ text: userMessage }]
    };

    const payload = { contents: [ systemPart, ...historyParts, userPart ] };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;

    const gResp = await axios.post(url, payload, { timeout: 60000 });

    // Safe extraction of generated text from response
    const candidates = gResp?.data?.candidates;
    let reply = "";
    if (Array.isArray(candidates) && candidates.length > 0) {
      // navigate candidate -> content -> parts -> text
      const firstCandidate = candidates[0];
      const content = firstCandidate.content || firstCandidate.output || [];
      // find first text part
      outer: for (const c of content) {
        const parts = c?.parts || [];
        for (const p of parts) {
          if (p?.text) { reply = p.text; break outer; }
        }
      }
    }

    // fallback: if reply empty, stringify a bit of response for debugging
    if (!reply) reply = JSON.stringify(gResp.data).slice(0, 1000);

    res.json({ reply });
  } catch (err) {
    console.error("Backend /api/chat error:", err?.response?.data || err.message || err);
    res.status(500).json({ error: "chat_failed", details: err?.response?.data || String(err) });
  }
});

app.listen(PORT, () => console.log(`Backend running at http://localhost:${PORT}`));
