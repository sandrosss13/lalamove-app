/**
 * "TBILISI" → "Tbilisi". Every `GeorgianCity` value is a single word, so
 * capitalising the first letter is enough — shared by every ops-dashboard
 * surface that renders a city (sidebar, driver roster, revenue-by-region).
 */
export function formatCity(city: string): string {
  return city.charAt(0) + city.slice(1).toLowerCase();
}
