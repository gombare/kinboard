# Kinboard

Runs the [Kinboard](https://github.com/gombare/kinboard) server inside Home Assistant, so the Kindle reaches it on your home network and Kinboard reads calendars, to-do lists and medications straight from Home Assistant.

## Setup

1. **Token.** Set a long random secret, for example the output of `openssl rand -hex 16`. The Kindle sends it with every request: put the same value in `kinboard/config.sh` on the Kindle.
2. **Google key** (optional). If the configuration uses the Google bridge, put its key here instead of in the configuration.
3. **Configuration.** Paste the Kinboard configuration as JSON in the *Configuration* option, or leave it empty and put a `kinboard.config.json` file in the app's config folder (`/addon_configs/<id>_kinboard`). The keys are the same as in the [Kinboard README](https://github.com/gombare/kinboard#2-configure). There is no need to add a `homeassistant` block: the app connects to this Home Assistant by itself.
4. **Start** the app and open `http://<home-assistant-ip>:8080/?token=<your token>` to check the panel.
5. **Kindle.** In `kinboard/config.sh` set `KINBOARD_URL="http://<home-assistant-ip>:8080"`. Give Home Assistant a fixed IP address (a DHCP reservation on the router), or the Kindle will lose it.

Example configuration with Home Assistant sources:

```json
{
  "language": "en",
  "timezone": "Europe/London",
  "location": { "name": "London", "latitude": 51.5072, "longitude": -0.1276 },
  "calendars": [{ "label": "FAM", "homeassistant": "calendar.family" }],
  "tasks": { "provider": "homeassistant", "entity": "todo.shopping_list" },
  "medications": { "homeassistant": "todo.medications" }
}
```

## Security

- The token protects every request. Anyone on your network who knows it can read what the panel shows and tick off tasks and doses, nothing else.
- Kinboard uses Home Assistant's internal API proxy with a token the Supervisor gives to the app: you do not create a long-lived access token, and it never leaves the container.
- Token and Google key have their own password fields; the configuration can then hold no secrets at all.
- The options (token, key, calendar links) are stored on your Home Assistant and included in its backups. They are never sent anywhere else.
- Port 8080 is meant for your home network only: do not forward it on the router. To reach the Kindle panel from outside, use a VPN such as Tailscale.

## Resources

The server uses about 150 MB of RAM, most of it for the image renderer. The screensaver image is drawn on request, every 15 minutes per Kindle.
