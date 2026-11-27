/* Sito di esempio (fittizio) per provare l'applicazione. */
import { t } from '../i18n';
import { emptyProject, newItem, PRESETS, type Line, type Magazine, type Project, type SiteObject } from '../site/model';

const mk = (id: string, x: number, y: number, name: string, patch: Record<string, unknown> = {}): SiteObject =>
  ({ ...PRESETS.find((p) => p.id === id)!.make({ x, y }, name), ...patch } as SiteObject);

export function demoProject(): Project {
  const p = emptyProject();
  p.name = t('Sito di esempio (fittizio)');
  p.objects = [
    mk('ecm7', 0, 0, 'M1', { neq: 20000 } as Partial<Magazine>),
    mk('ecm7', 22, 0, 'M2', { neq: 20000 } as Partial<Magazine>),
    mk('ecm7', 80, 0, 'M3', { contentMode: 'inventory', items: [
      newItem({ descr: t('Colpi 40 mm'), hd: '1.2.1', cg: 'E', qty: 20000, neqUnit: 0.12, mce: 12 }),
      newItem({ descr: t('Cariche di lancio'), hd: '1.3.1', cg: 'C', qty: 300, neqUnit: 10 }),
      newItem({ descr: t('Cartucce 5,56'), hd: '1.4', cg: 'S', qty: 100000, neqUnit: 0.0016 }),
    ] } as Partial<Magazine>),
    mk('ecm3', 20, 200, 'M4', { neq: 10000, az: 180 } as Partial<Magazine>),
    mk('heavyd', 330, -60, 'H1', { neq: 4000, az: 90 } as Partial<Magazine>),
    mk('stack', -170, 60, 'C1', { neq: 2000, hd: '1.2.2' } as Partial<Magazine>),
    mk('med', -160, -90, 'P1', { neq: 0 } as Partial<Magazine>),
    mk('offb', 160, 210, t('Uffici deposito')),
    mk('ws18', -60, 230, t('Officina')),
    mk('ibd', 760, 420, t('Cascina')),
    mk('vuln', -900, 250, t('Scuola')),
    { ...(mk('r22', 0, 0, 'SP 12') as Line), pts: [{ x: -1100, y: -520 }, { x: -200, y: -470 }, { x: 600, y: -560 }, { x: 1200, y: -420 }] },
    { ...(mk('p27b', 0, 0, t('Linea MT')) as Line), pts: [{ x: 700, y: -500 }, { x: 650, y: 900 }] },
    { ...(mk('fence', 0, 0, t('Recinzione')) as Line), pts: [{ x: -330, y: -230 }, { x: 420, y: -230 }, { x: 420, y: 330 }, { x: -330, y: 330 }, { x: -330, y: -230 }] },
  ];
  return p;
}
