import { readFileSync } from "node:fs";

// The site's identity and pinned sources. Everything else is shared by the family's sites.
export const site = JSON.parse(readFileSync(new URL("../site.json", import.meta.url), "utf8"));
