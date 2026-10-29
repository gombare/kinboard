// Medications: who takes what and at which times, with today's doses ticked off.
//
// Two sources:
//   { "homeassistant": "todo.medications" }  a Home Assistant to-do list (shared with automations and bots)
//   { "items": [{ "who", "name", "times": ["08:00"], "until": "2026-12-31" }] }  a fixed list in the config
//
// In the Home Assistant list each therapy is one open item:
//   summary      the medication, e.g. "Vitamin D"
//   description  "Who | 08:00 20:00" plus, once a dose is taken, " | taken:2026-10-29 08:00"
//   due          optional last day of the therapy
// The Italian "prese:" is accepted too, so lists written by Italian automations work as they are.
import { haApi } from './homeassistant.js';

const TIME = /^(\d{1,2})[:.](\d{2})$/;
const TAKEN = /^(?:taken|prese):(\d{4}-\d{2}-\d{2})((?:\s+\d{2}:\d{2})*)\s*$/;

function normTime(s) {
  const m = TIME.exec(String(s).trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}
const uniqSorted = list => [...new Set(list.filter(Boolean))].sort();

// "Giulia | 8:00 20.30 | prese:2026-10-29 08:00" → parts of a therapy.
export function parseDescription(text) {
  const [who = '', times = '', ...rest] = String(text || '').split('|').map(s => s.trim());
  let taken = { date: '', times: [] };
  for (const r of rest) {
    const m = TAKEN.exec(r);
    if (m) taken = { date: m[1], times: m[2].trim().split(/\s+/).filter(Boolean) };
  }
  return { who, times: uniqSorted(times.split(/[\s,;]+/).map(normTime)), taken };
}

export function formatDescription({ who, times, taken }, word = 'taken') {
  const base = `${who} | ${times.join(' ')}`;
  return taken?.date && taken.times.length ? `${base} | ${word}:${taken.date} ${taken.times.join(' ')}` : base;
}

export async function fetchMedications(cfg) {
  const m = cfg.medications;
  if (m.items) {
    return m.items.map((it, i) => ({
      id: `cfg${i}`, name: String(it.name || ''), who: String(it.who || ''),
      times: uniqSorted([].concat(it.times || []).map(normTime)), until: it.until || '', taken: { date: '', times: [] },
    })).filter(x => x.name && x.times.length);
  }
  const out = await haApi(cfg, '/api/services/todo/get_items?return_response', { method: 'POST', body: { entity_id: m.homeassistant, status: 'needs_action' } });
  const items = out?.service_response?.[m.homeassistant]?.items || [];
  return items.map(i => ({ id: i.uid, name: i.summary || '', until: (i.due || '').slice(0, 10), ...parseDescription(i.description) }))
    .filter(x => x.name && x.times.length);
}

// Today's doses in time order. "next" is the first dose not taken yet from now on;
// "late" marks an earlier dose of today nobody ticked off.
export function dosesFor(meds, today, nowHm) {
  const doses = [];
  for (const m of meds || []) {
    if (m.until && m.until < today) continue;
    const takenToday = m.taken.date === today ? m.taken.times : [];
    for (const time of m.times) doses.push({ id: m.id, name: m.name, who: m.who, time, taken: takenToday.includes(time), canTick: !String(m.id).startsWith('cfg') });
  }
  doses.sort((a, b) => a.time.localeCompare(b.time) || a.who.localeCompare(b.who) || a.name.localeCompare(b.name));
  let next = false;
  for (const d of doses) {
    d.late = !d.taken && d.time < nowHm;
    d.next = !next && !d.taken && d.time >= nowHm;
    if (d.next) next = true;
  }
  return doses;
}

// What fits on the screensaver: open doses first (late ones included), then taken ones, still in time order.
export function dosesForScreen(doses, max) {
  if (doses.length <= max) return doses;
  const keep = new Set(doses.filter(d => !d.taken).slice(0, max));
  for (const d of doses) if (keep.size < max && d.taken) keep.add(d);
  return doses.filter(d => keep.has(d));
}

export async function markDose(cfg, id, time, today) {
  const entity = cfg.medications?.homeassistant;
  if (!entity) throw new Error('medications: ticking doses needs a Home Assistant list');
  const out = await haApi(cfg, '/api/services/todo/get_items?return_response', { method: 'POST', body: { entity_id: entity, status: 'needs_action' } });
  const item = (out?.service_response?.[entity]?.items || []).find(i => i.uid === id);
  if (!item) throw new Error('medications: therapy not found');
  const p = parseDescription(item.description);
  if (!p.times.includes(time)) throw new Error('medications: unknown dose time');
  const word = /\|\s*prese:/.test(item.description || '') || cfg.language === 'it' ? 'prese' : 'taken';
  const prev = p.taken.date === today ? p.taken.times : [];
  p.taken = { date: today, times: uniqSorted([...prev, time]) };
  await haApi(cfg, '/api/services/todo/update_item', { method: 'POST', body: { entity_id: entity, item: id, description: formatDescription(p, word) } });
}
