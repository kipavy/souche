import { readFile } from 'node:fs/promises'
import { unwatchFile, watchFile } from 'node:fs'
import { basename, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Dev-only: serve the GEDCOM file named by SOUCHE_FILE (in .env.local) and tell
 * the page whenever it changes, so the tree refreshes as you edit it.
 * Stat polling rather than fs.watch so it also works on network drives.
 */
function watchGedcom(file: string | undefined): Plugin {
  return {
    name: 'souche-watch-gedcom',
    apply: 'serve',
    configureServer(server) {
      if (!file || process.env.VITEST) return
      const path = resolve(file)
      server.middlewares.use('/__souche/file', async (_req, res) => {
        try {
          const body = await readFile(path)
          res.setHeader('content-type', 'application/octet-stream')
          res.setHeader('cache-control', 'no-store')
          res.setHeader('x-souche-name', encodeURIComponent(basename(path)))
          res.end(body)
        } catch {
          res.statusCode = 404
          res.end()
        }
      })
      const onChange = (cur: { mtimeMs: number }, prev: { mtimeMs: number }) => {
        if (cur.mtimeMs !== prev.mtimeMs) server.ws.send({ type: 'custom', event: 'souche:file-changed' })
      }
      watchFile(path, { interval: 1000 }, onChange)
      // Remove only this listener: on config reload the new server has already registered its own.
      server.httpServer?.on('close', () => unwatchFile(path, onChange))
      server.config.logger.info(`  ➜  Arbre suivi : ${path}`)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'SOUCHE_')
  return {
    base: './',
    plugins: [react(), watchGedcom(process.env.SOUCHE_FILE || env.SOUCHE_FILE)],
  }
})
