/**
 * Kinboard — Google bridge (Apps Script).
 *
 * Runs inside YOUR Google account and gives the Kinboard server read access to
 * the calendars listed below, your contacts' birthdays and one Google Tasks list
 * (which can also be ticked off from the Kindle). Every request must carry the
 * secret key created by setup().
 *
 * Setup (see README):
 *   1. Paste this file into a new project at https://script.google.com
 *   2. Services (+): add "Google Tasks API" (and "Google Calendar API" for birthdays)
 *   3. Edit CALENDARS / TASK_LIST below, then run setup() and copy the key from the log
 *   4. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone
 *   5. Put the /exec URL and the key in the Kinboard config (google.url, google.key)
 */

// Calendars to show. id: 'primary' for your main calendar, or the calendar ID
// (Google Calendar → Settings → the calendar → Integrate calendar → Calendar ID).
// label: short prefix shown before each event ('' for none).
// Use [] if your calendars already reach Kinboard through iCal links and you only want birthdays/tasks here.
var CALENDARS = [
  { id: 'primary', label: '' }
  // , { id: 'xxxxxxxx@group.calendar.google.com', label: 'FAM' }
];

// Show your contacts' birthdays (needs the "Google Calendar API" advanced service).
var BIRTHDAYS = true;

// Google Tasks list to show. It is created by setup() if missing. '' disables tasks.
var TASK_LIST = 'Kinboard';

var MAX_DAYS = 31;

/** Run once from the editor (and again after changing the settings above). */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('KINBOARD_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperty('KINBOARD_KEY', key);
  }
  CALENDARS.forEach(function (c) {
    if (!calendarFor_(c.id)) throw new Error('Calendar not found: ' + c.id);
  });
  if (TASK_LIST) props.setProperty('KINBOARD_TASKLIST', taskListId_(true));
  var now = Date.now(), data = read_(now, now + 7 * 86400000);
  console.log('Kinboard is ready. Events in the next 7 days: ' + data.events.length + ', open tasks: ' + (data.tasks ? data.tasks.length : 'disabled'));
  console.log('KEY (put it in google.key): ' + key);
}

/** Creates a new key; the old one stops working. */
function rotateKey() {
  PropertiesService.getScriptProperties().deleteProperty('KINBOARD_KEY');
  setup();
}

function doGet(e) {
  return respond_(function (p) {
    if (p.action !== 'read') throw new Error('unknown action');
    var from = Number(p.from) || Date.now(), to = Number(p.to) || from + 7 * 86400000;
    to = Math.min(to, from + MAX_DAYS * 86400000);
    return read_(from, to);
  }, e);
}

function doPost(e) {
  return respond_(function (p) {
    if (p.action !== 'complete' || !p.task || String(p.task).length > 200) throw new Error('bad request');
    var listId = taskListId_(false);
    if (!listId) throw new Error('tasks are disabled');
    Tasks.Tasks.patch({ status: 'completed' }, listId, String(p.task));
    return {};
  }, e);
}

function respond_(fn, e) {
  var p = (e && e.parameter) || {}, out;
  try {
    var key = PropertiesService.getScriptProperties().getProperty('KINBOARD_KEY');
    if (!key || !sameKey_(String(p.key || ''), key)) throw new Error('bad key');
    out = fn(p);
    out.ok = true;
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err).slice(0, 200) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function sameKey_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function calendarFor_(id) {
  return id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(id);
}

function read_(from, to) {
  var zone = Session.getScriptTimeZone(), start = new Date(from), end = new Date(to);
  var events = [], seen = {};
  CALENDARS.forEach(function (c) {
    var cal = calendarFor_(c.id);
    if (!cal) return;
    cal.getEvents(start, end).forEach(function (ev) {
      var k = ev.getId() + '|' + ev.getStartTime().getTime();
      if (seen[k]) return;
      seen[k] = true;
      var item = { id: k, title: ev.getTitle(), calendar: c.label || '', location: ev.getLocation() || '', allDay: ev.isAllDayEvent() };
      if (item.allDay) {
        item.startDate = Utilities.formatDate(ev.getAllDayStartDate(), zone, 'yyyy-MM-dd');
        item.endDate = Utilities.formatDate(ev.getAllDayEndDate(), zone, 'yyyy-MM-dd');
      } else {
        item.start = ev.getStartTime().getTime();
        item.end = ev.getEndTime().getTime();
      }
      events.push(item);
    });
  });
  if (BIRTHDAYS) {
    try {
      // Birthdays live in the primary calendar as "birthday" events, only visible through the Calendar API.
      var res = Calendar.Events.list('primary', { timeMin: start.toISOString(), timeMax: end.toISOString(), eventTypes: ['birthday'], singleEvents: true, maxResults: 100 });
      (res.items || []).forEach(function (b) {
        if (!b.start || !b.start.date || seen['bday|' + b.id]) return;
        seen['bday|' + b.id] = true;
        events.push({ id: 'bday|' + b.id, title: b.summary || '', calendar: '', location: '', allDay: true, startDate: b.start.date, endDate: b.end.date });
      });
    } catch (err) {
      console.log('Birthdays unavailable (add the Google Calendar API service): ' + err.message);
    }
  }
  return { events: events, tasks: TASK_LIST ? readTasks_() : null, taskList: TASK_LIST };
}

function readTasks_() {
  var listId = taskListId_(false), tasks = [], token;
  if (!listId) return [];
  do {
    var page = Tasks.Tasks.list(listId, { showCompleted: false, showHidden: false, maxResults: 100, pageToken: token });
    (page.items || []).forEach(function (t) {
      if (t.status === 'completed' || t.deleted || !t.title) return;
      tasks.push({ id: t.id, title: t.title, notes: t.notes || '', due: t.due ? t.due.slice(0, 10) : '', position: t.position || '' });
    });
    token = page.nextPageToken;
  } while (token);
  tasks.sort(function (a, b) {
    if (a.due !== b.due) return !a.due ? 1 : !b.due ? -1 : a.due < b.due ? -1 : 1;
    return a.position < b.position ? -1 : 1;
  });
  return tasks;
}

function taskListId_(create) {
  if (!TASK_LIST) return '';
  var cached = PropertiesService.getScriptProperties().getProperty('KINBOARD_TASKLIST');
  if (cached && !create) return cached;
  var lists = [], token;
  do {
    var page = Tasks.Tasklists.list({ maxResults: 100, pageToken: token });
    lists = lists.concat(page.items || []);
    token = page.nextPageToken;
  } while (token);
  var match = lists.filter(function (l) { return l.title === TASK_LIST; })[0];
  if (!match && create) match = Tasks.Tasklists.insert({ title: TASK_LIST });
  return match ? match.id : '';
}
