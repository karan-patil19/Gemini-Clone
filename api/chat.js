// Vercel serverless function: POST /api/chat
import { handleChat } from "../server/gemini.js";

export const maxDuration = 120;

export function POST(request) {
  return handleChat(request);
}
