#!/bin/sh
# Kinboard screensaver: while the Kindle sleeps it shows the dashboard image and refreshes it every INTERVAL seconds.
# Started by documents/kinboard-start.sh, stopped by documents/kinboard-stop.sh.
DIR=/mnt/us/kinboard
. $DIR/config.sh
IMG=$DIR/screen.png
TMP=/tmp/kinboard-screen.png
LOG=$DIR/log.txt
PIDFILE=/tmp/kinboard-watcher.pid
SCREEN_URL="${KINBOARD_URL%/}/api/screen?token=${TOKEN}"
PANEL_URL="${KINBOARD_URL%/}/?token=${TOKEN}"

log() { echo "$(date '+%d/%m %H:%M:%S') $*" >> $LOG; }
# Keep the log small.
[ -f $LOG ] && [ $(wc -c < $LOG) -gt 100000 ] && tail -n 200 $LOG > $LOG.tmp && mv $LOG.tmp $LOG

locked() {
  # Draw only while the Kindle is still on the screensaver, never over the unlocked screen.
  STATE=$(lipc-get-prop com.lab126.powerd state 2>/dev/null)
  [ "$STATE" != "active" ]
}
draw() {
  if ! locked; then log "state $STATE: not drawing"; return 1; fi
  [ -s $IMG ] && eips -f -g $IMG >/dev/null 2>&1
}
update() {
  # One refresh at a time, in the background.
  mkdir /tmp/kinboard-refresh.lock 2>/dev/null || return 0
  refresh && draw
  rmdir /tmp/kinboard-refresh.lock
}

bars() {
  # Shows/hides the Kindle status bar (pillow).
  if [ "$1" = "off" ]; then lipc-set-prop com.lab126.pillow disableEnablePillow disable 2>/dev/null
  else lipc-set-prop com.lab126.pillow disableEnablePillow enable 2>/dev/null; fi
}

wifi_up() {
  # After deep sleep Wi-Fi sometimes does not reconnect by itself: ask powerd for a little
  # more time before suspending again and restart Wi-Fi if needed.
  lipc-set-prop -i com.lab126.powerd deferSuspend 90 2>/dev/null
  lipc-set-prop com.lab126.cmd wirelessEnable 1 2>/dev/null
  i=0; S=""
  while [ $i -lt 60 ]; do
    S=$(lipc-get-prop com.lab126.wifid cmState 2>/dev/null)
    [ "$S" = "CONNECTED" ] && return 0
    if [ $i -eq 20 ] || [ $i -eq 40 ]; then
      log "wifi state $S: restarting wifi"
      lipc-set-prop com.lab126.wifid enable 0 2>/dev/null; sleep 2
      lipc-set-prop com.lab126.wifid enable 1 2>/dev/null
    fi
    sleep 1; i=$((i+1))
  done
  log "wifi not connected (state $S)"
  return 1
}

hour() { H=$(date +%H | sed 's/^0//'); echo ${H:-0}; }
is_night() {
  # Night is NIGHT_START (included) to NIGHT_END (excluded).
  [ -z "$NIGHT_START" ] && return 1
  H=$(hour)
  if [ $NIGHT_START -gt $NIGHT_END ]; then [ $H -ge $NIGHT_START ] || [ $H -lt $NIGHT_END ]
  else [ $H -ge $NIGHT_START ] && [ $H -lt $NIGHT_END ]; fi
}
secs_to_morning() {
  H=$(hour); M=$(date +%M | sed 's/^0//'); S=$(date +%S | sed 's/^0//')
  echo $(( ((NIGHT_END - H + 24) % 24) * 3600 - ${M:-0} * 60 - ${S:-0} ))
}

next_wait() {
  W=$INTERVAL
  if is_night; then W=$(secs_to_morning); [ $W -lt 60 ] && W=$INTERVAL; fi
  echo $W
}
set_alarm() {
  # Wake-up alarm: through powerd first, then directly on the hardware clock as a fallback.
  OK=""
  lipc-set-prop -i com.lab126.powerd rtcWakeup $1 2>/dev/null && OK="powerd"
  for R in /sys/class/rtc/rtc1 /sys/class/rtc/rtc0; do
    [ -w $R/wakealarm ] || continue
    CUR=$(cat $R/wakealarm 2>/dev/null)
    # Never replace a system alarm that is due sooner.
    if [ -z "$CUR" ] || [ $CUR -gt $(( $(cat $R/since_epoch) + $1 )) ]; then
      echo 0 > $R/wakealarm 2>/dev/null; echo +$1 > $R/wakealarm 2>/dev/null && OK="$OK ${R##*/}"
    fi
    break
  done
  [ -n "$OK" ] && log "wake-up in ${1}s ($OK)" || log "wake-up NOT set"
}

refresh() {
  if is_night; then log "night: no refresh"; return 1; fi
  if ! wifi_up; then return 1; fi
  B=$(lipc-get-prop com.lab126.powerd battLevel 2>/dev/null); C=$(lipc-get-prop com.lab126.powerd isCharging 2>/dev/null)
  if curl -s -f -m 45 -o $TMP "${SCREEN_URL}&battery=${B:-}&charging=${C:-0}" && [ "$(head -c 4 $TMP | tail -c 3)" = "PNG" ]; then
    mv $TMP $IMG; log "image updated (battery ${B:-?}%)"
  else
    log "download failed"; rm -f $TMP; return 1
  fi
}

echo $$ > $PIDFILE
rmdir /tmp/kinboard-refresh.lock 2>/dev/null
log "start (every ${INTERVAL}s)"
lipc-set-prop com.lab126.powerd preventScreenSaver 0 2>/dev/null

lipc-wait-event -m com.lab126.powerd goingToScreenSaver,outOfScreenSaver,readyToSuspend,wakeupFromSuspend | while read ev rest; do
  case "$ev" in
    goingToScreenSaver)
      # Kindle bars stay visible outside the panel; remember when the device was locked.
      bars on; date +%s > /tmp/kinboard-locked-at
      # The Kindle draws its own screensaver: cover it with the dashboard, then refresh.
      ( sleep 2; draw; update ) & ;;
    readyToSuspend)
      # The moment powerd accepts a wake-up alarm.
      WAIT=$(next_wait)
      set_alarm $WAIT ;;
    wakeupFromSuspend)
      log "woke up"
      # Set the next alarm right away: after a wake-up the Kindle may go back to sleep without readyToSuspend.
      set_alarm $(next_wait)
      update & ;;
    outOfScreenSaver)
      NOW=$(date +%s); LOCKED_AT=$(cat /tmp/kinboard-locked-at 2>/dev/null || echo 0)
      if [ $((NOW - LOCKED_AT)) -lt $EXIT_SECONDS ]; then
        # Lock and unlock quickly = leave the panel and use the Kindle normally.
        log "panel closed"; bars on
      elif [ "$OPEN_ON_UNLOCK" = "1" ]; then
        log "unlocked"
        sleep 2
        APP=$(lipc-get-prop com.lab126.appmgrd activeApp 2>/dev/null)
        # If the browser with the panel is already open, do nothing.
        case "$APP" in
          *browser*) ;;
          *) lipc-set-prop com.lab126.appmgrd start "app://com.lab126.browser?view=$PANEL_URL" 2>/dev/null; sleep 3 ;;
        esac
        [ "$FULLSCREEN" = "1" ] && case "$(lipc-get-prop com.lab126.appmgrd activeApp 2>/dev/null)" in *browser*) bars off ;; esac
      fi ;;
  esac
done
