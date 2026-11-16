# Gemini Clone

A Gemini-style AI chat app built with React 18, Vite 6 and Google's official `@google/genai` SDK.

Live: <https://gemini-clone-theta.vercel.app/>

## Features

- **Streaming answers** that appear word by word, with a **Stop** button
- **Automatic model fallback**: if the chosen model is overloaded (503), rate-limited (429) or doesn't respond within 15 s, the app tries the next model. Busy models are skipped for 2 minutes, so later messages stay fast.
- **Multi-turn conversations**: Gemini remembers earlier messages in the chat
- **Chat history** saved in the browser, with AI-generated titles, search, pin, rename and delete
- **Model picker**: Fast (Gemini 3.8 Flash), Pro (Gemini 3.1 Pro), Lite (Gemini 3.5 Flash-Lite)
- **Markdown rendering**: headings, lists, tables, and syntax-highlighted code blocks with a copy button
- **Image input**: attach, paste or drag-and-drop up to 4 images and ask about them
- **Voice input** (microphone) and **read aloud** for answers
- **Edit a prompt** and resend it, **redo** a response, copy, thumbs up/down
- **Light / dark / system theme**
- **API key stays secret**: the browser talks to this site's own `/api` functions; only the server holds the key
- **Responsive**: collapsible sidebar on desktop, slide-out drawer on mobile
- Keyboard: `Enter` sends, `Shift+Enter` adds a new line, `Ctrl+Shift+O` starts a new chat

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env   # then put your key in .env
npm run dev
```

Get a free API key at <https://aistudio.google.com/apikey> and set it in `.env`:

```
GEMINI_API_KEY=your_api_key_here
VITE_USER_NAME=Karan   # optional, used in the greeting
```

Open <http://localhost:5173>. `npm run dev` also serves the `/api` functions, so no extra tools are needed.

## How the API key is protected

```
Browser ──POST /api/chat──▶ Vercel function (holds GEMINI_API_KEY) ──▶ Google Gemini
```

- The key has **no `VITE_` prefix**, so Vite never puts it in the website's JavaScript.
- `/api/chat` and `/api/title` only accept requests whose `Origin` is this site, so other websites can't use them.
- Each visitor is limited to 20 requests a minute, and only the models in the picker are allowed.
- Request size is capped, and attached images are shrunk in the browser before upload.

These checks stop other websites and casual misuse. They aren't a hard quota, because a determined script can fake headers. For stronger protection, add a spending cap or quota for the key in Google Cloud, or enable Vercel's Firewall rate limiting.

## Deploying to Vercel

1. In Vercel, open the project → **Settings → Environment Variables**, and add `GEMINI_API_KEY` for Production, Preview and Development.
2. Push to `main`. Vercel builds the Vite app and turns the files in `api/` into serverless functions automatically.

## Scripts

| Command           | What it does                     |
| ----------------- | -------------------------------- |
| `npm run dev`     | Start the dev server             |
| `npm run build`   | Production build into `dist/`    |
| `npm run preview` | Serve the production build       |
| `npm run lint`    | Run ESLint                       |

## Project structure

```
api/                      Vercel serverless functions (/api/chat, /api/title)
server/gemini.js          Server-only: Gemini calls, model fallback, origin check, rate limit
src/
  lib/gemini.js           Browser client for /api: streaming, error messages
  context/ChatContext.jsx Chat state (conversations, sending, regenerate, edit) + localStorage
  components/
    Sidebar.jsx           History, search, pin/rename/delete, settings & theme
    Home.jsx              Greeting and suggestion chips
    Composer.jsx          Input box, image attach, mic, model picker, send/stop
    ChatView.jsx          Message list with auto-scroll
    Message.jsx           User and Gemini messages with actions
    Markdown.jsx          Markdown + highlighted code blocks
  hooks.js                Theme, media query, copy, click-outside helpers
```

## Changing models

Edit `MODELS` (the picker) in `src/lib/gemini.js`, and `ALLOWED_MODELS` and `FALLBACK_CHAIN` (the backup order) in `server/gemini.js`. To see which models your key can use:

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY"
```
