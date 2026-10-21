import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildTree, type Tree } from './gedcom/model'
import { auditTree } from './gedcom/quality'
import { allRelations } from './gedcom/relationship'
import { sosaByPerson, sosaMap } from './layout/fan'
import { useGedFile, type LoadedFile } from './source/loader'
import { plural } from './util'
import { AppContext, VIEWS, type AppState, type View } from './state'
import { IconMoon, IconSearch, IconSun, Logo } from './ui/icons'
import { PersonPanel } from './ui/PersonPanel'
import { SearchPalette } from './ui/SearchPalette'
import { Welcome } from './ui/Welcome'
import { AuditView } from './views/AuditView'
import { DirectoryView } from './views/DirectoryView'
import { FanView } from './views/FanView'
import { TimelineView } from './views/TimelineView'
import { TreeView } from './views/TreeView'

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* private mode: preferences just won't stick */
    }
  },
}

type DropItem = DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> }

export default function App() {
  const g = useGedFile()
  const { loadPlainFile } = g
  const [dragging, setDragging] = useState(false)

  // The whole window accepts a dropped .ged file.
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault()
    const drop = async (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const item = e.dataTransfer?.items[0] as DropItem | undefined
      // Chromium hands out a live handle for dropped files, so edits are picked up too.
      const handle = await item?.getAsFileSystemHandle?.().catch(() => null)
      if (handle?.kind === 'file') return loadPlainFile(handle as FileSystemFileHandle)
      const f = e.dataTransfer?.files[0]
      if (f) loadPlainFile(f)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [loadPlainFile])

  return (
    <>
      {g.file ? (
        <Viewer file={g.file} error={g.error} onClose={g.close} />
      ) : g.booting ? null : (
        <Welcome
          error={g.error}
          savedName={g.savedHandle?.name}
          onOpen={g.openWithPicker}
          onFile={g.loadPlainFile}
          onReopen={g.reopenSaved}
          onSample={g.loadSample}
        />
      )}
      {dragging && <div className="dropzone">Déposez le fichier .ged ici</div>}
    </>
  )
}

function readHash(): { view?: View; person?: string } {
  const params = new URLSearchParams(location.hash.slice(1))
  const view = params.get('vue') as View | null
  return { view: VIEWS.some((v) => v.id === view) ? view! : undefined, person: params.get('p') ?? undefined }
}

