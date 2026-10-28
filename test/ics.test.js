import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIcs } from '../src/sources/ics.js';

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:Europe/Rome
BEGIN:STANDARD
DTSTART:19701025T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700329T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:gym
SUMMARY:Gym
DTSTART;TZID=Europe/Rome:20261020T180000
DTEND;TZID=Europe/Rome:20261020T190000
RRULE:FREQ=WEEKLY
END:VEVENT
BEGIN:VEVENT
UID:gym
RECURRENCE-ID;TZID=Europe/Rome:20261103T180000
SUMMARY:Gym (moved)
DTSTART;TZID=Europe/Rome:20261103T200000
DTEND;TZID=Europe/Rome:20261103T210000
END:VEVENT
BEGIN:VEVENT
UID:bday
SUMMARY:Birthday
DTSTART;VALUE=DATE:20261029
DTEND;VALUE=DATE:20261030
END:VEVENT
BEGIN:VEVENT
UID:utc
SUMMARY:Call
DTSTART:20261028T170000Z
DTEND:20261028T173000Z
END:VEVENT
END:VCALENDAR`;

test('expands recurrences, exceptions, all-day and UTC events in local time', () => {
  const from = Date.parse('2026-10-26T00:00:00Z'), to = Date.parse('2026-11-08T00:00:00Z');
  const ev = parseIcs(ICS, { label: 'M', from, to, tz: 'Europe/Rome' }).sort((a, b) => a.start - b.start);
  const view = ev.map(e => `${e.date} ${e.time || 'all-day'} ${e.title}`);
  assert.deepEqual(view, [
    '2026-10-27 18:00 Gym',
    '2026-10-28 18:00 Call',
    '2026-10-29 all-day Birthday',
    '2026-11-03 20:00 Gym (moved)',
  ]);
  assert.equal(ev[0].calendar, 'M');
});
