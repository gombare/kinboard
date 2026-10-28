// Weather from Open-Meteo (free, no API key).
export async function fetchWeather(cfg) {
  const { latitude, longitude } = cfg.location;
  const imperial = cfg.units === 'imperial';
  const q = new URLSearchParams({
    latitude, longitude, timezone: cfg.timezone, forecast_days: '6',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,weather_code,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,wind_speed_10m_max',
    forecast_hours: '24',
    ...(imperial ? { temperature_unit: 'fahrenheit', wind_speed_unit: 'mph' } : {}),
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`weather: HTTP ${res.status}`);
  const w = await res.json();
  const c = w.current, d = w.daily, h = w.hourly;
  return {
    units: { temp: imperial ? '°F' : '°C', wind: imperial ? 'mph' : 'km/h' },
    current: {
      temp: c.temperature_2m, feels: c.apparent_temperature, humidity: c.relative_humidity_2m,
      code: c.weather_code, wind: c.wind_speed_10m, isDay: c.is_day === 1,
    },
    hourly: h.time.map((t, i) => ({ time: t.slice(11, 16), temp: h.temperature_2m[i], code: h.weather_code[i], rain: h.precipitation_probability[i] })),
    daily: d.time.map((t, i) => ({
      date: t, code: d.weather_code[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i],
      rain: d.precipitation_probability_max[i], wind: d.wind_speed_10m_max[i],
      sunrise: (d.sunrise[i] || '').slice(11, 16), sunset: (d.sunset[i] || '').slice(11, 16),
    })),
  };
}

// WMO weather code -> icon name and i18n key.
export function weatherKind(code) {
  if (code === 0) return 'clear';
  if (code === 1) return 'mainly_clear';
  if (code === 2) return 'partly_cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return code === 65 || code === 82 ? 'heavy_rain' : 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'thunderstorm';
  return 'overcast';
}

// At night clear skies show the moon instead of the sun.
export function iconFor(code, isDay = true) {
  const name = KIND_ICON[weatherKind(code)];
  if (isDay) return name;
  return name === 'sun' ? 'moon' : name === 'cloud-sun' ? 'cloud-moon' : name;
}

export const KIND_ICON = {
  clear: 'sun', mainly_clear: 'sun', partly_cloudy: 'cloud-sun', overcast: 'cloud', fog: 'cloud-fog',
  drizzle: 'cloud-drizzle', rain: 'cloud-rain', heavy_rain: 'cloud-rain-wind', snow: 'cloud-snow', thunderstorm: 'cloud-lightning',
};
