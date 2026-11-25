// Vercel serverless function: POST /api/parse-rule  { text, knownBrands?, knownPlatforms? }
// Keeps GEMINI_API_KEY on the server. All logic lives in server/geminiRuleParser.js.
import { handleParseRuleRequest } from '../server/geminiRuleParser.js'

export default function handler(req, res) {
  return handleParseRuleRequest(req, res)
}
