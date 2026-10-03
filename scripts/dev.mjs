import { createServer } from "vite"
import { spawn } from "child_process"
import { createRequire } from "module"
import path from "path"
import { fileURLToPath } from "url"

const require = createRequire(import.meta.url)
const electronPath = require("electron")

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const userDataDir = path.join(__dirname, "..", ".dev-userdata")

const server = await createServer()
await server.listen()

const url = server.resolvedUrls?.local?.[0] ?? "http://localhost:5173"
console.log(`Vite ready at ${url}, starting Electron...`)

const electron = spawn(String(electronPath), [".", url, `--user-data-dir=${userDataDir}`], {
  stdio: "inherit",
  shell: true,
})

electron.on("close", (code) => {
  server.close()
  process.exit(code ?? 0)
})

process.on("SIGINT", () => {
  electron.kill()
  server.close()
  process.exit()
})
