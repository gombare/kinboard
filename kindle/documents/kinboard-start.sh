#!/bin/sh
# Name: Kinboard - start
# Author: Kinboard
DIR=/mnt/us/kinboard
if [ -f /tmp/kinboard-watcher.pid ] && kill -0 $(cat /tmp/kinboard-watcher.pid) 2>/dev/null; then
  echo "Kinboard is already running."; exit 0
fi
lipc-set-prop com.lab126.powerd preventScreenSaver 0
nohup sh $DIR/watcher.sh >/dev/null 2>&1 &
echo "Kinboard started. Lock the Kindle (power button) to see the dashboard."
