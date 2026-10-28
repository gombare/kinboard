# Kinboard on the Kindle — edit these two lines.
KINBOARD_URL="https://your-kinboard.example.com"   # where your Kinboard server runs (no trailing slash)
TOKEN="change-me"                                  # the same value as KINBOARD_TOKEN on the server

INTERVAL=900        # seconds between screensaver refreshes (900 = 15 minutes)
OPEN_ON_UNLOCK=1    # 1 = open the interactive panel in the browser when the Kindle is unlocked
FULLSCREEN=0        # 1 = hide the Kindle status bar while the panel is open
EXIT_SECONDS=8      # lock and unlock within this many seconds to leave the panel
NIGHT_START=23      # no refreshes from this hour ...
NIGHT_END=6         # ... until this hour (leave NIGHT_START empty to refresh all night)
