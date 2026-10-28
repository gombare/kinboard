// Todoist (API v1). Needs a personal API token (Settings → Integrations → Developer).
const BASE = 'https://api.todoist.com/api/v1';

async function td(cfg, path, method = 'GET') {
  const res = await fetch(`${BASE}${path}`, { method, signal: AbortSignal.timeout(15000), headers: { authorization: `Bearer ${cfg.tasks.token}` } });
  if (!res.ok) throw new Error(`todoist: HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

export async function fetchTodoist(cfg) {
  // Any Todoist filter works, e.g. "today | overdue" or "#Home".
  const query = cfg.tasks.filter || 'today | overdue';
  const tasks = [];
  let cursor = null, pages = 0;
  do {
    const q = new URLSearchParams({ query, limit: '100', ...(cursor ? { cursor } : {}) });
    const page = await td(cfg, `/tasks/filter?${q}`);
    tasks.push(...(page.results || []));
    cursor = page.next_cursor;
  } while (cursor && ++pages < 5);
  return tasks.map(t => ({ id: String(t.id), title: t.content || '', notes: t.description || '', due: t.due?.date ? String(t.due.date).slice(0, 10) : '' }));
}

export async function completeTodoist(cfg, id) {
  await td(cfg, `/tasks/${encodeURIComponent(id)}/close`, 'POST');
}
