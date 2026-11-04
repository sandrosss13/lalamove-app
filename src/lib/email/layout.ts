/**
 * The shared shell of zomo's transactional emails: one table-based column,
 * inline styles only — the subset of HTML that renders the same in Gmail,
 * Outlook and Apple Mail — plus a plain-text twin built from the same blocks,
 * so the two parts can never say different things.
 *
 * Callers describe an email as a list of `EmailBlock`s holding *already
 * translated* strings; this module owns every colour, spacing and escaping
 * decision. Every string that reaches the HTML goes through `escapeHtml` here,
 * so a caller cannot forget to — addresses, names and plates are user input.
 *
 * Pure: no env, no Prisma, no `next/*`.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const EMAIL_FONT_STACK =
  "'IBM Plex Sans','Noto Sans Georgian',-apple-system,'Segoe UI',Roboto,Arial,sans-serif";

/**
 * The palette, spelled out: email clients ignore CSS variables. `ACCENT` is
 * the light-theme `--landing-accent`, the shade white button text passes WCAG
 * AA on (see `password-reset.ts`).
 */
export const EMAIL_COLORS = {
  page: "#f1efe9",
  card: "#ffffff",
  border: "#e7e4de",
  text: "#15140f",
  body: "#4a473f",
  muted: "#6b675f",
  panel: "#faf9f6",
  accent: "#c03d09",
  onAccent: "#ffffff",
} as const;

export type EmailChipTone = "orange" | "blue" | "green" | "grey";

const CHIP_COLORS: Record<EmailChipTone, { fg: string; bg: string }> = {
  orange: { fg: "#c03d09", bg: "#fdeee7" },
  blue: { fg: "#1d5fa8", bg: "#e8f0fa" },
  green: { fg: "#1c6b43", bg: "#e5f3ea" },
  grey: { fg: "#4a473f", bg: "#efede8" },
};

export type EmailRow = { label: string; value: string; strong?: boolean };

export type EmailStop = {
  label: string;
  address: string;
  /** e.g. "3rd floor · Passenger elevator"; null to omit the line. */
  detail: string | null;
};

/**
 * A translated sentence, optionally holding a phone number to render as a
 * tap-to-call link. `text` is the full plain sentence (also the plain-text
 * part); `phone` is the number as it appears inside it. Mail apps only
 * auto-link a number after some English words ("call"), so it is linked
 * explicitly, in every language.
 */
export type EmailText = string | { text: string; phone: string };

export type EmailBlock =
  | { kind: "paragraph"; text: EmailText; tone?: "body" | "muted" }
  /** A shaded panel: small label over one prominent line. */
  | { kind: "panel"; label: string; value: string }
  | { kind: "route"; stops: EmailStop[]; compact?: boolean }
  | { kind: "rows"; rows: EmailRow[] }
  /** A titled list with a quantity per line; `muted` rows (e.g. "+3 more") are dimmed. */
  | {
      kind: "items";
      title: string;
      quantityHeader: string;
      itemHeader: string;
      items: { label: string; quantity: string; muted?: boolean }[];
    }
  /** The assigned vehicle: any part may be null and is then left out. */
  | {
      kind: "vehicle";
      label: string | null;
      title: string | null;
      plate: string | null;
      plateLabel: string;
    }
  | { kind: "button"; label: string; href: string }
  /** A sentence with a trailing link: "Need to change something? View your order". */
  | { kind: "link"; lead: string | null; label: string; href: string }
  /** A bordered note, for instructions the reader should not skim past. */
  | { kind: "note"; text: string };

export type EmailLayout = {
  /** The `lang` attribute. */
  lang: string;
  /** The document `<title>` — the subject. */
  title: string;
  /** Inbox preview text, hidden in the body. */
  preheader: string | null;
  logoUrl: string;
  logoAlt: string;
  /** Top-right of the header, e.g. "Order GE-48210". */
  headerRight: string | null;
  chip: { label: string; tone: EmailChipTone } | null;
  heading: string;
  blocks: EmailBlock[];
  /** Footer lines, in order. */
  footer: EmailText[];
  /** Optional link line in the footer, e.g. zomo.ge. */
  footerLink: { label: string; href: string } | null;
};

const C = EMAIL_COLORS;
const PAD = "0 32px";

function linkHtml(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}" style="color:${C.accent};text-decoration:underline;">${escapeHtml(label)}</a>`;
}

export function emailTextPlain(value: EmailText): string {
  return typeof value === "string" ? value : value.text;
}

/** `tel:` target: a leading + and the digits; null when there are no digits. */
function telHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits === "") return null;
  return `tel:${phone.trim().startsWith("+") ? "+" : ""}${digits}`;
}

/** Escaped HTML for a sentence, with its phone number (if any) as a link. */
function emailTextHtml(value: EmailText): string {
  if (typeof value === "string") return escapeHtml(value);
  const href = telHref(value.phone);
  const at = value.phone === "" ? -1 : value.text.indexOf(value.phone);
  if (href === null || at < 0) return escapeHtml(value.text);
  return `${escapeHtml(value.text.slice(0, at))}<a href="${escapeHtml(href)}" style="color:inherit;text-decoration:underline;white-space:nowrap">${escapeHtml(value.phone)}</a>${escapeHtml(value.text.slice(at + value.phone.length))}`;
}

