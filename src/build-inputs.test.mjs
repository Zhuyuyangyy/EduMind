import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

test('relative JSON imports used by the admin screen exist in a clean checkout', async () => {
  const componentPath = path.join(root, 'components', 'admin', 'AdminBigScreen.vue')
  const source = await readFile(componentPath, 'utf8')
  const imports = [...source.matchAll(/from\s+['"]([^'"]+\.json)['"]/g)]

  assert.ok(imports.length > 0, 'expected at least one JSON import')
  await Promise.all(imports.map(async ([, specifier]) => {
    const resolved = path.resolve(path.dirname(componentPath), specifier)
    await assert.doesNotReject(access(resolved), `missing build input: ${specifier}`)
  }))
})
