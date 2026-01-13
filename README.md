## ⚠️ Disclaimer

**This project is for educational and personal study purposes only.** 

- This software is provided free of charge and is NOT for sale
- You may NOT use this code for commercial purposes or profit
- You may NOT redistribute or resell this software
- Use at your own risk - I am not liable for any misuse or legal issues
- Respect copyright laws when uploading and processing documents

**Educational Use Only** - This tool is designed to help students study more effectively. Please use responsibly.

**Image Disclaimer:** Images used in this project (including Sanrio characters) are for aesthetic purposes only. No copyright infringement is intended. All images are property of their respective owners (Sanrio Co., Ltd.). If you are the copyright holder and wish for any image to be removed, please contact me.

---

# PDF to Quiz

Convert PDF and DOCX files into interactive multiple-choice quizzes with AI-powered explanations and grading.

## Features

- 📄 **PDF & DOCX Support** - Upload and parse quiz questions from documents
- 🎯 **Interactive Quiz Interface** - Clean, modern UI with video backgrounds
- 🤖 **AI Assistant** - Ask questions and get explanations using local Ollama
- ✅ **AI Grading** - Automatic answer key generation and live grading
- 📊 **Real-time Scoring** - Track answered, correct, and wrong questions
- 🎨 **Polished UI** - Ollama-inspired white chat interface with smooth animations
- ⚡ **Fast Responses** - Optimized streaming with client/server buffering

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [Ollama](https://ollama.ai/) desktop app
- qwen2.5:3b model (or any Ollama model)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/npmcry/sickafcode.git
cd sickafcode
```

2. Install frontend dependencies:
```bash
npm install
```

3. Install backend dependencies:
```bash
cd server
npm install
```

4. Set up environment variables:
```bash
# Copy the example file
copy .env.example .env

# Edit .env if needed (default settings work out of the box)
```

5. Install and start Ollama:
```bash
# Download from https://ollama.ai/
# Then pull the model:
ollama pull qwen2.5:3b
```

## Usage

1. Start Ollama (if not already running as a background service)

2. Start the backend server:
```bash
cd server
node index.js
```

3. Start the frontend (in a new terminal):
```bash
npm run dev
```

4. Open your browser to `http://localhost:5173`

5. Upload a PDF or DOCX file with questions in this format:
```
Q1. What is the capital of France?
A) London
B) Paris
C) Berlin
D) Madrid
Answer: B

Q2. What is 2 + 2?
A) 3
B) 4
C) 5
D) 6
Answer: B
```

## Project Structure

```
├── public/              # Static assets (videos, images)
├── server/              # Express backend for AI API
│   ├── index.js         # API endpoints (explain, grade)
│   ├── .env             # Environment config
│   └── package.json
├── src/
│   ├── extractors/      # PDF/DOCX parsers
│   ├── main.js          # Quiz logic and AI chat
│   ├── parser.js        # Question extraction
│   └── styles.css       # UI styling
├── index.html           # Main app layout
└── package.json
```

## Technologies

- **Frontend:** Vite, Vanilla JS
- **Backend:** Node.js, Express
- **AI:** Ollama (local LLM runtime)
- **Model:** qwen2.5:3b (fast, lightweight)

## Configuration

Edit `server/.env` to customize:
- `OLLAMA_MODEL` - Change AI model
- `OLLAMA_NUM_PREDICT` - Max tokens per response
- `PORT` - Backend server port

## Troubleshooting

**"Failed to fetch" error:**
- Make sure backend is running: `node server/index.js`
- Verify Ollama is running: check `http://localhost:11434`

**Slow AI responses:**
- Try a smaller model: `ollama pull qwen2.5:1.5b`
- Reduce `OLLAMA_NUM_PREDICT` in `.env`

**Model not found:**
- Pull the model: `ollama pull qwen2.5:3b`

## License

MIT License - Free for personal and educational use only.

**Commercial use, resale, or redistribution for profit is strictly prohibited without explicit written permission.**

## Contributing

Feel free to open issues or submit PRs!
