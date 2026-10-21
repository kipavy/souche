import { useCallback, useEffect, useRef, useState } from 'react'

export interface LoadedFile {
  name: string
  text: string
  /** How the file stays in sync: dev server watch, browser file handle, or a one-off copy. */
  live: 'dev' | 'handle' | 'none'
  loadedAt: number
  /** Edited in Souche and not saved yet. */
  dirty?: boolean
  /** Just created from scratch: the viewer opens the first person for editing. */
  isNew?: boolean
}

// ---------- tiny IndexedDB store for the file handle ----------

const DB = 'souche'
const STORE = 'handles'

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB, 1)
      open.onupgradeneeded = () => open.result.createObjectStore(STORE)
      open.onerror = () => resolve(undefined)
      open.onsuccess = () => {
        const req = run(open.result.transaction(STORE, mode).objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(undefined)
      }
    } catch {
      resolve(undefined)
    }
  })
}

const saveHandle = (h: FileSystemFileHandle) => idb('readwrite', (s) => s.put(h, 'last'))
const loadHandle = () => idb<FileSystemFileHandle>('readonly', (s) => s.get('last'))

// ---------- decoding ----------

/** GEDCOM files are usually UTF-8, but older software writes ANSI. */
export function decode(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

type PickerWindow = Window & {
  showOpenFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle>
}
type PermissionHandle = FileSystemFileHandle & {
  queryPermission?: (o: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (o: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
}
type WritableHandle = FileSystemFileHandle & {
  createWritable?: () => Promise<{ write: (data: Blob | string) => Promise<void>; close: () => Promise<void> }>
}

export const canWatchFiles = typeof window !== 'undefined' && 'showOpenFilePicker' in window
const GED_TYPES = [{ description: 'Arbre GEDCOM', accept: { 'text/plain': ['.ged', '.gedcom'] } }]

/** Hands the text to the browser as a file to save. */
export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = /\.ged(com)?$/i.test(name) ? name : `${name}.ged`
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function writeHandle(h: FileSystemFileHandle, text: string): Promise<boolean> {
  const ph = h as PermissionHandle & WritableHandle
  if (!ph.createWritable) return false
  const state = (await ph.queryPermission?.({ mode: 'readwrite' })) ?? 'granted'
  if (state !== 'granted' && (await ph.requestPermission?.({ mode: 'readwrite' })) !== 'granted') return false
  const w = await ph.createWritable()
  await w.write(text)
  await w.close()
  return true
}

export function useGedFile() {
  const [file, setFile] = useState<LoadedFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedHandle, setSavedHandle] = useState<FileSystemFileHandle | null>(null)
  const [booting, setBooting] = useState(true)
  const handleRef = useRef<FileSystemFileHandle | null>(null)
  const lastModified = useRef(0)
  // Unsaved edits win over a reload from disk.
  const dirtyRef = useRef(false)
  useEffect(() => {
    dirtyRef.current = !!file?.dirty
  }, [file?.dirty])

  const readHandle = useCallback(async (h: FileSystemFileHandle, force = false) => {
    const f = await h.getFile()
    if (!force && (f.lastModified === lastModified.current || dirtyRef.current)) return
    lastModified.current = f.lastModified
    setFile({ name: f.name, text: decode(await f.arrayBuffer()), live: 'handle', loadedAt: Date.now() })
    setError(null)
  }, [])

  // Dev server watch (npm run dev with SOUCHE_FILE set), then a remembered file handle.
  useEffect(() => {
    let cancelled = false
    const onDevChange = () => {
      if (!dirtyRef.current) void fromDev()
    }
    const fromDev = async () => {
      if (!import.meta.env.DEV) return false
      const res = await fetch('/__souche/file').catch(() => null)
      if (!res?.ok) return false
      const name = decodeURIComponent(res.headers.get('x-souche-name') ?? 'arbre.ged')
      const text = decode(await res.arrayBuffer())
      if (!cancelled) setFile({ name, text, live: 'dev', loadedAt: Date.now() })
      return true
    }
    ;(async () => {
      if (await fromDev()) {
        if (!cancelled) import.meta.hot?.on('souche:file-changed', onDevChange)
      } else if (canWatchFiles) {
        const h = await loadHandle()
        if (h && !cancelled) {
          const state = await (h as PermissionHandle).queryPermission?.({ mode: 'read' })
          if (state === 'granted') {
            handleRef.current = h
            await readHandle(h, true).catch(() => setSavedHandle(h))
          } else setSavedHandle(h)
        }
      }
      if (!cancelled) setBooting(false)
    })()
    return () => {
      cancelled = true
      import.meta.hot?.off('souche:file-changed', onDevChange)
    }
  }, [readHandle])

  // Poll the file handle: the browser gives no change event for local files.
  useEffect(() => {
    if (file?.live !== 'handle') return
    const t = window.setInterval(() => {
      if (handleRef.current && document.visibilityState === 'visible') {
        readHandle(handleRef.current).catch(() => setError('Le fichier n’est plus accessible. Ouvre-le à nouveau.'))
      }
    }, 1500)
    return () => window.clearInterval(t)
  }, [file?.live, readHandle])

  const adoptHandle = useCallback(
    async (h: FileSystemFileHandle) => {
      handleRef.current = h
      setSavedHandle(null)
      await saveHandle(h)
      await readHandle(h, true)
    },
    [readHandle],
  )

  /** Returns false when the browser has no file picker with live access (the caller falls back to <input type=file>). */
  const openWithPicker = useCallback(async () => {
    const w = window as PickerWindow
    if (!w.showOpenFilePicker) return false
    try {
      const [h] = await w.showOpenFilePicker({
        types: [{ description: 'Arbre GEDCOM', accept: { 'text/plain': ['.ged', '.gedcom'] } }],
        excludeAcceptAllOption: false,
      })
      await adoptHandle(h)
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') setError('Impossible de lire ce fichier.')
    }
    return true
  }, [adoptHandle])

  const reopenSaved = useCallback(async () => {
    const h = savedHandle as PermissionHandle | null
    if (!h) return
    const state = await h.requestPermission?.({ mode: 'read' })
    if (state === 'granted') await adoptHandle(h).catch(() => setError('Le fichier a été déplacé ou supprimé. Ouvre-le à nouveau.'))
  }, [savedHandle, adoptHandle])

  const loadPlainFile = useCallback(async (f: File | FileSystemFileHandle) => {
    if ('getFile' in f) return adoptHandle(f)
    handleRef.current = null
    setFile({ name: f.name, text: decode(await f.arrayBuffer()), live: 'none', loadedAt: Date.now() })
    setError(null)
  }, [adoptHandle])

  const loadSample = useCallback(async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}exemple.ged`)
    handleRef.current = null
    setFile({ name: 'exemple.ged', text: await res.text(), live: 'none', loadedAt: Date.now() })
  }, [])

  const close = useCallback(() => {
    handleRef.current = null
    setFile(null)
  }, [])

  /** Replaces the text after an edit made in Souche. */
  const edit = useCallback((text: string) => {
    setFile((f) => (f ? { ...f, text, dirty: true, isNew: false, loadedAt: Date.now() } : f))
  }, [])

  const createNew = useCallback((text: string) => {
    handleRef.current = null
    setFile({ name: 'mon-arbre.ged', text, live: 'none', loadedAt: Date.now(), dirty: true, isNew: true })
    setError(null)
  }, [])

  const markSaved = useCallback((patch: Partial<LoadedFile> = {}) => {
    setFile((f) => (f ? { ...f, ...patch, dirty: false } : f))
  }, [])

  /** Writes back to the opened file when the browser allows it, else asks where to save (or downloads). */
  const save = useCallback(async (): Promise<'saved' | 'downloaded' | 'cancelled'> => {
    if (!file) return 'cancelled'
    try {
      const h = handleRef.current
      if (h && (await writeHandle(h, file.text))) {
        lastModified.current = (await h.getFile()).lastModified
        markSaved()
        return 'saved'
      }
      const w = window as PickerWindow
      if (w.showSaveFilePicker) {
        const nh = await w.showSaveFilePicker({ suggestedName: file.name, types: GED_TYPES })
        if (await writeHandle(nh, file.text)) {
          handleRef.current = nh
          await saveHandle(nh)
          lastModified.current = (await nh.getFile()).lastModified
          markSaved({ name: nh.name, live: 'handle' })
          return 'saved'
        }
      }
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled'
      setError('Enregistrement impossible : le fichier a été téléchargé à la place.')
    }
    downloadText(file.name, file.text)
    markSaved()
    return 'downloaded'
  }, [file, markSaved])

  const download = useCallback(() => {
    if (file) downloadText(file.name, file.text)
  }, [file])

  // Closing the tab with unsaved edits asks first.
  useEffect(() => {
    if (!file?.dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [file?.dirty])

  return { file, error, booting, savedHandle, openWithPicker, reopenSaved, loadPlainFile, loadSample, close, edit, createNew, save, download }
}
