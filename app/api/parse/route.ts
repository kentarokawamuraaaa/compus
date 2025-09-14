import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import OpenAI from "openai";

type ParsedRow = {
	code?: string;
	name?: string;
	[value: string]: string | undefined;
};

export async function POST(req: NextRequest) {
	try {
		const { text } = (await req.json()) as { text?: string };
		if (!text || text.trim().length === 0) {
			return NextResponse.json({ error: "No text" }, { status: 400 });
		}

		// Try LLM if configured
		const client = process.env.OPENAI_API_KEY
			? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
			: null;
		if (client) {
			try {
				const system =
					"You convert messy pasted Japanese tabular text about company comparisons into a concise JSON table with headers and rows. Include columns for code (4 digits if present) and name when you can.";
				const user = `Text:\n${text}\nReturn JSON: { headers: string[], rows: Array<Record<string,string>> }`;
				const resp = await client.chat.completions.create({
					model: "gpt-4o-mini",
					messages: [
						{ role: "system", content: system },
						{ role: "user", content: user },
					],
					temperature: 0,
				});
				const content = resp.choices[0]?.message?.content ?? "";
				const jsonStart = content.indexOf("{");
				const jsonEnd = content.lastIndexOf("}");
				if (jsonStart >= 0 && jsonEnd > jsonStart) {
					const parsed = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
					return NextResponse.json(parsed);
				}
			} catch (err) {
				console.warn("LLM parse failed, falling back to heuristic.", err);
			}
		}

		// Heuristic fallback
		const { headers, rows } = heuristicParse(text);
		return NextResponse.json({ headers, rows });
	} catch (e) {
		console.error(e);
		return NextResponse.json({ error: "Parse failed" }, { status: 500 });
	}
}

function tokenize(line: string): string[] {
	// Replace multiple spaces and tabs with a single space; also split on punctuation commonly present
	const normalized = line
		.replace(/\s+/g, " ")
		.replace(/[\u5186,円]/g, "") // remove Yen markers
		.replace(/億/g, "00,000,000") // rough expand "億" to digits to keep tokens separated
		.trim();
	return normalized
		.split(/[\s|,\t]+/)
		.map((t) => t.trim())
		.filter(Boolean);
}

function heuristicParse(text: string): {
	headers: string[];
	rows: ParsedRow[];
} {
	const lines = text
		.replace(/\r\n?/g, "\n")
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0);

	const headerIdx = lines.findIndex((l) =>
		/[A-Za-z\u3040-\u30ff\u4e00-\u9faf].*(PER|PBR|ROE|時価総額|企業価値)/.test(
			l,
		),
	);
	let headers: string[] = [];
	if (headerIdx >= 0) {
		headers = tokenize(lines[headerIdx]);
	}

	const dataLines = lines.slice(headerIdx >= 0 ? headerIdx + 1 : 0);
	const rows: ParsedRow[] = [];

	for (const l of dataLines) {
		const tokens = tokenize(l);
		if (tokens.length < 1) continue;

		let code: string | undefined;
		let name: string | undefined;
		if (/^\d{4,5}$/.test(tokens[0])) {
			code = tokens[0];
			name = tokens[1];
		}
		if (!name) {
			name = tokens[0];
		}

		const row: ParsedRow = { code, name };
		const valueTokens = code ? tokens.slice(2) : tokens.slice(1);
		if (headers.length > 0 && valueTokens.length > 0) {
			for (let i = 0; i < Math.min(headers.length, valueTokens.length); i++) {
				row[headers[i]] = valueTokens[i];
			}
		} else {
			valueTokens.forEach((val, i) => {
				row[`col_${i + 1}`] = val;
			});
		}
		rows.push(row);
	}

	return { headers, rows };
}
