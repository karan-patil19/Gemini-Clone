// Vercel serverless function: POST /api/title
import { handleTitle } from "../server/gemini.js";

export function POST(request) {
  return handleTitle(request);
}
