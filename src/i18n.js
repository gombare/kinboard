// UI strings shared by the screensaver image and the web panel (sent in /api/data).
// To add a language, copy the "en" block and translate it.
export const STRINGS = {
  en: {
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    weekdaysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    weather: {
      clear: 'Clear', mainly_clear: 'Mostly clear', partly_cloudy: 'Partly cloudy', overcast: 'Cloudy', fog: 'Fog',
      drizzle: 'Drizzle', rain: 'Rain', heavy_rain: 'Heavy rain', snow: 'Snow', thunderstorm: 'Thunderstorm',
    },
    today: 'Today', tomorrow: 'Tomorrow', allDay: 'all day',
    upcoming: 'UPCOMING', menuToday: "TODAY'S MENU", todo: 'TO DO', tasks: n => (n === 1 ? 'task' : 'tasks'),
    updated: 'updated', unlockHint: 'Unlock for the full panel',
    lowBattery: n => `BATTERY ${n}% · PLEASE CHARGE`,
    wasteTonight: 'PUT OUT TONIGHT', wasteToday: "TODAY'S COLLECTION",
    noEvents: 'Nothing planned in the next days', calendarError: 'Calendar unavailable', weatherError: 'Weather unavailable',
    noMenu: 'No menu', feels: 'Feels like', humidity: 'Humidity', rain: 'Rain', wind: 'Wind', min: 'Min', max: 'Max',
    sunrise: 'Sunrise', sunset: 'Sunset', next24h: 'NEXT HOURS', nextDays: 'NEXT DAYS',
    nav: { home: 'HOME', weather: 'WEATHER', agenda: 'AGENDA', tasks: 'TO DO', medications: 'MEDS', menu: 'MENU' },
    medsToday: "TODAY'S MEDICATION", noDoses: 'No medication today', medsError: 'Medication list unavailable',
    nextDose: 'Next', late: 'late', taken: 'taken', therapies: 'ONGOING', until: 'until', noEnd: 'no end date',
    doseError: 'Could not save the dose',
    noTasks: 'Nothing to do. Enjoy!', done: 'Done', completing: 'Saving…', taskError: 'Could not complete the task',
    tasksDisabled: 'Connect the Google script to see your tasks.', more: n => `+${n} more`,
    week: 'Week', offline: 'Offline — showing the last data', loading: 'Loading…',
    needToken: 'Open this page once with ?token=YOUR_TOKEN at the end of the address.', badToken: 'Wrong token.',
  },
  it: {
    weekdays: ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'],
    weekdaysShort: ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'],
    months: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
    weather: {
      clear: 'Sereno', mainly_clear: 'Poco nuvoloso', partly_cloudy: 'Parz. nuvoloso', overcast: 'Nuvoloso', fog: 'Nebbia',
      drizzle: 'Pioviggine', rain: 'Pioggia', heavy_rain: 'Pioggia forte', snow: 'Neve', thunderstorm: 'Temporale',
    },
    today: 'Oggi', tomorrow: 'Domani', allDay: 'tutto il giorno',
    upcoming: 'PROSSIMI APPUNTAMENTI', menuToday: 'MENÙ DI OGGI', todo: 'DA FARE', tasks: () => 'attività',
    updated: 'aggiornato', unlockHint: 'Sblocca per il pannello completo',
    lowBattery: n => `BATTERIA ${n}% · METTILO IN CARICA`,
    wasteTonight: 'STASERA FUORI', wasteToday: 'RACCOLTA DI OGGI',
    noEvents: 'Nessun appuntamento nei prossimi giorni', calendarError: 'Calendario non raggiungibile', weatherError: 'Meteo non disponibile',
    noMenu: 'Nessun menù', feels: 'Percepita', humidity: 'Umidità', rain: 'Pioggia', wind: 'Vento', min: 'Min', max: 'Max',
    sunrise: 'Alba', sunset: 'Tramonto', next24h: 'PROSSIME ORE', nextDays: 'PROSSIMI GIORNI',
    nav: { home: 'OGGI', weather: 'METEO', agenda: 'AGENDA', tasks: 'DA FARE', medications: 'FARMACI', menu: 'MENÙ' },
    medsToday: 'FARMACI DI OGGI', noDoses: 'Nessun farmaco oggi', medsError: 'Lista farmaci non raggiungibile',
    nextDose: 'Prossimo', late: 'in ritardo', taken: 'presa', therapies: 'IN CORSO', until: 'fino al', noEnd: 'senza scadenza',
    doseError: 'Impossibile segnare la dose',
    noTasks: 'Niente da fare. Goditela!', done: 'Fatto', completing: 'Salvataggio…', taskError: 'Impossibile completare l’attività',
    tasksDisabled: 'Collega lo script Google per vedere le attività.', more: n => `altri ${n}`,
    week: 'Settimana', offline: 'Offline — dati dell’ultimo aggiornamento', loading: 'Caricamento…',
    needToken: 'Apri questa pagina una volta aggiungendo ?token=IL_TUO_TOKEN alla fine dell’indirizzo.', badToken: 'Token errato.',
  },
};

export function strings(lang) {
  return STRINGS[lang] || STRINGS[(lang || '').slice(0, 2)] || STRINGS.en;
}

// Plain-data version for the browser: functions become small templates.
export function clientStrings(lang) {
  const s = strings(lang), out = {};
  for (const [k, v] of Object.entries(s)) {
    if (typeof v !== 'function') { out[k] = v; continue; }
    out[k] = v(1) === v(2) ? v(1) : [v(1), v(2)];
    if (k === 'more' || k === 'lowBattery') out[k] = v('{n}');
  }
  return out;
}
