import { extractQuestions } from "./parser.js";
import { readPdf } from "./extractors/pdf.js";
import { readDocx } from "./extractors/docx.js";

const fileInput = document.getElementById("fileInput");
const convertBtn = document.getElementById("convertBtn");
const statusEl = document.getElementById("status");

const quizSection = document.getElementById("quiz");
const questionEl = document.getElementById("question");
const choicesEl = document.getElementById("choices");
const progressEl = document.getElementById("progress");
const homeBtn = document.getElementById('homeBtn');

const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
const explainBtn = document.getElementById('explainBtn');
const answeredBadge = document.getElementById('answeredBadge');
const correctBadge = document.getElementById('correctBadge');
const wrongBadge = document.getElementById('wrongBadge');
const aiKeyBtn = document.getElementById('aiKeyBtn');

let questions = [];
let currentIndex = 0;

// tracks your selected choice letter per question index: { 0: "A", 1: "C", ... }
let selected = {};
// per-question status: null | 'correct' | 'wrong' | 'answered' (if no key)
let qStatus = {};
let counts = { answered: 0, correct: 0, wrong: 0 };
const gradingInFlight = {}; // per-question flag to avoid duplicate grading calls
const SERVER_URL = 'http://localhost:5174';

function updateBadges(){
  if (answeredBadge) answeredBadge.textContent = `Answered: ${counts.answered}`;
  if (correctBadge) correctBadge.textContent = `Correct: ${counts.correct}`;
  if (wrongBadge) wrongBadge.textContent = `Wrong: ${counts.wrong}`;
}

function recomputeAllCounts(){
  counts = { answered: 0, correct: 0, wrong: 0 };
  for (let i = 0; i < questions.length; i++) {
    const choice = selected[i];
    if (!choice) continue;
    const key = questions[i]?.answer?.toUpperCase?.() || null;
    if (key) {
      if (choice === key) {
        qStatus[i] = 'correct'; counts.correct++; counts.answered++;
      } else {
        qStatus[i] = 'wrong'; counts.wrong++; counts.answered++;
      }
    } else {
      qStatus[i] = 'answered'; counts.answered++;
    }
  }
  updateBadges();
}

async function gradeQuestion(index){
  if (gradingInFlight[index]) return;
  const q = questions[index];
  if (!q || !Array.isArray(q.choices) || !q.choices.length) return;
  if (q.answer && /^[A-H]$/.test(q.answer)) return; // already graded
  gradingInFlight[index] = true;
  try{
    const resp = await fetch(`${SERVER_URL}/api/grade`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stem: q.stem, choices: q.choices })
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const letter = data && data.letter && String(data.letter).toUpperCase();
    if (letter && /^[A-H]$/.test(letter)) {
      q.answer = letter;
      const choice = selected[index];
      if (choice){
        if (qStatus[index] === 'answered') {
          counts.answered = Math.max(0, counts.answered - 1);
        } else if (qStatus[index] === 'correct') {
          counts.correct = Math.max(0, counts.correct - 1);
        } else if (qStatus[index] === 'wrong') {
          counts.wrong = Math.max(0, counts.wrong - 1);
        }
        if (choice === letter) {
          qStatus[index] = 'correct';
          counts.correct++;
        } else {
          qStatus[index] = 'wrong';
          counts.wrong++;
        }
        updateBadges();
        renderQuestion();
      }
    }
  } catch(_){}
  finally{
    gradingInFlight[index] = false;
  }
}

// Use event delegation on the choices container to handle clicks reliably
choicesEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".choice");
  if (!btn || !choicesEl.contains(btn)) return;

  const letter = btn.dataset?.letter;
  if (!letter) return;

  // handle counting: if this question was previously counted, undo that
  const prev = qStatus[currentIndex];
  if (prev === 'correct') counts.correct--;
  if (prev === 'wrong') counts.wrong--;
  if (prev === 'answered') counts.answered--;

  selected[currentIndex] = letter;

  // if question has an answer key (questions[i].answer), evaluate
  const correctLetter = questions[currentIndex].answer?.toUpperCase?.() || null;
  if (correctLetter) {
    if (letter === correctLetter) {
      qStatus[currentIndex] = 'correct';
      counts.correct++;
    } else {
      qStatus[currentIndex] = 'wrong';
      counts.wrong++;
    }
    counts.answered++;
  } else {
    // no key available — just mark answered so user can track progress
    qStatus[currentIndex] = 'answered';
    counts.answered++;
    // Trigger live AI grading for this question; counters will be adjusted when the key arrives
    gradeQuestion(currentIndex);
  }

  updateBadges();
  renderQuestion();
});
// Enable button when file selected
fileInput.addEventListener("change", () => {
  convertBtn.disabled = !fileInput.files.length;
});

