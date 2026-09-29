import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * Points the plugin at the request config. The path is passed explicitly rather
 * than relying on the convention (`./i18n/request.ts` relative to the project
 * or `src` root) so that moving the file shows up as a failure here instead of
 * as a silent fallback to an empty message set at runtime.
 */
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {};

export default withNextIntl(nextConfig);
