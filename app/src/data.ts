import type { SubjectData, SubjectMeta } from './types';

let metaP: Promise<SubjectMeta[]> | null = null;
export function loadMeta(): Promise<SubjectMeta[]> {
  return metaP || (metaP = fetch('/data/index.json').then(r => r.json()));
}
const subj: Record<string, Promise<SubjectData>> = {};
export const loaded: Record<string, SubjectData> = {};
export function loadSubject(id: string): Promise<SubjectData> {
  return subj[id] || (subj[id] = fetch('/data/' + id + '.json').then(r => r.json()).then((d: SubjectData) => (loaded[id] = d)));
}
export async function loadSubjects(ids: string[]) {
  const all = await Promise.all(ids.map(loadSubject));
  const map: Record<string, SubjectData> = {};
  for (const d of all) map[d.id] = d;
  return map;
}