// Convert file to quiz
convertBtn.addEventListener("click", async () => {
  const file = fileInput.files[0];
  if (!file) return;

  statusEl.textContent = "Processing file…";
  quizSection.hidden = true;
  document.body.classList.remove("quiz-mode");

  let text = "";

  try {
    const name = file.name.toLowerCase();

    if (name.endsWith(".pdf")) {
      text = await readPdf(file);
    } else if (name.endsWith(".docx")) {
      text = await readDocx(file);
    } else {
      statusEl.textContent = "Unsupported file type.";
      return;
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Failed to read file: ${err?.message || err}`;
    return;
  }

  questions = extractQuestions(text);
  currentIndex = 0;
  selected = {}; // reset selections on new upload

  if (!questions.length) {
    statusEl.textContent = "No questions detected in file.";
    return;
  }

  statusEl.textContent = "";
  quizSection.hidden = false;
  // switch to quiz-mode background (uses /sky.png and animated stars)
  document.body.classList.add("quiz-mode");

  // Play background video if available. Default path: /quiz-bg.mp4
  try {
    const video = document.getElementById('bgVideo');
    if (video) {
      // default to the `public/ocean.mp4` file placed in the project's public folder
      const videoSrc = document.body.dataset?.quizVideo || '/ocean.mp4';
      // set src only if different to avoid reloading repeatedly
      if (video.getAttribute('src') !== videoSrc) {
        video.setAttribute('src', videoSrc);
        video.load();
      }
      // attempt to play (some browsers require user gesture but in this flow user clicked Convert)
      await video.play().catch(err => {
        // If autoplay is blocked, silently ignore — fallback image remains visible
        console.debug('Video play blocked:', err?.message || err);
      });
    }
  } catch (err) {
    console.warn('Failed to start quiz background video:', err);
  }
  renderQuestion();
});

function renderQuestion() {
  const q = questions[currentIndex];

  questionEl.textContent = q.stem;

  choicesEl.innerHTML = "";

  const chosenLetter = selected[currentIndex] || null;

  q.choices.forEach(choiceText => {
    // choiceText like "A. blah blah"
    const letter = choiceText.trim().slice(0, 1).toUpperCase();

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice" + (chosenLetter === letter ? " selected" : "");
    btn.textContent = choiceText;
    btn.dataset.letter = letter;
    btn.disabled = false;

    choicesEl.appendChild(btn);
  });

  // Render progress as per-letter colored spans to match the multicolor logo
  const progressText = `Question ${currentIndex + 1} of ${questions.length}`;
  progressEl.innerHTML = '';
  for (let i = 0; i < progressText.length; i++) {
    const ch = progressText[i];
    const span = document.createElement('span');
    span.className = 'progress-letter c' + ((i % 4) + 1);
    span.textContent = ch;
    progressEl.appendChild(span);
  }

  prevBtn.disabled = currentIndex === 0;
  nextBtn.disabled = currentIndex === questions.length - 1;
}

// Initialize prev/next buttons with arrow SVGs (cute rounded arrows handled in CSS)
prevBtn.innerHTML = `
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
nextBtn.innerHTML = `
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

// Home button: leave quiz mode and stop background video so user can upload again
homeBtn.addEventListener('click', () => {
  quizSection.hidden = true;
  document.body.classList.remove('quiz-mode');
  statusEl.textContent = '';
  // pause and unload video
  const video = document.getElementById('bgVideo');
  if (video) {
    try { video.pause(); } catch(e){}
    video.removeAttribute('src');
    try { video.load(); } catch(e){}
  }
});

prevBtn.addEventListener("click", () => {
  if (currentIndex > 0) {
    currentIndex--;
    renderQuestion();
  }
});

nextBtn.addEventListener("click", () => {
  if (currentIndex < questions.length - 1) {
    currentIndex++;
    renderQuestion();
  }
});

// Close button handler for modal (set up once, not inside the click handler)
const closeExplain = document.getElementById('closeExplain');
const explainModal = document.getElementById('explainModal');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChat');
const chatHistory = document.getElementById('explainContent');
const streamModeBtn = document.getElementById('streamMode');
const STREAM_PREF_KEY = 'assistant_stream_mode';
// Default to Instant (false) for smooth, non-choppy responses
let isStreaming = (() => {
  try {
    const saved = localStorage.getItem(STREAM_PREF_KEY);
    if (saved === null) return false; // default: Instant
    return JSON.parse(saved) === true; // ensure boolean
  } catch {
    return false;
  }
})();

function updateStreamLabel(){
  if (!streamModeBtn) return;
  streamModeBtn.textContent = isStreaming ? 'Stream' : 'Instant';
  streamModeBtn.title = isStreaming ? 'Streaming response (live)' : 'Instant response (full at once)';
}
updateStreamLabel();
if (streamModeBtn) {
  streamModeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isStreaming = !isStreaming;
    updateStreamLabel();
    try { localStorage.setItem(STREAM_PREF_KEY, JSON.stringify(isStreaming)); } catch {}
  });
}
let currentStreamAbort = null;

function closeAssistantModal(){
  if (!explainModal) return;
  explainModal.hidden = true;
  if (currentStreamAbort) {
    try { currentStreamAbort.abort(); } catch(_) {}
    currentStreamAbort = null;
  }
}

if (closeExplain && explainModal) {
  closeExplain.onclick = () => closeAssistantModal();
  // Also allow clicking outside the modal to close
  explainModal.onclick = (e) => {
    if (e.target === explainModal) closeAssistantModal();
  };
  // Escape key closes the modal too
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !explainModal.hidden) {
      e.preventDefault();
      closeAssistantModal();
    }
  });
}

// Chat functionality
async function sendChatMessage(userQuestion) {
  const q = questions[currentIndex];
  if (!q) return;

  // Switch from hero to history on first message
  const hero = document.querySelector('.chat-hero');
  if (hero) hero.style.display = 'none';
  if (chatHistory) chatHistory.classList.add('show');

  // Add user message row (avatar + bubble)
  const userRow = document.createElement('div');
  userRow.className = 'msg-row user';
  const userAvatar = document.createElement('div');
  userAvatar.className = 'avatar';
  userAvatar.textContent = 'You';
  const userBubble = document.createElement('div');
  userBubble.className = 'bubble';
  userBubble.textContent = userQuestion;
  userRow.appendChild(userAvatar);
  userRow.appendChild(userBubble);
  chatHistory.appendChild(userRow);

  // Add assistant loading row
  const loadingRow = document.createElement('div');
  loadingRow.className = 'msg-row assistant';
  const botAvatar = document.createElement('div');
  botAvatar.className = 'avatar';
  botAvatar.textContent = 'AI';
  const loadingBubble = document.createElement('div');
  loadingBubble.className = 'bubble';
  loadingBubble.textContent = 'Thinking…';
  loadingRow.appendChild(botAvatar);
  loadingRow.appendChild(loadingBubble);
  chatHistory.appendChild(loadingRow);
  chatHistory.scrollTop = chatHistory.scrollHeight;

  // Disable send button while processing
  if (sendChatBtn) sendChatBtn.disabled = true;

  try {
    // Compose contextual prompt
    const fullPrompt = `${userQuestion}`; // keep prompt short for faster responses

    const controller = new AbortController();
    currentStreamAbort = controller;
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    // Request concise text mode and streaming for immediate tokens
    const resp = await fetch(`${SERVER_URL}/api/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: fullPrompt, choices: [], context: '', format: 'text', stream: isStreaming }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const aiBubble = loadingBubble; // reuse existing bubble
    aiBubble.textContent = '';

    if (!resp.ok) {
      aiBubble.textContent = 'Error: ' + (resp.statusText || 'Server error');
      chatHistory.scrollTop = chatHistory.scrollHeight;
      return;
    }

    if (!isStreaming) {
      // Non-stream: show full text at once
      try {
        const data = await resp.json();
        const text = (data && (data.result || data.message || data.text)) || '';
        aiBubble.textContent = text || '(no reply)';
      } catch (e) {
        aiBubble.textContent = 'Error reading response';
      }
      currentStreamAbort = null;
      chatHistory.scrollTop = chatHistory.scrollHeight;
      return;
    }

    if (!resp.body) {
      aiBubble.textContent = 'Error: empty response body';
      chatHistory.scrollTop = chatHistory.scrollHeight;
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let pending = '';
    let stopped = false;
    let rafScheduled = false;

    const flush = () => {
      rafScheduled = false;
      if (!pending) return;
      aiBubble.textContent += pending;
      pending = '';
      chatHistory.scrollTop = chatHistory.scrollHeight;
    };
    const scheduleFlush = () => {
      if (rafScheduled) return;
      rafScheduled = true;
      requestAnimationFrame(flush);
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) {
        const lines = frame.split('\n');
        for (let raw of lines) {
          if (!raw) continue;
          const m = raw.match(/^data:\s?(.*)$/);
          if (!m) continue;
          const payload = m[1];
          if (payload === '[DONE]') continue;
          pending += payload;
        }
      }
      if (pending) scheduleFlush();
    }
    stopped = true;
    if (pending) flush();
    currentStreamAbort = null;
    chatHistory.scrollTop = chatHistory.scrollHeight;
    
  } catch (err) {
    // Show error in the loading bubble
    const errorMsg = loadingBubble;
    if (err.name === 'AbortError') {
      errorMsg.textContent = 'Request timed out. Please try again.';
    } else {
      errorMsg.textContent = 'Error: ' + String(err);
    }
    chatHistory.scrollTop = chatHistory.scrollHeight;
  } finally {
    if (sendChatBtn) sendChatBtn.disabled = false;
  }
}

// Explain button: opens chat modal
if (explainBtn) explainBtn.addEventListener('click', () => {
  const q = questions[currentIndex];
  if (!q) return;

  if (!explainModal || !chatHistory) {
    alert('Explain: modal not configured');
    return;
  }

  // Clear chat history and show modal
  chatHistory.innerHTML = '';
  // Reset hero+history state (hero visible until first send)
  const hero = document.querySelector('.chat-hero');
  if (hero) hero.style.display = '';
  chatHistory.classList.remove('show');
  explainModal.hidden = false;

  // Focus on input
  if (chatInput) { chatInput.value = ''; chatInput.focus(); }
  // Ensure the toggle label reflects current preference on open
  updateStreamLabel();
});

// Send button handler
if (sendChatBtn && chatInput) {
  const triggerSend = () => {
    const msg = chatInput.value.trim();
    if (!msg || sendChatBtn.disabled) return;
    sendChatMessage(msg);
    chatInput.value = '';
  };

  sendChatBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    triggerSend();
  });

  // Enter to send, Shift+Enter for newline. Ignore while IME composing.
  chatInput.addEventListener('keydown', (e) => {
    if (e.isComposing) return; // IME input
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      triggerSend();
    }
  });
}