function Viewer({ file, error, onClose }: { file: LoadedFile; error: string | null; onClose: () => void }) {
  const tree = useMemo<Tree>(() => buildTree(file.text), [file.text])
  const empty = tree.persons.size === 0

  const refKey = `souche.ref.${file.name}`
  const pickRef = useCallback(() => {
    const saved = store.get(refKey)
    return saved && tree.persons.has(saved) ? saved : (tree.order[0] ?? '')
  }, [refKey, tree])

  const [pinnedRefId, setRefIdState] = useState(pickRef)
  const [refFollowsFocus, setRefFollowsFocusState] = useState(() => store.get('souche.refFollowsFocus') === '1')
  const [focusId, setFocusId] = useState(() => {
    const h = readHash().person
    return h && tree.persons.has(h) ? h : pickRef()
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<View>(() => readHash().view ?? 'arbre')
  const [searching, setSearching] = useState(false)
  const [pulse, setPulse] = useState(0)

  // Live reload: keep where we were if those people still exist.
  useEffect(() => {
    if (!tree.persons.has(pinnedRefId)) setRefIdState(pickRef())
    if (!tree.persons.has(focusId)) setFocusId(pickRef())
    if (selectedId && !tree.persons.has(selectedId)) setSelectedId(null)
    setPulse((n) => n + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree])

  useEffect(() => {
    history.replaceState(null, '', `#vue=${view}&p=${encodeURIComponent(focusId)}`)
  }, [view, focusId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input, textarea, select')
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setSearching(true)
      }
      if (e.key === 'Escape' && !typing) setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const refId = refFollowsFocus && tree.persons.has(focusId) ? focusId : pinnedRefId
  const relations = useMemo(() => allRelations(tree, refId), [tree, refId])
  const sosa = useMemo(() => sosaByPerson(sosaMap(tree, refId)), [tree, refId])
  const incoherent = useMemo(() => auditTree(tree).filter((i) => i.kind === 'incoherent').length, [tree])

  const state: AppState = {
    tree,
    refId,
    setRefId: (id) => {
      setRefIdState(id)
      store.set(refKey, id)
      // Picking a reference by hand means it should stay put.
      setRefFollowsFocusState(false)
      store.set('souche.refFollowsFocus', '0')
    },
    refFollowsFocus,
    setRefFollowsFocus: (on) => {
      setRefFollowsFocusState(on)
      store.set('souche.refFollowsFocus', on ? '1' : '0')
    },
    focusId,
    focus: setFocusId,
    selectedId,
    select: setSelectedId,
    relations,
    sosa,
    view,
    setView,
  }

  if (empty) {
    return (
      <main className="welcome">
        <div className="welcome__body">
          <h1>Fichier vide</h1>
          <p>« {file.name} » ne contient aucune fiche de personne (INDI). Vérifiez qu’il s’agit bien d’un export GEDCOM.</p>
          <button className="btn btn--primary" onClick={onClose}>Choisir un autre fichier</button>
        </div>
      </main>
    )
  }

  const updated = new Date(file.loadedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  return (
    <AppContext.Provider value={state}>
      <div className="shell">
        <header className="topbar">
          <button className="brand" onClick={onClose} title="Changer de fichier">
            <Logo />
            Souche
          </button>
          <div className="filechip" title={file.live === 'none' ? 'Copie chargée une fois : rouvrez le fichier après modification' : 'Relu automatiquement à chaque enregistrement'}>
            {file.live !== 'none' && <span key={pulse} className={`livedot${pulse > 1 ? ' livedot--pulse' : ''}`} aria-hidden="true" />}
            <span className="filechip__name">{file.name}</span>
            <span className="filechip__count num" title={plural(tree.families.size, 'famille', 'familles')}>
              {plural(tree.persons.size, 'personne', 'personnes')}
            </span>
            <span>{file.live === 'none' ? '' : `à jour ${updated}`}</span>
            {error && <span className="error">{error}</span>}
          </div>

          <nav className="tabs" aria-label="Vues">
            {VIEWS.map((v) => (
              <button key={v.id} aria-current={view === v.id ? 'page' : undefined} onClick={() => setView(v.id)}>
                {v.label}
                {v.id === 'a-completer' && incoherent > 0 && <span className="tabs__count" title={`${incoherent} incohérence(s)`}>{incoherent}</span>}
              </button>
            ))}
          </nav>

          <button className="btn searchbtn" onClick={() => setSearching(true)} aria-label="Rechercher une personne">
            <span style={{ display: 'inline-flex', gap: '0.45em', alignItems: 'center' }}>
              <IconSearch />
              <span className="searchbtn__text">Rechercher</span>
            </span>
            <span className="kbd">Ctrl K</span>
          </button>
          <ThemeToggle />
        </header>

        <div className="workspace">
          <section className="stage" aria-label={VIEWS.find((v) => v.id === view)?.label}>
            {view === 'arbre' && <TreeView />}
            {view === 'eventail' && <FanView />}
            {view === 'chronologie' && <TimelineView />}
            {view === 'repertoire' && <DirectoryView />}
            {view === 'a-completer' && <AuditView />}
          </section>
          {selectedId && <PersonPanel key={selectedId} id={selectedId} />}
        </div>
      </div>
      {searching && <SearchPalette onClose={() => setSearching(false)} />}
    </AppContext.Provider>
  )
}

function ThemeToggle() {
  const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (store.get('souche.theme') as 'light' | 'dark' | null) ?? (systemDark() ? 'dark' : 'light'))
  useEffect(() => {
    if (store.get('souche.theme')) document.documentElement.dataset.theme = theme
  }, [theme])
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      className="btn btn--quiet btn--icon"
      aria-label={next === 'dark' ? 'Passer en thème sombre' : 'Passer en thème clair'}
      onClick={() => {
        store.set('souche.theme', next)
        document.documentElement.dataset.theme = next
        setTheme(next)
      }}
    >
      {theme === 'dark' ? <IconSun /> : <IconMoon />}
    </button>
  )
}

