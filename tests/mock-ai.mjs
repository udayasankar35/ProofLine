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
    const parts = body?.contents?.[0]?.parts ?? [];
    const media = parts.find((x) => x.inline_data);
    if (media) {
      // vision request: answer according to the kind of file
      if (req.headers["x-goog-api-key"] !== "test") { res.writeHead(403).end("{}"); return; }
      const mime = media.inline_data.mime_type;
      const out = mime.startsWith("image/")
        ? { text: "AquaPulse\ncures fatigue!\nThe #1 sports drink in India\nGuaranteed results in 7 days\nAvailable in 3,000 stores\nTerms apply. See website for details.",
            suggested_alt: "Navy social tile with the words AquaPulse cures fatigue and a pink band at the bottom",
            text_blocks: [
              { text: "Terms apply. See website for details.", height_pct: 1.6, fg: "#F3A6CF", bg: "#FF2D95" },
              { text: "Available in 3,000 stores", height_pct: 3.7, fg: "#FFFFFF", bg: "#FF2D95" },
              { text: "AquaPulse", height_pct: 8.9, fg: "#FFFFFF", bg: "#0B2545" } ],
            colors: ["#0B2545", "#FF2D95", "#9BD93C", "#FFFFFF"] }
        : { text: "Scanned page: AquaPulse is the #1 sports drink in India.", suggested_alt: "", text_blocks: [], colors: [] };
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }));
      return;
    }
    const prompt = parts[0]?.text ?? "";
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
