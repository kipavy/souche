import { createContext, useContext } from 'react'
import type { Tree } from './gedcom/model'
import type { Relation } from './gedcom/relationship'

export type View = 'arbre' | 'eventail' | 'chronologie' | 'repertoire' | 'a-completer'

export const VIEWS: { id: View; label: string }[] = [
  { id: 'arbre', label: 'Arbre' },
  { id: 'eventail', label: 'Éventail' },
  { id: 'chronologie', label: 'Chronologie' },
  { id: 'repertoire', label: 'Répertoire' },
  { id: 'a-completer', label: 'À compléter' },
]

export interface AppState {
  tree: Tree
  /** The person relationships are expressed from (usually yourself). */
  refId: string
  setRefId: (id: string) => void
  /** When on, the reference follows whoever the tree is centered on (colors, labels, Sosa). */
  refFollowsFocus: boolean
  setRefFollowsFocus: (on: boolean) => void
  /** Who the tree and fan are centered on. */
  focusId: string
  focus: (id: string) => void
  selectedId: string | null
  select: (id: string | null) => void
  relations: Map<string, Relation>
  /** Sosa numbers of the reference person's ancestors. */
  sosa: Map<string, number[]>
  view: View
  setView: (v: View) => void
}

export const AppContext = createContext<AppState | null>(null)

export function useApp(): AppState {
  const s = useContext(AppContext)
  if (!s) throw new Error('useApp outside provider')
  return s
}
