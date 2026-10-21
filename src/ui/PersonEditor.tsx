import { useId, useMemo, useState, type ReactNode } from 'react'
import type { EventForm, PersonForm } from '../gedcom/edit'
import { fullName, spouseIn } from '../gedcom/model'
import type { Sex } from '../gedcom/model'
import { useApp } from '../state'
import { IconClose, IconPlus, IconTrash } from './icons'

interface UnionForm {
  familyId: string
  label: string
  marriage: EventForm
}

const SEXES: [Sex, string][] = [['M', 'Homme'], ['F', 'Femme'], ['U', 'Inconnu']]

export function PersonEditor({ id }: { id: string }) {
  const { tree, read, apply, setEditingId, select } = useApp()
  const placesId = useId()

  const [form, setForm] = useState<PersonForm>(() => read((d) => d.readPerson(id)))
  const [unions, setUnions] = useState<UnionForm[]>(() =>
    read((d) =>
      (tree.persons.get(id)?.fams ?? []).map((fid) => {
        const f = tree.families.get(fid)
        const spouse = f && spouseIn(f, id)
        return { familyId: fid, label: spouse ? `Mariage avec ${fullName(tree.persons.get(spouse))}` : 'Mariage', marriage: d.readMarriage(fid) }
      }),
    ),
  )

  // Places already in the file, offered while typing.
  const places = useMemo(() => {
    const all = new Set<string>()
    for (const p of tree.persons.values()) for (const e of p.events) if (e.place) all.add(e.place)
    for (const f of tree.families.values()) for (const e of f.events) if (e.place) all.add(e.place)
    return [...all].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [tree])

  const set = <K extends keyof PersonForm>(key: K, value: PersonForm[K]) => setForm((f) => ({ ...f, [key]: value }))
  const name = fullName(tree.persons.get(id))

  const save = () => {
    apply((d) => {
      d.writePerson(id, form)
      for (const u of unions) d.writeMarriage(u.familyId, u.marriage)
    })
    setEditingId(null)
  }

  const remove = () => {
    if (!confirm(`Supprimer ${name === 'Inconnu' ? 'cette personne' : name} de l’arbre ? Ses liens avec la famille seront retirés.`)) return
    setEditingId(null)
    select(null)
    apply((d) => d.deletePerson(id))
  }

  return (
    <form
      className="editor"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setEditingId(null)
      }}
    >
      <div className="panel__top">
        <span>Modifier la fiche</span>
        <button type="button" className="btn btn--quiet btn--icon" onClick={() => setEditingId(null)} aria-label="Annuler les modifications">
          <IconClose />
        </button>
      </div>

      <div className="editor__row">
        <Field label="Prénoms">
          <input className="field__input" autoFocus value={form.given} onChange={(e) => set('given', e.target.value)} />
        </Field>
        <Field label="Nom">
          <input className="field__input field__input--caps" value={form.surname} onChange={(e) => set('surname', e.target.value)} />
        </Field>
      </div>

      <fieldset className="field">
        <legend className="field__label">Sexe</legend>
        <div className="segmented">
          {SEXES.map(([value, label]) => (
            <label key={value} className="segmented__option">
              <input type="radio" name="sex" checked={form.sex === value} onChange={() => set('sex', value)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <EventFields label="Naissance" value={form.birth} placesId={placesId} onChange={(v) => set('birth', v)} />
      <EventFields label="Décès" value={form.death} placesId={placesId} onChange={(v) => set('death', v)} />
      {unions.map((u, i) => (
        <EventFields
          key={u.familyId}
          label={u.label}
          value={u.marriage}
          placesId={placesId}
          onChange={(v) => setUnions((list) => list.map((x, j) => (j === i ? { ...x, marriage: v } : x)))}
        />
      ))}
      <p className="editor__hint">Dates : 17/06/1998, 06/1998, 1998, vers 1900, avant 1950, après 1700, entre 1870 et 1875.</p>
      <datalist id={placesId}>
        {places.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div className="field">
        <span className="field__label">Notes</span>
        {form.notes.map((n, i) => (
          <div className="editor__note" key={i}>
            <textarea
              className="field__input"
              rows={Math.min(8, Math.max(2, Math.ceil(n.length / 42)))}
              value={n}
              onChange={(e) => set('notes', form.notes.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button type="button" className="btn btn--quiet btn--icon" aria-label="Retirer cette note" onClick={() => set('notes', form.notes.filter((_, j) => j !== i))}>
              <IconClose />
            </button>
          </div>
        ))}
        <button type="button" className="btn btn--quiet editor__add" onClick={() => set('notes', [...form.notes, ''])}>
          <IconPlus /> Ajouter une note
        </button>
      </div>

      <div className="panel__actions">
        <button type="submit" className="btn btn--primary">Valider</button>
        <button type="button" className="btn" onClick={() => setEditingId(null)}>Annuler</button>
      </div>

      <div className="editor__danger">
        <button type="button" className="btn btn--quiet btn--danger" onClick={remove}>
          <IconTrash /> Supprimer cette personne
        </button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  )
}

function EventFields({ label, value, placesId, onChange }: { label: string; value: EventForm; placesId: string; onChange: (v: EventForm) => void }) {
  return (
    <fieldset className="field">
      <legend className="field__label">{label}</legend>
      <div className="editor__row editor__row--event">
        <input className="field__input" placeholder="Date" aria-label={`${label} : date`} value={value.date} onChange={(e) => onChange({ ...value, date: e.target.value })} />
        <input className="field__input" placeholder="Lieu" aria-label={`${label} : lieu`} list={placesId} value={value.place} onChange={(e) => onChange({ ...value, place: e.target.value })} />
      </div>
    </fieldset>
  )
}
