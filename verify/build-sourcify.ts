/**
 * Builds the Sourcify input for RetentionVault from the Studio artifact:
 *   verify/sourcify/metadata.json  (the artifact's rawMetadata, unchanged)
 *   verify/sourcify/sources/<path> (every source listed in the metadata)
 * Submission: verify/submit_sourcify.py. Each source's keccak256 must equal metadata.sources[path].keccak256, otherwise it stops.
 * Run (WSL): ~/.bun/bin/bun run verify/build-sourcify.ts <project-root-with-sources>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { keccak256, toBytes } from 'viem'

const repo = join(import.meta.dir, '..')
const sourceRoot = process.argv[2]
if (!sourceRoot) throw new Error('usage: bun run verify/build-sourcify.ts <project-root-with-sources>')

const artifact = JSON.parse(readFileSync(join(repo, 'studio/contracts/out/RetentionVault.sol/RetentionVault.json'), 'utf8'))
const rawMetadata: string = artifact.rawMetadata
const metadata = JSON.parse(rawMetadata)
const out = join(repo, 'verify/sourcify')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'metadata.json'), rawMetadata)

const sources: Record<string, string> = {}
let bad = 0
for (const [path, info] of Object.entries(metadata.sources) as [string, { keccak256: string }][]) {
  const content = readFileSync(join(sourceRoot, path), 'utf8')
  const hash = keccak256(toBytes(content))
  const ok = hash === info.keccak256
  if (!ok) bad++
  console.log(`${ok ? 'ok ' : 'BAD'} ${path} ${hash.slice(0, 14)}`)
  sources[path] = content
  const dest = join(out, 'sources', path)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, content)
}
if (bad) throw new Error(`${bad} source(s) do not match the metadata keccak256`)
console.log(`all ${Object.keys(sources).length} sources match; compiler ${metadata.compiler.version}, evm ${metadata.settings.evmVersion}, optimizer ${JSON.stringify(metadata.settings.optimizer)}`)