// AI grading: generate answer key via server for all questions
if (aiKeyBtn) {
  aiKeyBtn.addEventListener('click', async () => {
    if (!questions || !questions.length) return;
    aiKeyBtn.disabled = true;
    const SERVER_URL = 'http://localhost:5174';
    let done = 0;
    statusEl.textContent = `Generating AI key… 0/${questions.length}`;
    try {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        // Skip if already has an answer
        // If you want to overwrite existing, remove this check
        if (q.answer && /^[A-H]$/.test(q.answer)) { done++; statusEl.textContent = `Generating AI key… ${done}/${questions.length}`; continue; }
        const body = { stem: q.stem, choices: q.choices };
        const resp = await fetch(`${SERVER_URL}/api/grade`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        if (!resp.ok) {
          // non-fatal; move on
          done++; statusEl.textContent = `Generating AI key… ${done}/${questions.length}`;
          continue;
        }
        const data = await resp.json();
        const letter = data && data.letter && String(data.letter).toUpperCase();
        if (letter && /^[A-H]$/.test(letter)) questions[i].answer = letter;
        done++;
        statusEl.textContent = `Generating AI key… ${done}/${questions.length}`;
      }
      recomputeAllCounts();
      renderQuestion();
      statusEl.textContent = `AI key ready. Reviewed ${done} question(s).`;
    } catch (e) {
      statusEl.textContent = `AI key error: ${String(e)}`;
    } finally {
      aiKeyBtn.disabled = false;
    }
  });
}