function blockHtml(block: EmailBlock): string {
  switch (block.kind) {
    case "paragraph": {
      const color = block.tone === "muted" ? C.muted : C.body;
      const size = block.tone === "muted" ? 13 : 15;
      return `<tr><td style="padding:${PAD};padding-top:12px;font-size:${size}px;line-height:1.6;color:${color};">${emailTextHtml(block.text)}</td></tr>`;
    }
    case "panel":
      return `<tr><td style="padding:${PAD};padding-top:20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.panel};border:1px solid ${C.border};border-radius:8px;">
<tr><td style="padding:14px 16px;">
<div style="font-size:12px;line-height:1.4;color:${C.muted};text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(block.label)}</div>
<div style="padding-top:4px;font-size:16px;line-height:1.4;font-weight:600;color:${C.text};">${escapeHtml(block.value)}</div>
</td></tr>
</table>
</td></tr>`;
    case "route": {
      const gap = block.compact ? 8 : 12;
      const stops = block.stops
        .map(
          (stop, index) => `<tr>
<td valign="top" width="56" style="width:56px;padding-top:${index === 0 ? 0 : gap}px;font-size:13px;line-height:1.5;color:${C.muted};">${escapeHtml(stop.label)}</td>
<td valign="top" style="padding-top:${index === 0 ? 0 : gap}px;font-size:15px;line-height:1.5;color:${C.text};">${escapeHtml(stop.address)}${
            stop.detail
              ? `<div style="font-size:13px;line-height:1.5;color:${C.muted};">${escapeHtml(stop.detail)}</div>`
              : ""
          }</td>
</tr>`,
        )
        .join("\n");
      return `<tr><td style="padding:${PAD};padding-top:20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${stops}
</table>
</td></tr>`;
    }
    case "rows": {
      const rows = block.rows
        .map(
          (row, index) => `<tr>
<td valign="top" style="padding:10px 0;${index === 0 ? "" : `border-top:1px solid ${C.border};`}font-size:14px;line-height:1.5;color:${C.muted};">${escapeHtml(row.label)}</td>
<td valign="top" align="right" style="padding:10px 0 10px 16px;${index === 0 ? "" : `border-top:1px solid ${C.border};`}font-size:${row.strong ? 16 : 14}px;line-height:1.5;color:${C.text};${row.strong ? "font-weight:700;" : ""}">${escapeHtml(row.value)}</td>
</tr>`,
        )
        .join("\n");
      return `<tr><td style="padding:${PAD};padding-top:16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${rows}
</table>
</td></tr>`;
    }
    case "items": {
      const head = `<tr>
<td style="padding:0 0 6px;font-size:13px;line-height:1.5;color:${C.muted};">${escapeHtml(block.itemHeader)}</td>
<td align="right" style="padding:0 0 6px 16px;font-size:13px;line-height:1.5;color:${C.muted};">${escapeHtml(block.quantityHeader)}</td>
</tr>`;
      const rows = block.items
        .map((item) => {
          const labelColor = item.muted ? C.muted : C.text;
          const qtyColor = item.muted ? C.muted : C.body;
          return `<tr>
<td valign="top" style="padding:10px 0;border-top:1px solid ${C.border};font-size:14px;line-height:1.5;color:${labelColor};">${escapeHtml(item.label)}</td>
<td valign="top" align="right" style="padding:10px 0 10px 16px;border-top:1px solid ${C.border};font-size:14px;line-height:1.5;color:${qtyColor};white-space:nowrap;">${escapeHtml(item.quantity)}</td>
</tr>`;
        })
        .join("\n");
      return `<tr><td style="padding:${PAD};padding-top:20px;">
<div style="padding-bottom:8px;font-size:12px;line-height:1.4;color:${C.muted};text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(block.title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${head}
${rows}
</table>
</td></tr>`;
    }
    case "vehicle": {
      const lines: string[] = [];
      if (block.label) {
        lines.push(
          `<div style="font-size:12px;line-height:1.4;color:${C.muted};text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(block.label)}</div>`,
        );
      }
      if (block.title) {
        lines.push(
          `<div style="padding-top:4px;font-size:17px;line-height:1.4;font-weight:600;color:${C.text};">${escapeHtml(block.title)}</div>`,
        );
      }
      if (block.plate) {
        lines.push(
          `<div style="padding-top:10px;"><span style="display:inline-block;padding:6px 12px;border:1px solid ${C.text};border-radius:6px;background:${C.card};font-size:16px;line-height:1.2;font-weight:700;letter-spacing:0.12em;color:${C.text};" title="${escapeHtml(block.plateLabel)}">${escapeHtml(block.plate)}</span></div>`,
        );
      }
      return `<tr><td style="padding:${PAD};padding-top:20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.panel};border:1px solid ${C.border};border-radius:8px;">
<tr><td style="padding:16px;">
${lines.join("\n")}
</td></tr>
</table>
</td></tr>`;
    }
    case "button":
      return `<tr><td style="padding:${PAD};padding-top:24px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${C.accent};">
<a href="${escapeHtml(block.href)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:${C.accent};color:${C.onAccent};text-decoration:none;font-size:15px;font-weight:600;line-height:1.2;">${escapeHtml(block.label)}</a>
</td></tr></table>
</td></tr>`;
    case "link":
      return `<tr><td style="padding:${PAD};padding-top:14px;font-size:14px;line-height:1.6;color:${C.body};">${
        block.lead ? `${escapeHtml(block.lead)} ` : ""
      }${linkHtml(block.label, block.href)}</td></tr>`;
    case "note":
      return `<tr><td style="padding:${PAD};padding-top:20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.panel};border-left:3px solid ${C.accent};border-radius:4px;">
<tr><td style="padding:12px 14px;font-size:13px;line-height:1.6;color:${C.body};">${escapeHtml(block.text)}</td></tr>
</table>
</td></tr>`;
  }
}

