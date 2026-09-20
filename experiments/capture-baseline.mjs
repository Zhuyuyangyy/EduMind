import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

const projectRoot = process.cwd()
const outputDir = path.resolve(process.argv[2] || '../../artifacts/baseline')
const sourceArchive = process.argv[3]
if (!sourceArchive) throw new Error('请通过第三个命令行参数传入待比较源码 ZIP 路径。')
const excludedDirectories = new Set(['.git', 'dist', 'node_modules'])
const excludedFiles = new Set(['server/store.json'])

async function hashFile(filePath) {
  const content = await fs.readFile(filePath)
  return crypto.createHash('sha256').update(content).digest('hex')
}

async function collectFiles(directory, prefix = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectFiles(absolutePath, relativePath))
    else if (entry.isFile() && !excludedFiles.has(relativePath)) files.push({ relativePath, absolutePath })
  }
  return files
}

async function runAndLog(name, command, args, env = {}) {
  const startedAt = new Date().toISOString()
  const started = performance.now()
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    shell: false,
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => { stdout += chunk.toString() })
  child.stderr.on('data', chunk => { stderr += chunk.toString() })
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
  const record = {
    name,
    command: `${command} ${args.join(' ')}`,
    startedAt,
    durationMs: performance.now() - started,
    exitCode,
    stdout,
    stderr,
  }
  await fs.writeFile(path.join(outputDir, `${name}.log`), [
    `startedAt=${record.startedAt}`,
    `durationMs=${record.durationMs}`,
    `exitCode=${record.exitCode}`,
    '',
    '[stdout]',
    stdout,
    '[stderr]',
    stderr,
  ].join('\n'), 'utf8')
  return record
}

await fs.mkdir(outputDir, { recursive: true })
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('npm_execpath is unavailable; run this script through npm run experiment:baseline')
const isolatedEnv = {
  LLM_API_URL: '',
  LLM_API_KEY: '',
  ZHIXUE_DATA_FILE: path.resolve('../../artifacts/runtime-baseline/store.json'),
  ZHIXUE_TRACE_FILE: path.resolve('../../artifacts/runtime-baseline/traces.json'),
}
const testRun = await runAndLog('npm-test', process.execPath, [npmCli, 'test'], isolatedEnv)
const buildRun = await runAndLog('npm-build', process.execPath, [npmCli, 'run', 'build'], isolatedEnv)

const files = await collectFiles(projectRoot)
const manifest = []
const treeHasher = crypto.createHash('sha256')
for (const file of files) {
  const sha256 = await hashFile(file.absolutePath)
  const stats = await fs.stat(file.absolutePath)
  manifest.push({ path: file.relativePath, bytes: stats.size, sha256 })
  treeHasher.update(file.relativePath).update('\0').update(sha256).update('\n')
}

const resultFiles = [
  '../../artifacts/raw/anomaly-results.json',
  '../../artifacts/raw/api-benchmark.json',
  '../../artifacts/raw/rag-results.json',
  '../../artifacts/raw/llm-sample-results.json',
].map(item => path.resolve(item))
const resultHashes = []
for (const filePath of resultFiles) {
  try {
    const stats = await fs.stat(filePath)
    resultHashes.push({ path: filePath, bytes: stats.size, sha256: await hashFile(filePath) })
  } catch {}
}

const baseline = {
  capturedAt: new Date().toISOString(),
  versionType: 'deterministic-source-tree-sha256-no-git-head',
  sourceTreeSha256: treeHasher.digest('hex'),
  sourceFileCount: manifest.length,
  exclusions: [...excludedDirectories, ...excludedFiles],
  sourceArchive: {
    path: path.resolve(sourceArchive),
    sha256: await hashFile(sourceArchive),
  },
  resultHashes,
  verificationRuns: [
    { name: testRun.name, exitCode: testRun.exitCode, durationMs: testRun.durationMs, log: path.join(outputDir, 'npm-test.log') },
    { name: buildRun.name, exitCode: buildRun.exitCode, durationMs: buildRun.durationMs, log: path.join(outputDir, 'npm-build.log') },
  ],
}

await fs.writeFile(path.join(outputDir, 'source-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
await fs.writeFile(path.join(outputDir, 'baseline.json'), JSON.stringify(baseline, null, 2), 'utf8')
console.log(JSON.stringify(baseline, null, 2))
if (testRun.exitCode !== 0 || buildRun.exitCode !== 0) process.exitCode = 1
