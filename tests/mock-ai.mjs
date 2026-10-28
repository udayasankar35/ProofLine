// Tiny stand-in for the Gemini API, used only for local tests (node tests/mock-ai.mjs).
import http from "node:http";
const KNOWN = [
  ["#1 sports drink in India", "ranking", "F-07"],
  ["more than 2,000 stores", "number", "F-04"],
  ["40% recycled PET", "number", "F-05"],
  ["over 50,000 bottles every week", "number", "F-14"],
];
http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    const prompt = body?.contents?.[0]?.parts?.[0]?.text ?? "";
    const draft = prompt.split("<<<DRAFT\n")[1]?.split("\nDRAFT>>>")[0] ?? "";
    if (req.headers["x-goog-api-key"] !== "test") { res.writeHead(403).end("{}"); return; }
    if (draft.includes("BUSYTEST") && !req.url.includes("gemini-flash-latest")) { res.writeHead(503, {"content-type":"application/json"}).end(JSON.stringify({error:{message:"high demand"}})); return; }
    if (draft.includes("FAILTEST")) { res.writeHead(500).end("{}"); return; }
    const claims = KNOWN.filter(([q]) => draft.includes(q)).map(([quote, kind, fact_id]) => ({ quote, kind, fact_id, relation: "supports" }));
    claims.push({ quote: "100% natural ingredients", kind: "other", fact_id: null, relation: "none" }); // overlaps a rule finding -> dropped
    claims.push({ quote: "free shipping nationwide", kind: "other", fact_id: "F-99", relation: "supports" }); // not in the draft -> rejected
    const out = { candidates: [{ content: { parts: [{ text: "```json\n" + JSON.stringify({ claims }) + "\n```" }] } }] };
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(out));
  });
}).listen(4010, () => console.log("mock AI on 4010"));
