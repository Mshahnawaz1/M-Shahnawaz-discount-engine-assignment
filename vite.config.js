import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Serves /api/parse-rule during `npm run dev` with the same handler Vercel
 * uses in production, so local dev needs no extra tooling.
 * GEMINI_API_KEY is read from .env.local and never bundled into client code
 * (it has no VITE_ prefix).
 */
function localApi(env) {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use('/api/parse-rule', async (req, res) => {
        const { handleParseRuleRequest } = await server.ssrLoadModule('/server/geminiRuleParser.js')
        await handleParseRuleRequest(req, res, env)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') }
  return {
    plugins: [react(), localApi(env)],
    test: { environment: 'node' },
  }
})
