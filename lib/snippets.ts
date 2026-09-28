// Ready-to-paste code for developers: call a model (or the free image API) with the optimized prompt.

import { sizeFor } from "./image.ts";

export type SnippetLang = "curl" | "javascript" | "python";

export function estimateTokens(text: string) {
  return Math.max(1, Math.round(text.length / 4)); // rough rule of thumb for English text
}

export function textSnippet(lang: SnippetLang, prompt: string, model = "openai/gpt-oss-120b", baseUrl = "https://api.groq.com/openai/v1") {
  const json = JSON.stringify(prompt);
  if (lang === "curl") {
    const body = JSON.stringify({ model, messages: [{ role: "user", content: prompt }] });
    return `curl ${baseUrl}/chat/completions \\\n  -H "Authorization: Bearer $LLM_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${body.replace(/'/g, "'\\''")}'`;
  }
  if (lang === "javascript") {
    return `const res = await fetch("${baseUrl}/chat/completions", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.LLM_API_KEY}\`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "${model}",
    messages: [{ role: "user", content: ${json} }],
  }),
});
const data = await res.json();
console.log(data.choices[0].message.content);`;
  }
  return `import os
from openai import OpenAI  # pip install openai (works with any OpenAI-compatible API)

client = OpenAI(base_url="${baseUrl}", api_key=os.environ["LLM_API_KEY"])
res = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": ${json}}],
)
print(res.choices[0].message.content)`;
}

export function imageSnippet(lang: SnippetLang, prompt: string, shape: string | undefined, seed: number) {
  const { width, height } = sizeFor(shape);
  const path = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&model=zimage`;
  if (lang === "curl") return `# Free key: https://enter.pollinations.ai/keys
curl -L -o image.jpg \\
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \\
  "${path}"`;
  if (lang === "javascript") {
    return `// Free key: https://enter.pollinations.ai/keys
const prompt = ${JSON.stringify(prompt)};
const url = \`https://gen.pollinations.ai/image/\${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&model=zimage\`;
const res = await fetch(url, { headers: { Authorization: \`Bearer \${process.env.POLLINATIONS_API_KEY}\` } });
const bytes = Buffer.from(await res.arrayBuffer());
require("fs").writeFileSync("image.jpg", bytes);`;
  }
  return `# Free key: https://enter.pollinations.ai/keys
import os, urllib.parse, urllib.request

prompt = ${JSON.stringify(prompt)}
url = f"https://gen.pollinations.ai/image/{urllib.parse.quote(prompt)}?width=${width}&height=${height}&seed=${seed}&model=zimage"
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {os.environ['POLLINATIONS_API_KEY']}"})
with urllib.request.urlopen(req) as r, open("image.jpg", "wb") as f:
    f.write(r.read())`;
}
