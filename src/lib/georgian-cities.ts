/**
 * Selectable driver cities. Values mirror the `GeorgianCity` Prisma enum; they
 * are duplicated here (rather than imported from `@prisma/client`) to keep the
 * server-only Prisma client out of the browser bundle.
 */
export const GEORGIAN_CITY_OPTIONS = [
  { value: "TBILISI", label: "Tbilisi" },
  { value: "BATUMI", label: "Batumi" },
  { value: "KUTAISI", label: "Kutaisi" },
  { value: "RUSTAVI", label: "Rustavi" },
  { value: "ZUGDIDI", label: "Zugdidi" },
  { value: "GORI", label: "Gori" },
  { value: "POTI", label: "Poti" },
  { value: "SAMTREDIA", label: "Samtredia" },
  { value: "KHASHURI", label: "Khashuri" },
  { value: "SENAKI", label: "Senaki" },
  { value: "ZESTAPONI", label: "Zestaponi" },
  { value: "MARNEULI", label: "Marneuli" },
  { value: "TELAVI", label: "Telavi" },
  { value: "AKHALTSIKHE", label: "Akhaltsikhe" },
  { value: "OZURGETI", label: "Ozurgeti" },
  { value: "KOBULETI", label: "Kobuleti" },
  { value: "CHIATURA", label: "Chiatura" },
  { value: "TSKALTUBO", label: "Tskaltubo" },
  { value: "SAGAREJO", label: "Sagarejo" },
  { value: "GARDABANI", label: "Gardabani" },
  { value: "BOLNISI", label: "Bolnisi" },
  { value: "AKHALKALAKI", label: "Akhalkalaki" },
  { value: "BORJOMI", label: "Borjomi" },
  { value: "KASPI", label: "Kaspi" },
  { value: "MTSKHETA", label: "Mtskheta" },
] as const;
