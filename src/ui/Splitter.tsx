/* Divisore trascinabile tra due pannelli. Doppio clic: torna alla misura predefinita. */
import { useRef } from 'react';
import { t } from '../i18n';

export function Splitter({ dir, size, sign, min, max, onSize, onReset, className }: {
  dir: 'col' | 'row';                 // col = sposta in orizzontale (larghezza), row = in verticale (altezza)
  size: () => number;                 // misura attuale del pannello (px)
  sign: 1 | -1;                       // +1: trascinare a destra/in basso allarga; -1: allarga trascinando a sinistra/in alto
  min: number; max: () => number;
  onSize: (px: number) => void; onReset: () => void; className?: string;
}) {
  const drag = useRef<{ start: number; size: number } | null>(null);
  return (
    <div
      className={`splitter splitter-${dir}${className ? ` ${className}` : ''}`}
      role="separator" aria-orientation={dir === 'col' ? 'vertical' : 'horizontal'}
      title={t('Trascina per ridimensionare · doppio clic per la misura iniziale')}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { start: dir === 'col' ? e.clientX : e.clientY, size: size() };
        document.body.classList.add(dir === 'col' ? 'resizing-col' : 'resizing-row');
      }}
      onPointerMove={(e) => {
        const d = drag.current; if (!d) return;
        const delta = (dir === 'col' ? e.clientX : e.clientY) - d.start;
        onSize(Math.round(Math.min(max(), Math.max(min, d.size + sign * delta))));
      }}
      onPointerUp={(e) => {
        drag.current = null;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        document.body.classList.remove('resizing-col', 'resizing-row');
      }}
      onDoubleClick={onReset}
    />
  );
}
