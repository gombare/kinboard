#!/bin/sh
# Name: Kinboard - stop
# Author: Kinboard
if [ -f /tmp/kinboard-watcher.pid ]; then
  P=$(cat /tmp/kinboard-watcher.pid)
  pkill -P $P 2>/dev/null; kill $P 2>/dev/null
  pkill -f "lipc-wait-event -m com.lab126.powerd" 2>/dev/null
  rm -f /tmp/kinboard-watcher.pid
fi
lipc-set-prop com.lab126.pillow disableEnablePillow enable 2>/dev/null
echo "Kinboard stopped. The normal Kindle screensaver is back."