function blockText(block: EmailBlock): string {
  switch (block.kind) {
    case "paragraph":
      return emailTextPlain(block.text);
    case "panel":
      return `${block.label}: ${block.value}`;
    case "route":
      return block.stops
        .map(
          (stop) =>
            `${stop.label}: ${stop.address}${stop.detail ? ` (${stop.detail})` : ""}`,
        )
        .join("\n");
    case "rows":
      return block.rows.map((row) => `${row.label}: ${row.value}`).join("\n");
    case "items":
      return [
        `${block.title}:`,
        ...block.items.map((item) =>
          item.quantity
            ? `- ${item.label} — ${item.quantity}`
            : `- ${item.label}`,
        ),
      ].join("\n");
    case "vehicle":
      return [
        block.label,
        block.title,
        block.plate ? `${block.plateLabel}: ${block.plate}` : null,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n");
    case "button":
      return `${block.label}: ${block.href}`;
    case "link":
      return `${block.lead ? `${block.lead} ` : ""}${block.label}: ${block.href}`;
    case "note":
      return block.text;
  }
}

/** A vehicle block with nothing in it renders nothing. */
function isEmpty(block: EmailBlock): boolean {
  switch (block.kind) {
    case "vehicle":
      return !block.label && !block.title && !block.plate;
    case "rows":
      return block.rows.length === 0;
    case "items":
      return block.items.length === 0;
    case "route":
      return block.stops.length === 0;
    default:
      return false;
  }
}

export function renderEmailLayout(layout: EmailLayout): {
  html: string;
  text: string;
} {
  const blocks = layout.blocks.filter((block) => !isEmpty(block));
  const chip = layout.chip ? CHIP_COLORS[layout.chip.tone] : null;

  const html = `<!doctype html>
<html lang="${escapeHtml(layout.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(layout.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
${
  layout.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(layout.preheader)}</div>\n`
    : ""
}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};">
<tr><td align="center" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.card};border:1px solid ${C.border};border-radius:12px;font-family:${EMAIL_FONT_STACK};color:${C.text};">
<tr><td style="padding:24px 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="middle"><img src="${escapeHtml(layout.logoUrl)}" alt="${escapeHtml(layout.logoAlt)}" width="99" height="26" style="display:block;height:26px;width:99px;border:0;outline:none;text-decoration:none;"></td>
${
  layout.headerRight
    ? `<td valign="middle" align="right" style="font-size:13px;line-height:1.4;color:${C.muted};">${escapeHtml(layout.headerRight)}</td>`
    : ""
}
</tr></table>
</td></tr>
${
  layout.chip && chip
    ? `<tr><td style="padding:${PAD};padding-top:28px;"><span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${chip.bg};color:${chip.fg};font-size:12px;line-height:1.4;font-weight:600;">${escapeHtml(layout.chip.label)}</span></td></tr>\n`
    : ""
}<tr><td style="padding:${PAD};padding-top:12px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.01em;color:${C.text};">${escapeHtml(layout.heading)}</td></tr>
${blocks.map(blockHtml).join("\n")}
<tr><td style="padding:28px 32px 0;"><div style="border-top:1px solid ${C.border};font-size:0;line-height:0;">&nbsp;</div></td></tr>
<tr><td style="padding:16px 32px 28px;font-size:12px;line-height:1.6;color:${C.muted};">
${layout.footer.map((line) => `<div>${emailTextHtml(line)}</div>`).join("\n")}${
    layout.footerLink
      ? `\n<div style="padding-top:6px;"><a href="${escapeHtml(layout.footerLink.href)}" style="color:${C.muted};text-decoration:underline;">${escapeHtml(layout.footerLink.label)}</a></div>`
      : ""
  }
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

  const text = [
    layout.headerRight,
    "",
    layout.chip?.label ?? null,
    layout.heading,
    ...blocks.flatMap((block) => ["", blockText(block)]),
    "",
    "--",
    ...layout.footer.map(emailTextPlain),
    layout.footerLink
      ? `${layout.footerLink.label}: ${layout.footerLink.href}`
      : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { html, text };
}
