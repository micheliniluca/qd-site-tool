/* Caricamento del disegno di sfondo: immagine (PNG/JPG/…) o PDF (una pagina, rasterizzata con pdf.js). */
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Background } from '../site/model';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_PX = 6000;

function readAsDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}
function imageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
    i.onerror = () => rej(new Error('Immagine non leggibile'));
    i.src = url;
  });
}

export async function pdfPageCount(f: File): Promise<number> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
  const n = doc.numPages;
  await doc.destroy();
  return n;
}

async function renderPdf(f: File, pageNo: number): Promise<{ url: string; w: number; h: number }> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
  try {
    const page = await doc.getPage(pageNo);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(4, MAX_PX / Math.max(base.width, base.height));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return { url: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
  } finally {
    await doc.destroy();
  }
}

/** Carica il file e lo posiziona centrato su `center`, largo `widthM` metri (da calibrare poi su 2 punti). */
export async function loadBackground(f: File, center: { x: number; y: number }, widthM: number, pdfPage = 1): Promise<Background> {
  let url: string, w: number, h: number;
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) ({ url, w, h } = await renderPdf(f, pdfPage));
  else { url = await readAsDataUrl(f); ({ w, h } = await imageSize(url)); }
  const mPerPx = widthM / w;
  return {
    dataUrl: url, name: f.name + (pdfPage > 1 ? ` (pag. ${pdfPage})` : ''), pxW: w, pxH: h,
    x: center.x - (w * mPerPx) / 2, y: center.y + (h * mPerPx) / 2, mPerPx, opacity: 0.6, locked: true,
  };
}

export { calibrate } from '../site/calibrate';
