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
					"You convert pasted Japanese tabular text about companies into STRICT JSON, preserving all factual columns exactly. Do not drop, merge, or rename columns. Keep number+unit together (e.g., '100,257億円', '46.1倍', '2.4%'). Preserve commas, minus signs, and Japanese units (兆, 億, 円, 倍). Normalize '％' to '%'. Output only JSON with no commentary.";
				const user = `Text (Japanese table):\n${text}\n\nRequirements:\n- Return JSON with shape: { headers: string[], rows: Array<Record<string,string>> }.\n- headers: use the exact column headers from the first header row in the text, but EXCLUDE identifier columns such as '銘柄' and '企業名' (these will be returned via 'code' and 'name' in each row). If the header is split like 'PER' and '(会)', join into 'PER (会)'. Keep columns like '企業価値', '時価総額', 'PER (会)', '売上', '営利', '純利', '配当利予', 'ROE', '自資本比', and '特徴語' exactly when present. Preserve the original header order.\n- rows: each row is a mapping from header to string value, plus keys 'code' (4-digit stock code when present) and 'name' (company name). For each header, copy the cell text as-is, preserving units (兆円/億円/円/倍/%), commas, negatives; normalize '％' to '%'. Use 'N/A' when a cell is not available.\n- Do not invent, drop, reorder, or transform columns or values beyond the minimal normalizations stated above.`;
				const resp = await client.chat.completions.create({
					model: "gpt-5-mini",
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
					if (isValidParsed(parsed)) {
						return NextResponse.json(parsed);
					}
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

// Merge patterns like "4,855 億円" -> "4,855億円", "42.4 倍" -> "42.4倍", "2.4 %" -> "2.4%"
function mergeNumberUnits(input: string): string {
	let s = input;
	// normalize percent variants and N/A spacing
	s = s.replace(/％/g, "%");
	s = s.replace(/N\s*\/\s*A/gi, "N/A");
	// 兆/億 円
	s = s.replace(/(\d[\d,]*(?:\.\d+)?)\s*(兆|億)\s*円/g, "$1$2円");
	// 円 only
	s = s.replace(/(\d[\d,]*(?:\.\d+)?)\s*円/g, "$1円");
	// 倍
	s = s.replace(/(\d[\d,]*(?:\.\d+)?)\s*倍/g, "$1倍");
	// %
	s = s.replace(/(\d[\d,]*(?:\.\d+)?)\s*%/g, "$1%");
	return s;
}

function tokenizeHeader(line: string): string[] {
	const raw = line.trim();
	// split on whitespace and vertical bars, but NOT commas
	const tokens = raw
		.split(/[\s|\t]+/)
		.map((t) => t.trim())
		.filter(Boolean);
	// Join standalone parenthesis tokens to previous token: "PER (会)" -> "PER (会)"
	const joined: string[] = [];
	for (const t of tokens) {
		if (/^\(.+\)$/.test(t) && joined.length > 0) {
			joined[joined.length - 1] = `${joined[joined.length - 1]} ${t}`;
		} else {
			joined.push(t);
		}
	}
	const drop = new Set([
		"銘柄",
		"企業名",
		"銘柄名",
		"コード",
		"code",
		"name",
		"操作",
	]);
	return joined.filter((t) => !drop.has(t));
}

function tokenizeRow(line: string): string[] {
	const normalized = mergeNumberUnits(line).replace(/\s+/g, " ").trim();
	return normalized
		.split(/[\s|\t]+/)
		.map((t) => t.trim())
		.filter(Boolean);
}

// Accepts numbers with optional commas/decimals and optional units like 兆円/億円/円/倍/%
// Also accepts N/A, -, and negative values.
function isNumericLikeToken(token: string): boolean {
	const t = token.trim();
	if (!t) return false;
	if (/^(?:N\/?A|n\/?a)$/i.test(t)) return true;
	if (/^[-−–—]$/.test(t)) return true; // lone dash used as missing value
	return /^[-−–—]?\d[\d,]*(?:\.\d+)?(?:兆円|億円|円|倍|%|％)?$/.test(t);
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
		headers = tokenizeHeader(lines[headerIdx]);
	}

	const dataLines = lines.slice(headerIdx >= 0 ? headerIdx + 1 : 0);
	const rows: ParsedRow[] = [];

	for (const l of dataLines) {
		const tokens = tokenizeRow(l);
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
		const rest = code ? tokens.slice(1) : tokens.slice(0);
		// rest[0..] now starts with the (possibly multi-token) name. We need to locate where
		// the numeric columns start. We assume most headers except the optional last "特徴語"
		// are numeric-like.
		if (headers.length > 0) {
			const hasTokucho = headers[headers.length - 1] === "特徴語";
			const numericCount = hasTokucho ? headers.length - 1 : headers.length;
			// Find the first index j in rest such that the next numericCount tokens are numeric-like.
			let j = -1;
			for (let i = 1; i <= rest.length; i++) {
				if (i + numericCount <= rest.length) {
					const slice = rest.slice(i, i + numericCount);
					if (slice.every(isNumericLikeToken)) {
						j = i;
						break;
					}
				}
			}
			if (j !== -1) {
				// Name may contain spaces: join rest[0..j-1]
				row.name = rest.slice(0, j).join(" ");
				const numericValues = rest.slice(j, j + numericCount);
				for (let k = 0; k < numericCount; k++) {
					row[headers[k]] = numericValues[k] ?? "";
				}
				if (hasTokucho) {
					const tail = rest.slice(j + numericCount);
					row[headers[headers.length - 1]] = tail.join(" ");
				}
			} else {
				// Fallback to simple positional mapping using naive name (single token)
				const valueTokens = code ? tokens.slice(2) : tokens.slice(1);
				for (let i = 0; i < Math.min(headers.length, valueTokens.length); i++) {
					row[headers[i]] = valueTokens[i];
				}
			}
		} else {
			// No headers: number the columns
			const valueTokens = code ? tokens.slice(2) : tokens.slice(1);
			valueTokens.forEach((val, i) => {
				row[`col_${i + 1}`] = val;
			});
		}
		rows.push(row);
	}

	return { headers, rows };
}

function isValidParsed(parsed: unknown): parsed is {
	headers: string[];
	rows: Array<Record<string, string>>;
} {
	if (
		!parsed ||
		typeof parsed !== "object" ||
		!Array.isArray((parsed as { headers?: unknown }).headers) ||
		!Array.isArray((parsed as { rows?: unknown }).rows)
	) {
		return false;
	}
	const headers = (parsed as { headers: unknown }).headers as unknown[];
	const rows = (parsed as { rows: unknown }).rows as unknown[];
	if (headers.length < 5) return false;
	const headerStrs = headers.map(String).join("\n");
	const mustHave = ["PER", "時価", "企業価値", "ROE", "売上"];
	const hasKey = mustHave.some((k) => headerStrs.includes(k));
	if (!hasKey) return false;
	if (rows.length === 0) return false;
	return true;
}
