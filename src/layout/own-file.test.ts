import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildTree } from '../gedcom/model'
import { auditTree } from '../gedcom/quality'
import { consanguineousCouples, inbreeding } from '../gedcom/inbreeding'
import { allRelations } from '../gedcom/relationship'
import { fan } from './fan'
import { CARD_W, hourglass } from './hourglass'

// Smoke test on your own tree: SOUCHE_FILE=/path/to/file.ged pnpm vitest run own-file
const file = process.env.SOUCHE_FILE

describe.skipIf(!file || !existsSync(file))('own GEDCOM file', () => {
  // Read lazily: the describe body is still collected when the suite is skipped.
  let cached: ReturnType<typeof buildTree> | undefined
  const load = () => (cached ??= buildTree(readFileSync(file!, 'utf8')))

  it('lays out every person without overlapping cards', () => {
    const tree = load()
    for (const id of tree.persons.keys()) {
      const { nodes } = hourglass(tree, id, { up: 4, down: 3, siblings: true, uncles: true })
      for (const a of nodes)
        for (const b of nodes)
          if (a.key < b.key && a.y === b.y) expect(Math.abs(a.x - b.x), `${id}: ${a.key}/${b.key}`).toBeGreaterThanOrEqual(CARD_W)
      fan(tree, id, 8)
    }
  })

  it('labels every relation and audits', () => {
    const tree = load()
    const rel = allRelations(tree, tree.order[0])
    expect([...rel.values()].every((r) => r.label)).toBe(true)
    auditTree(tree)
  })

  it('computes inbreeding for everyone', () => {
    const tree = load()
    for (const id of tree.persons.keys()) {
      const { f } = inbreeding(tree, id)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(1)
    }
    consanguineousCouples(tree)
  })
})
