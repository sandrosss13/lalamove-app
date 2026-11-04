/* eslint-disable no-console -- A dev script whose output is the list of files
   it wrote. */

/**
 * Renders the four client order emails in both languages with sample data to
 * `.email-previews/*.html` (git-ignored locally), so a person can open them in
 * a browser. The logo is `public/zomo-logo.png` by `file://` URL, so the
 * previews need no running server.
 *
 *   pnpm exec tsx scripts/preview-order-emails.ts
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { createTranslator } from "next-intl";

import type { AppLocale } from "@/i18n/routing";
import type { Translator } from "@/i18n/translator";
import { renderOrderEmail } from "@/lib/email/order-emails/render";
import type {
  OrderEmailBase,
  OrderEmailData,
} from "@/lib/email/order-emails/types";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, ".email-previews");
const ORIGIN = "http://localhost:3000";

function translator(locale: AppLocale): Translator {
  const catalog = JSON.parse(
    readFileSync(
      join(ROOT, "src", "messages", locale, "orderEmails.json"),
      "utf8",
    ),
  ) as Record<string, unknown>;

  return createTranslator({
    locale,
    messages: { orderEmails: catalog },
    namespace: "orderEmails",
  }) as unknown as Translator;
}

function samples(locale: AppLocale): OrderEmailData[] {
  const ka = locale === "ka";
  const base: OrderEmailBase = {
    locale,
    reference: "GE-48210",
    firstName: ka ? "ნინო" : "Nino",
    isGuest: false,
    pickupWindowStart: new Date("2026-11-06T06:00:00Z"),
    pickupWindowEnd: new Date("2026-11-06T06:30:00Z"),
    pickup: {
      address: ka
        ? "ჭავჭავაძის გამზ. 12, თბილისი"
        : "12 Chavchavadze Ave, Tbilisi",
      floor: 3,
      passengerElevator: true,
      cargoElevator: false,
    },
    dropoff: {
      address: ka ? "ყაზბეგის გამზ. 5, თბილისი" : "5 Kazbegi Ave, Tbilisi",
      floor: 0,
      passengerElevator: false,
      cargoElevator: false,
    },
    links: {
      track: `${ORIGIN}/${locale}/orders/sample/track`,
      order: `${ORIGIN}/${locale}/orders/sample`,
      receipt: `${ORIGIN}/api/orders/sample/document`,
      bookAgain: `${ORIGIN}/${locale}`,
    },
    supportPhone: "+995 32 200 00 00",
    canReply: true,
  };
  const vehicleLabel = ka ? "ფურგონი · 1.5 ტ-მდე" : "Van · up to 1.5 t";

  return [
    {
      ...base,
      kind: "ORDER_CONFIRMED",
      vehicleLabel,
      helperCount: 1,
      items: ka
        ? [
            { label: "დივანი", quantity: 1 },
            { label: "კარადა", quantity: 1 },
            { label: "ყუთი", quantity: 8 },
          ]
        : [
            { label: "Sofa", quantity: 1 },
            { label: "Wardrobe", quantity: 1 },
            { label: "Boxes", quantity: 8 },
          ],
      paymentMethod: "CARD",
      paid: true,
      totalGel: 185,
    },
    {
      ...base,
      kind: "DRIVER_ASSIGNED",
      vehicleLabel,
      vehicle: { make: "Ford", model: "Transit", plate: "AB-123-CD" },
      companyName: "Kartli Logistics",
    },
    {
      ...base,
      kind: "ORDER_DELIVERED",
      completedAt: new Date("2026-11-06T10:32:00Z"),
      receivedBy: ka ? "გიორგი" : "Giorgi",
      totalGel: 205,
      overtimeGel: 20,
    },
    {
      ...base,
      kind: "ORDER_CANCELLED",
      cancelledBy: "CLIENT",
      wasPaid: true,
    },
  ];
}

mkdirSync(OUT_DIR, { recursive: true });

for (const locale of ["en", "ka"] as const) {
  const t = translator(locale);

  for (const data of samples(locale)) {
    const email = renderOrderEmail(data, t, {
      logoUrl: pathToFileURL(join(ROOT, "public", "zomo-logo.png")).href,
    });
    const name = `${data.kind.toLowerCase()}.${locale}`;

    writeFileSync(join(OUT_DIR, `${name}.html`), email.html);
    writeFileSync(
      join(OUT_DIR, `${name}.txt`),
      `${email.subject}\n\n${email.text}\n`,
    );
    console.log(
      `${join(".email-previews", `${name}.html`)}  — ${email.subject}`,
    );
  }
}
