/* Kinboard web panel. Plain ES5 + XMLHttpRequest: the Kindle browser is an old WebKit. */
(function () {
  'use strict';

  var REFRESH_MS = 5 * 60 * 1000;
  var data = null, view = 'home', token = '', skew = 0, pending = {};
  var S = {}; // UI strings sent by the server

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function deg(n) { return n === null || n === undefined ? '--' : Math.round(n) + '°'; }

  // ---- token: from ?token=… once, then remembered on the device ----
  function readToken() {
    var m = /[?&]token=([^&#]+)/.exec(location.search);
    if (m) {
      token = decodeURIComponent(m[1]);
      try { localStorage.setItem('kinboard-token', token); } catch (e) {}
      document.cookie = 'kinboard-token=' + encodeURIComponent(token) + '; max-age=31536000; path=/; SameSite=Strict' + (location.protocol === 'https:' ? '; Secure' : '');
      // Hide the token from the address bar so it does not end up in screenshots.
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
      return;
    }
    try { token = localStorage.getItem('kinboard-token') || ''; } catch (e) {}
    if (!token) { m = /(?:^|; )kinboard-token=([^;]+)/.exec(document.cookie); if (m) token = decodeURIComponent(m[1]); }
  }

  function request(method, url, body, done) {
    var x = new XMLHttpRequest();
    x.open(method, url, true);
    if (body) x.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      var json = null;
      try { json = JSON.parse(x.responseText); } catch (e) {}
      done(x.status, json);
    };
    x.send(body || null);
  }

  function load(fresh) {
    request('GET', '/api/data?token=' + encodeURIComponent(token) + (fresh ? '&fresh=1' : '') + '&_=' + Date.now(), null, function (status, json) {
      if (status === 200 && json && json.ok) {
        data = json; S = json.ui.strings; skew = json.now - Date.now();
        try { localStorage.setItem('kinboard-data', JSON.stringify(json)); } catch (e) {}
        render();
      } else if (status === 403) {
        message(S.badToken || 'Wrong token.');
      } else if (!data) {
        try { data = JSON.parse(localStorage.getItem('kinboard-data')); S = data.ui.strings; data.offline = true; render(); } catch (e) { message('Offline'); }
      } else { data.offline = true; render(); }
    });
  }

  function message(text) { $('content').innerHTML = '<div class="message">' + esc(text) + '</div>'; $('nav').style.display = 'none'; }

  // ---- time in the household's zone, computed from the server's offset ----
  function nowMs() { return Date.now() + skew; }
  function local(ms) {
    // The server sends "today"; the offset is derived from it to avoid relying on the Kindle's time zone.
    var d = new Date(ms + (data.tzOffset || 0));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), min: d.getUTCMinutes() };
  }
  function dayLabel(iso) {
    var p = iso.split('-'), wd = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
    if (iso === data.today) return S.today;
    if (iso === addDays(data.today, 1)) return S.tomorrow;
    return S.weekdaysShort[wd] + ' ' + (+p[2]);
  }
  function addDays(iso, n) { var p = iso.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().slice(0, 10); }

  function icon(name, size, color) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="' + (color || '#000') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (data.ui.icons[name] || '') + '</svg>';
    return '<img width="' + size + '" height="' + size + '" class="ic" src="data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '">';
  }
  var KIND = { 0: 'clear', 1: 'mainly_clear', 2: 'partly_cloudy', 3: 'overcast', 45: 'fog', 48: 'fog' };
  function kind(code) {
    if (KIND[code]) return KIND[code];
    if (code >= 51 && code <= 57) return 'drizzle';
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return code === 65 || code === 82 ? 'heavy_rain' : 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'thunderstorm';
    return 'overcast';
  }
  var KIND_ICON = { clear: 'sun', mainly_clear: 'sun', partly_cloudy: 'cloud-sun', overcast: 'cloud', fog: 'cloud-fog', drizzle: 'cloud-drizzle', rain: 'cloud-rain', heavy_rain: 'cloud-rain-wind', snow: 'cloud-snow', thunderstorm: 'cloud-lightning' };
  function wxIcon(code, size, night) {
    var name = KIND_ICON[kind(code)];
    if (night) name = name === 'sun' ? 'moon' : name === 'cloud-sun' ? 'cloud-moon' : name;
    return icon(name, size);
  }

  function eventHtml(e, noDay) {
    return '<div class="event"><div class="t">' + esc((e.calendar ? e.calendar + ' · ' : '') + e.title) + '</div>' +
      '<div class="w">' + esc((noDay ? '' : dayLabel(e.date) + ' · ') + (e.allDay ? S.allDay : e.time + '–' + e.endTime)) + (e.location ? ' · ' + esc(e.location) : '') + '</div></div>';
  }

  // Home rows grouped by day: a small day heading, then start time and title.
  // Compact rows (one line, smaller type) are used for later days when the full ones do not all fit.
  var homeDay = '';
  function homeEventHtml(e, compact) {
    var day = e.date < data.today ? data.today : e.date, h = '';
    if (day !== homeDay) { h += '<tr class="hday"><td colspan="2">' + esc(dayLabel(day).toUpperCase()) + '</td></tr>'; homeDay = day; }
    var cal = e.calendar ? '<span class="cal">' + esc(e.calendar) + '</span> ' : '';
    if (compact) return h + '<tr class="c"><td class="when">' + (e.allDay ? '' : esc(e.time)) + '</td><td><div class="t">' + cal + esc(e.title) + '</div></td></tr>';
    return h + '<tr><td class="when">' + (e.allDay ? '' : esc(e.time)) + '</td>' +
      '<td><div class="t">' + cal + esc(e.title) + '</div>' +
      (e.allDay || e.location ? '<div class="small muted">' + esc(e.allDay ? S.allDay : e.location) + '</div>' : '') + '</td></tr>';
  }

  // ---- views ----
  var VIEWS = {
    home: function () {
      var w = data.weather, p = local(nowMs()), h = '';
      // Header: time and date on the left, weather on the right.
      h += '<table class="head"><tr><td><div class="clock" id="clock">' + pad(p.h) + ':' + pad(p.min) + '</div>' +
        '<div class="date">' + esc(S.weekdays[p.wd] + ' ' + p.d + ' ' + S.months[p.m]) + '</div></td>';
      if (w) {
        var c = w.current, d0 = w.daily[0];
        h += '<td class="right" onclick="kinboard.go(\'weather\')"><table class="hwx"><tr><td>' + wxIcon(c.code, 56, !c.isDay) + '</td><td class="wx-temp">' + deg(c.temp) + '</td></tr></table>' +
          '<div class="wx-desc">' + esc(S.weather[kind(c.code)]) + '</div>' +
          '<div class="small">' + deg(d0.min) + ' / ' + deg(d0.max) + ' &nbsp;' + icon('droplet', 17) + ' ' + (d0.rain === null ? '--' : d0.rain) + '%</div></td>';
      }
      h += '</tr></table><div class="rule"></div>';
      // Reminders: one line each, same icon size as the section labels.
      if (data.waste) h += '<div class="alert inv">' + icon('trash', 24, '#fff') + ' ' + esc(data.waste.when === 'tonight' ? S.wasteTonight : S.wasteToday) + ' · <b>' + esc(data.waste.what) + '</b></div>';
      var meds = data.medications, open = [], show = [], upcoming = false;
      if (meds && data.views.indexOf('medications') >= 0) {
        for (var m = 0; m < meds.doses.length; m++) if (!meds.doses[m].taken) open.push(meds.doses[m]);
        // Every late dose first (they are the urgent ones), then the next one due; at most three rows.
        for (var n = 0; n < open.length && show.length < 3; n++) {
          if (open[n].late) show.push(open[n]);
          else if (!upcoming) { show.push(open[n]); upcoming = true; }
        }
        if (show.length) {
          h += '<table class="alert doses" onclick="kinboard.go(\'medications\')">';
          for (var k = 0; k < show.length; k++) {
            var nd = show[k], rest = k === show.length - 1 ? open.length - show.length : 0;
            h += '<tr><td class="di">' + icon('pill', 24) + '</td><td><b>' + esc(nd.time) + '</b> ' + esc((nd.who ? nd.who + ' · ' : '') + nd.name) +
              (nd.late ? ' <span class="tag">' + esc(S.late.toUpperCase()) + '</span>' : '') + (rest > 0 ? ' <span class="small muted">' + esc(S.more.replace('{n}', rest)) + '</span>' : '') + '</td></tr>';
          }
          h += '</table>';
        }
      }
      if (data.views.indexOf('agenda') >= 0) {
        h += '<div class="label" onclick="kinboard.go(\'agenda\')">' + icon('calendar', 20) + ' ' + esc(S.upcoming) + '</div><div id="home-events"></div>';
      }
      if (data.tasksEnabled && data.tasks && data.tasks.length) h += '<div id="home-tasks"></div>';
      var menu = data.menu && data.menu.today, foot = '';
      if (data.menu) {
        foot += '<td onclick="kinboard.go(\'menu\')"><div class="label">' + icon('utensils', 20) + ' ' + esc(S.menuToday) + '</div>';
        if (menu && menu.courses) for (var i = 0; i < menu.courses.length; i++) { if (menu.courses[i]) foot += '<div class="course">' + (data.menu.labels[i] ? '<span class="muted">' + esc(data.menu.labels[i]) + '</span> ' : '') + '<b>' + esc(menu.courses[i]) + '</b></div>'; }
        else foot += '<div>' + esc(menu && menu.note || S.noMenu) + '</div>';
        foot += '</td>';
      }
      if (data.tasksEnabled && data.tasks) foot += '<td class="right todo" onclick="kinboard.go(\'tasks\')"><div class="label">' + icon('list-checks', 20) + ' ' + esc(S.todo) + '</div><div class="count">' + data.tasks.length + '</div><div class="small">' + esc(plural(S.tasks, data.tasks.length)) + '</div></td>';
      if (foot) h += '<div id="home-foot"><div class="rule"></div><table class="foot"><tr>' + foot + '</tr></table></div>';
      return h;
    },
    weather: function () {
      var w = data.weather; if (!w) return '<div class="message">' + esc(S.weatherError) + '</div>';
      var c = w.current, d0 = w.daily[0], h = '';
      if (data.location.name) h += '<div class="label" style="margin-top:0">' + esc(data.location.name.toUpperCase()) + '</div>';
      h += '<table><tr><td style="width:130px">' + wxIcon(c.code, 120, !c.isDay) + '</td><td class="wx-big">' + deg(c.temp) + '</td><td class="right"><div class="wx-desc">' + esc(S.weather[kind(c.code)]) + '</div>' +
        '<div>' + esc(S.feels + ' ' + deg(c.feels)) + '</div><div>' + esc(S.min + ' ' + deg(d0.min) + ' · ' + S.max + ' ' + deg(d0.max)) + '</div></td></tr></table>';
      h += '<table class="cells thin"><tr><td>' + icon('droplet', 26) + '<br>' + (d0.rain === null ? '--' : d0.rain) + '%</td><td>' + icon('wind', 26) + '<br>' + Math.round(c.wind) + ' ' + esc(w.units.wind) + '</td>' +
        '<td><b>' + esc(S.humidity) + '</b><br>' + Math.round(c.humidity) + '%</td><td>' + icon('sunrise', 26) + '<br>' + esc(d0.sunrise) + '</td><td>' + icon('sunset', 26) + '<br>' + esc(d0.sunset) + '</td></tr></table>';
      h += '<div class="rule"></div><div class="label">' + esc(S.next24h) + '</div><table class="cells"><tr>';
      for (var i = 0; i < w.hourly.length && i < 24; i += 3) h += '<td><b>' + esc(w.hourly[i].time) + '</b><br>' + wxIcon(w.hourly[i].code, 34) + '<br>' + deg(w.hourly[i].temp) + '</td>';
      h += '</tr></table><div class="rule"></div><div class="label">' + esc(S.nextDays) + '</div><table>';
      for (var j = 1; j < w.daily.length; j++) {
        var d = w.daily[j];
        h += '<tr class="day-row"><td class="bold" style="width:30%">' + esc(dayLabel(d.date)) + '</td><td style="width:60px">' + wxIcon(d.code, 40) + '</td><td>' + esc(S.weather[kind(d.code)]) + '</td><td class="right">' + deg(d.min) + ' / <b>' + deg(d.max) + '</b></td></tr>';
      }
      return h + '</table>';
    },
    agenda: function () {
      if (!data.events.length) return '<div class="message">' + esc(data.calendarsOk ? S.noEvents : S.calendarError) + '</div>';
      var h = '', last = '';
      for (var i = 0; i < data.events.length; i++) {
        var e = data.events[i], day = e.date < data.today ? data.today : e.date;
        if (day !== last) { h += '<div class="day-head">' + esc(dayLabel(day).toUpperCase()) + '</div>'; last = day; }
        h += eventHtml(e, true);
      }
      return h;
    },
    tasks: function () {
      if (!data.tasks) return '<div class="message">' + esc(S.tasksDisabled) + '</div>';
      if (!data.tasks.length) return '<div class="message center">' + esc(S.noTasks) + '</div>';
      var h = '<div class="label" style="margin-top:0">' + esc(S.todo) + '</div><table>';
      for (var i = 0; i < data.tasks.length; i++) {
        var t = data.tasks[i], busy = pending[t.id];
        h += '<tr class="task' + (busy ? ' pending' : '') + '"><td class="check" onclick="kinboard.done(' + i + ')"><span class="box">' + (busy ? icon('check', 34) : '') + '</span></td>' +
          '<td>' + esc(t.title) + (t.due ? '<div class="small muted">' + esc(dayLabel(t.due)) + '</div>' : '') + (busy ? '<div class="small">' + esc(S.completing) + '</div>' : '') + '</td></tr>';
      }
      return h + '</table>';
    },
    medications: function () {
      var meds = data.medications;
      if (!meds) return '<div class="message">' + esc(S.medsError) + '</div>';
      var h = '<div class="label" style="margin-top:0">' + esc(S.medsToday) + '</div>';
      if (!meds.doses.length) h += '<div class="message">' + esc(data.medicationsOk ? S.noDoses : S.medsError) + '</div>';
      else {
        h += '<table>';
        for (var i = 0; i < meds.doses.length; i++) {
          var d = meds.doses[i], key = d.id + ' ' + d.time, busy = pending[key], tick = meds.canTick && d.canTick !== false && !d.taken && !busy;
          h += '<tr class="dose' + (d.next ? ' next' : '') + (d.taken ? ' taken' : '') + (busy ? ' pending' : '') + '">' +
            '<td class="check"' + (tick ? ' onclick="kinboard.dose(' + i + ')"' : '') + '><span class="box">' + (d.taken || busy ? icon('check', 34) : '') + '</span></td>' +
            '<td class="dose-time">' + esc(d.time) + '</td><td>' + esc(d.name) + '<div class="small">' + esc(d.who) +
            (d.late ? ' · <b>' + esc(S.late) + '</b>' : '') + (d.taken ? ' · ' + esc(S.taken) : '') + (busy ? ' · ' + esc(S.completing) : '') + '</div></td></tr>';
        }
        h += '</table>';
      }
      if (meds.therapies.length) {
        h += '<div class="label">' + esc(S.therapies) + '</div><table>';
        for (var j = 0; j < meds.therapies.length; j++) {
          var t = meds.therapies[j], end = t.until ? S.until + ' ' + (+t.until.slice(8, 10)) + '/' + t.until.slice(5, 7) : S.noEnd;
          h += '<tr class="therapy"><td><b>' + esc(t.name) + '</b> · ' + esc(t.who) + '<div class="small">' + esc(t.times.join(' · ') + ' — ' + end) + '</div></td></tr>';
        }
        h += '</table>';
      }
      return h;
    },
    menu: function () {
      if (!data.menu) return '<div class="message">' + esc(S.noMenu) + '</div>';
      var h = '<table class="menu">';
      for (var i = 0; i < data.menu.week.length; i++) {
        var d = data.menu.week[i], p = d.date.split('-'), wd = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(), body = '';
        if (d.courses) for (var k = 0; k < d.courses.length; k++) { if (d.courses[k]) body += '<div>' + (data.menu.labels[k] ? '<b>' + esc(data.menu.labels[k]) + ':</b> ' : '') + esc(d.courses[k]) + '</div>'; }
        else body = esc(d.note || '—');
        h += '<tr' + (d.date === data.today ? ' class="today"' : '') + '><td class="d">' + esc(S.weekdaysShort[wd].toUpperCase()) + ' ' + (+p[2]) + '</td><td>' + body + '</td></tr>';
      }
      return h + '</table>';
    },
  };

  function plural(v, n) { return typeof v === 'string' ? v : v[n === 1 ? 0 : 1]; }

  function render() {
    if (data.views.indexOf(view) < 0) view = 'home';
    var h = '';
    if (data.offline) h += '<div class="banner">' + esc(S.offline) + '</div>';
    $('content').innerHTML = h + VIEWS[view]();
    if (view === 'home') fitHome();
    var nav = '';
    for (var i = 0; i < data.views.length; i++) nav += '<td class="' + (data.views[i] === view ? 'active' : '') + '" onclick="kinboard.go(\'' + data.views[i] + '\')">' + esc(S.nav[data.views[i]]) + '</td>';
    $('nav-row').innerHTML = nav;
    $('nav').className = data.views.length > 5 ? 'many' : '';
    $('nav').style.display = data.views.length > 1 ? '' : 'none';
    $('content').style.bottom = data.views.length > 1 ? '74px' : '0';
  }

  // Fills the home screen to its height: as many events as fit (compacting later days if that shows more),
  // then, in whatever space is left, the first tasks instead of just their count.
  var HOME_MAX_EVENTS = 8;
  function fitHome() {
    var box = $('home-events'), tbox = $('home-tasks'), content = $('content'), foot = $('home-foot');
    function fits() {
      var last = tbox && tbox.innerHTML ? tbox : box || foot;
      return !last || last.offsetTop + last.offsetHeight + (foot ? foot.offsetHeight : 0) <= content.clientHeight - 8;
    }
    function table(rows) { return '<table class="hev">' + rows + '</table>'; }
    function fill(compact) {
      var html = '', shown = 0, day = '';
      for (var i = 0; i < data.events.length && i < HOME_MAX_EVENTS; i++) {
        var e = data.events[i];
        homeDay = day;
        var next = html + homeEventHtml(e, compact && e.date > data.today);
        box.innerHTML = table(next);
        if (!fits() && shown > 0) break;
        html = next; day = homeDay; shown++;
      }
      return { html: html, shown: shown };
    }
    if (box) {
      var want = Math.min(data.events.length, HOME_MAX_EVENTS), best = fill(false);
      if (best.shown < want) { var tight = fill(true); if (tight.shown > best.shown) best = tight; }
      box.innerHTML = best.shown ? table(best.html) : '<div class="muted">' + esc(data.calendarsOk ? S.noEvents : S.calendarError) + '</div>';
    }
    if (tbox) {
      var head = '<div class="label" onclick="kinboard.go(\'tasks\')">' + icon('list-checks', 20) + ' ' + esc(S.todo) + '</div>', rows = '', count = 0;
      for (var j = 0; j < data.tasks.length; j++) {
        var row = '<tr><td><span class="mini"></span> ' + esc(data.tasks[j].title) + '</td></tr>';
        tbox.innerHTML = head + '<table class="htask" onclick="kinboard.go(\'tasks\')">' + rows + row + '</table>';
        if (!fits()) break;
        rows += row; count++;
      }
      if (count && count < data.tasks.length) {
        // Make room for the "+N more" line if needed.
        while (count) {
          tbox.innerHTML = head + '<table class="htask" onclick="kinboard.go(\'tasks\')">' + rows + '<tr><td class="small muted">' + esc(S.more.replace('{n}', data.tasks.length - count)) + '</td></tr></table>';
          if (fits()) break;
          rows = rows.slice(0, rows.lastIndexOf('<tr>')); count--;
        }
      }
      if (count) {
        var col = foot && foot.getElementsByClassName ? foot.getElementsByClassName('todo')[0] : null;
        if (col) col.parentNode.removeChild(col); // the list replaces the counter
        if (foot && !foot.getElementsByTagName('td').length) { foot.parentNode.removeChild(foot); foot = null; }
      } else tbox.innerHTML = '';
    }
    if (foot) { foot.style.position = 'absolute'; foot.style.left = '18px'; foot.style.right = '18px'; foot.style.bottom = '6px'; }
  }

  function tick() {
    var el = $('clock'); if (!el || !data) return;
    var p = local(nowMs()), text = pad(p.h) + ':' + pad(p.min);
    if (el.innerHTML !== text) { if (p.h === 0 && p.min === 0) load(); else el.innerHTML = text; }
  }

  window.kinboard = {
    go: function (v) { view = v; render(); },
    done: function (i) {
      var t = data.tasks[i]; if (!t || pending[t.id]) return;
      pending[t.id] = true; render();
      request('POST', '/api/task', 'token=' + encodeURIComponent(token) + '&id=' + encodeURIComponent(t.id), function (status, json) {
        delete pending[t.id];
        if (status === 200 && json && json.ok) load(true);
        else { render(); alertBanner(S.taskError); }
      });
    },
  };
  window.kinboard.dose = function (i) {
    var d = data.medications && data.medications.doses[i]; if (!d) return;
    var key = d.id + ' ' + d.time; if (pending[key] || d.taken) return;
    pending[key] = true; render();
    request('POST', '/api/dose', 'token=' + encodeURIComponent(token) + '&id=' + encodeURIComponent(d.id) + '&time=' + encodeURIComponent(d.time), function (status, json) {
      delete pending[key];
      if (status === 200 && json && json.ok) load(true);
      else { render(); alertBanner(S.doseError); }
    });
  };
  function alertBanner(text) { var c = $('content'); c.innerHTML = '<div class="banner">' + esc(text) + '</div>' + c.innerHTML; }

  readToken();
  if (!token) { message('Kinboard: ' + 'Open this page once with ?token=YOUR_TOKEN at the end of the address.'); return; }
  load();
  setInterval(load, REFRESH_MS);
  setInterval(tick, 15000);
})();
