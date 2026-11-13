// Writes the synthetic NovaPay demo dataset to samples/ so the Python engine can fine-tune
// a real model (e.g. GPT-2) on exactly the same data the in-browser demo uses.
import { writeFile, mkdir } from "node:fs/promises";
import { makeDemoDataset } from "../assets/js/engine/dataset.js";

const ds = makeDemoDataset();
const dir = new URL("../samples/", import.meta.url);
await mkdir(dir, { recursive: true });
const jsonl = (arr) => arr.map((text) => JSON.stringify({ text })).join("\n") + "\n";
await writeFile(new URL("records.jsonl", dir), jsonl(ds.privateRecords));
await writeFile(new URL("holdout.jsonl", dir), jsonl(ds.holdout));
await writeFile(new URL("public_corpus.jsonl", dir), jsonl(ds.publicCorpus));
await writeFile(new URL("canaries.json", dir), JSON.stringify(ds.canaries.map(({ text, secret, kind }) => ({ text, secret, kind })), null, 2) + "\n");
console.log(`Wrote ${ds.privateRecords.length} records, ${ds.holdout.length} holdout, ${ds.publicCorpus.length} public, ${ds.canaries.length} canaries (all synthetic).`);
