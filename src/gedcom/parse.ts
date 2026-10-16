/** A raw GEDCOM line with its sub-lines, CONT/CONC already folded into `value`. */
export interface GedNode {
  level: number
  xref?: string
  tag: string
  value: string
  children: GedNode[]
}

const LINE = /^\s*(\d+)\s+(?:@([^@]+)@\s+)?([A-Za-z0-9_]+)(?: (.*))?$/

export function parseGedcom(text: string): GedNode[] {
  const roots: GedNode[] = []
  const stack: GedNode[] = []

  for (const raw of text.replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    if (!raw.trim()) continue
    const m = LINE.exec(raw)
    if (!m) continue

    const level = Number(m[1])
    const tag = m[3].toUpperCase()
    const value = m[4] ?? ''

    if (tag === 'CONT' || tag === 'CONC') {
      const parent = stack[level - 1]
      if (parent) parent.value += (tag === 'CONT' ? '\n' : '') + value
      continue
    }

    const node: GedNode = { level, tag, value, children: [] }
    if (m[2]) node.xref = m[2]

    if (level === 0) roots.push(node)
    else stack[level - 1]?.children.push(node)

    stack[level] = node
    stack.length = level + 1
  }
  return roots
}

export const child = (n: GedNode | undefined, tag: string) => n?.children.find((c) => c.tag === tag)
export const children = (n: GedNode | undefined, tag: string) => n?.children.filter((c) => c.tag === tag) ?? []
export const pointer = (value: string) => /^@([^@]+)@$/.exec(value.trim())?.[1]
