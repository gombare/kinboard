// To-do providers: "google" (Google Tasks via the Apps Script), "todoist", "homeassistant".
import { completeGoogleTask } from './google.js';
import { completeHaTodo, fetchHaTodo } from './homeassistant.js';
import { completeTodoist, fetchTodoist } from './todoist.js';

// Google tasks arrive together with the Google calendars, so they are not fetched here.
export function fetchTasks(cfg) {
  switch (cfg.tasks?.provider) {
    case 'todoist': return fetchTodoist(cfg);
    case 'homeassistant': return fetchHaTodo(cfg);
    default: return Promise.resolve(null);
  }
}

export async function completeTask(cfg, id) {
  switch (cfg.tasks?.provider) {
    case 'google': return completeGoogleTask(cfg, id);
    case 'todoist': return completeTodoist(cfg, id);
    case 'homeassistant': return completeHaTodo(cfg, id);
    default: throw new Error('No to-do provider is configured');
  }
}
