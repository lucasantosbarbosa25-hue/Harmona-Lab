// Lê uma lista de "#..." no stdin e devolve o que o app entenderia de cada link (para os testes em Python).
import { readFileSync } from "node:fs";

import { parseLinkHash } from "../../harmonalab/web/ai/link.js";

const hashes = JSON.parse(readFileSync(0, "utf8"));
const out = [];
for (const hash of hashes) out.push(await parseLinkHash(hash));
process.stdout.write(JSON.stringify(out));
