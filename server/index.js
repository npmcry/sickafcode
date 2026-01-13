const express = require('express');
const cors = require('cors');
require('dotenv').config();
// Ensure TextDecoder and fetch are available in older Node versions
const { TextDecoder } = require('util');
let fetchFn = globalThis.fetch;
if (!fetchFn) {
  try {
    // Prefer undici for WHATWG-compatible fetch and web streams
    ({ fetch: fetchFn } = require('undici'));
  } catch (e) {
    console.error('Fetch is not available and undici is not installed. Install undici with "npm i undici".');
    process.exit(1);
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
// Minimal request logger to help diagnose 404s quickly
app.use((req, _res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`[api] ${req.method} ${req.path}`);
  }
  next();
});

// Ollama runs locally on this URL (no API key needed)
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral';

console.log(`Using Ollama at ${OLLAMA_URL} with model: ${OLLAMA_MODEL}`);

// Simple health check and root explainers
app.get('/', (_req, res) => res.type('text/plain').send('pdf-to-quiz explain server: OK'));
app.get('/api/health', (_req, res) => res.json({ ok: true, model: OLLAMA_MODEL }));
// If someone hits GET /api/explain in a browser, return a helpful hint
app.get('/api/explain', (_req, res) => res.status(405).json({ error: 'Use POST /api/explain with JSON body { question, ... }' }));

// Grade a single MCQ: returns best letter A-H using the local model
app.post('/api/grade', async (req, res) => {
  const { stem, choices = [], model: modelOverride } = req.body || {};
  if (!stem || !Array.isArray(choices) || !choices.length) {
    return res.status(400).json({ error: 'stem and choices[] required' });
  }
  // Normalize choices to lines "A. text" and capture the letters
  const items = choices.map(c => String(c));
  const letters = items.map(c => (c.trim().slice(0,1).toUpperCase()));
  const allowed = letters.filter(l => /^[A-H]$/.test(l));
  if (!allowed.length) return res.status(400).json({ error: 'choices must start with a letter A-H' });

  const modelToUse = modelOverride || OLLAMA_MODEL;
  const sys = `You are an exam grader. Pick the single best answer strictly as a letter from this set: ${allowed.join(', ')}. Respond with only the letter.`;
  const prompt = `Question:\n${stem}\n\nChoices:\n${items.join('\n')}\n\nAnswer letter only:`;
  try {
    const apiRes = await fetchFn(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelToUse,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: prompt }
        ],
        stream: false,
        options: { num_predict: 8, temperature: Number(process.env.OLLAMA_TEMPERATURE || 0.2) },
        keep_alive: process.env.OLLAMA_KEEP_ALIVE || '1h'
      })
    });
    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('grade error', errText);
      return res.status(apiRes.status).json({ error: 'Ollama grade error' });
    }
    const data = await apiRes.json();
    const text = (data && data.message && data.message.content) ? String(data.message.content) : '';
    // Extract first valid letter A-H from response
    const m = text.match(/[A-H]/i);
    const letter = m ? m[0].toUpperCase() : null;
    if (!letter || !allowed.includes(letter)) {
      return res.status(422).json({ error: 'Could not determine letter', raw: text });
    }
    return res.json({ ok: true, letter });
  } catch (e) {
    console.error('grade exception', e);
    return res.status(500).json({ error: String(e) });
  }
});

