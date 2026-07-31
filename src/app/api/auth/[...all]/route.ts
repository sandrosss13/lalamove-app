import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

// Catch-all route that hands every /api/auth/* request to Better Auth.
export const { GET, POST } = toNextJsHandler(auth);
