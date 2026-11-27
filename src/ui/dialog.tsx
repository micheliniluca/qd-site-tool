/* Finestre di dialogo interne all'app: sostituiscono window.confirm / window.prompt,
   che in alcuni ambienti (pannelli incorporati, iframe) sono bloccati e restituiscono subito "annulla". */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Risk } from '../site/model';
import { t } from '../i18n';

export interface DialogField { key: string; label: string; value?: string; type?: 'text' | 'number' | 'textarea'; placeholder?: string; required?: boolean }
export interface DialogRequest { title: string; message?: ReactNode; fields?: DialogField[]; ok?: string; cancel?: string; danger?: boolean }
type Ask = (r: DialogRequest) => Promise<Record<string, string> | null>;

const Ctx = createContext<Ask>(async () => null);
export const useDialog = () => useContext(Ctx);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<(DialogRequest & { resolve: (v: Record<string, string> | null) => void }) | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const first = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const okRef = useRef<HTMLButtonElement | null>(null);

  const ask = useCallback<Ask>((r) => new Promise((resolve) => {
    setVals(Object.fromEntries((r.fields ?? []).map((f) => [f.key, f.value ?? ''])));
    setReq({ ...r, resolve });
  }), []);

  useEffect(() => { if (req) setTimeout(() => (first.current ?? okRef.current)?.focus(), 0); }, [req]);

  const close = (v: Record<string, string> | null) => { req?.resolve(v); setReq(null); };
  const missing = (req?.fields ?? []).some((f) => f.required && !vals[f.key]?.trim());

  return (
    <Ctx.Provider value={ask}>
      {children}
      {req && (
        <div className="modal-bg" onMouseDown={() => close(null)}>
          <form className="modal dlg" onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); if (!missing) close(vals); }}
            onKeyDown={(e) => { if (e.key === 'Escape') close(null); }}>
            <h3>{req.title}</h3>
            {req.message && <div className="dlg-msg">{req.message}</div>}
            {(req.fields ?? []).map((f, i) => (
              <label key={f.key} className="fld"><span>{f.label}</span>
                {f.type === 'textarea'
                  ? <textarea rows={3} ref={i === 0 ? (el) => { first.current = el; } : undefined} value={vals[f.key]} placeholder={f.placeholder}
                      onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
                  : <input type={f.type ?? 'text'} step="any" ref={i === 0 ? (el) => { first.current = el; } : undefined} value={vals[f.key]} placeholder={f.placeholder}
                      onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />}
              </label>
            ))}
            <div className="row-btns">
              <button type="submit" ref={okRef} className={req.danger ? 'danger on' : 'on'} disabled={missing}>{req.ok ?? t('OK')}</button>
              <button type="button" onClick={() => close(null)}>{req.cancel ?? t('Annulla')}</button>
            </div>
          </form>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** Dialogo comune per registrare l'accettazione di un rischio. */
export async function askRisk(ask: Ask, what: string): Promise<Risk | null> {
  const r = await ask({
    title: t('Accettazione del rischio'),
    message: <>{t('Registro dei rischi accettati')} — <b>{what}</b>. {t('L’accettazione va motivata e firmata da chi ne ha l’autorità.')}</>,
    fields: [
      { key: 'text', label: t('Motivazione'), type: 'textarea', required: true },
      { key: 'by', label: t('Chi accetta il rischio (nome e ruolo)'), required: true },
      { key: 'date', label: t('Data'), value: new Date().toISOString().slice(0, 10) },
    ],
    ok: t('Registra'),
  });
  return r ? { text: r.text.trim(), by: r.by.trim(), date: r.date || new Date().toISOString().slice(0, 10) } : null;
}