// Simple explain endpoint that calls Ollama Chat API with a RAG-style prompt.
app.post('/api/explain', async (req, res) => {
  const { question, choices = [], context = '', format = 'text', stream = false, model: modelOverride } = req.body || {};
  if (!question) return res.status(400).json({ error: 'question required' });

  // If the client requests plain 'text' answers (chat mode), keep prompt short and direct
  const isText = String(format).toLowerCase() === 'text';
  const sysText = isText
    ? 'You are a concise assistant. Answer the user directly and briefly. Do not add headers or extra formatting.'
    : 'You are a helpful quiz assistant. Always respond with valid JSON.';

  const baseParts = [];
  if (context && !isText) baseParts.push(`Context:\n${context}`);
  if (!isText && Array.isArray(choices) && choices.length) baseParts.push(`Choices:\n${choices.join('\n')}`);
  baseParts.push(`Question:\n${question}`);
  const prompt = baseParts.join('\n\n');

  // Build generation options tuned for speed and brevity
  const options = {
    num_predict: Number(process.env.OLLAMA_NUM_PREDICT || 200),
    temperature: Number(process.env.OLLAMA_TEMPERATURE || 0.2),
    top_p: Number(process.env.OLLAMA_TOP_P || 0.9),
    top_k: Number(process.env.OLLAMA_TOP_K || 40)
  };

  const modelToUse = modelOverride || OLLAMA_MODEL;

  try {
    const apiRes = await fetchFn(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: [
          { role: 'system', content: sysText },
          { role: 'user', content: prompt }
        ],
        stream: Boolean(stream),
        options,
        keep_alive: process.env.OLLAMA_KEEP_ALIVE || '1h'
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error(`Ollama API error: ${apiRes.status} ${errText}`);
      return res.status(apiRes.status).json({ error: `Ollama API error: ${apiRes.statusText}. Make sure Ollama is running on ${OLLAMA_URL}` });
    }

    // Handle streaming or non-streaming
    if (Boolean(stream)) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      const reader = apiRes.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      // Smooth server-side batching to avoid ultra-small frames
      let outBuf = '';
      let flushTimer = null;
      const flushNow = () => {
        if (!outBuf) return;
        res.write(`data: ${outBuf}\n\n`);
        outBuf = '';
        flushTimer = null;
      };
      const scheduleFlush = () => {
        if (flushTimer) return;
        flushTimer = setTimeout(flushNow, Number(process.env.SSE_BATCH_MS || 30));
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // Ollama streams JSON lines; split by newlines and emit content parts
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            const chunk = obj?.message?.content || '';
            if (chunk) { outBuf += chunk; scheduleFlush(); }
          } catch {
            // ignore malformed chunks
          }
        }
      }
      if (flushTimer) clearTimeout(flushTimer);
      flushNow();
      res.write('event: done\n');
      res.write('data: [DONE]\n\n');
      return res.end();
    } else {
      const data = await apiRes.json();
      const text = data?.message?.content || '';
      if (isText) {
        return res.json({ ok: true, result: text });
      }
      // Legacy JSON mode for MCQ
      if (!text) return res.status(500).json({ error: 'No response from Ollama' });
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        const m = text && text.match(/\{[\s\S]*\}/);
        if (m) {
          try { parsed = JSON.parse(m[0]); } catch { parsed = { error: 'Could not parse model JSON response', raw: text }; }
        } else {
          parsed = { error: 'No JSON returned', raw: text };
        }
      }
      return res.json({ ok: true, model: data, result: parsed });
    }
  } catch (err) {
    console.error('explain error', err);
    res.status(500).json({ error: `Connection error: ${String(err)}. Is Ollama running on ${OLLAMA_URL}?` });
  }
});

const PORT = process.env.PORT || 5174;
app.listen(PORT, () => {
  console.log(`Explain server running on http://localhost:${PORT}`);
  // Optional warm-up: trigger a tiny generation to load the model into memory
  const PREWARM = String(process.env.PREWARM || 'true').toLowerCase() !== 'false';
  if (!PREWARM) return;
  setTimeout(async () => {
    try {
      await fetchFn(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [
            { role: 'system', content: 'You are a concise assistant.' },
            { role: 'user', content: 'hi' }
          ],
          stream: false,
          options: { num_predict: 8, temperature: 0.1 }
        })
      }).then(r => r.ok ? r.json() : null);
      console.log('Model prewarmed.');
    } catch (e) {
      console.log('Prewarm skipped or failed:', e?.message || e);
    }
  }, 200);
});
