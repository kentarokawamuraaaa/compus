import fs from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type SimplifiedRow = {
	code: string;
	name: string;
	nameKey: string;
	codeKey: string;
};

let cachedRows: SimplifiedRow[] | null = null;

function normalizeForSearch(input: string): string {
	return input.normalize("NFKC").toLowerCase();
}

async function loadRows(): Promise<SimplifiedRow[]> {
	if (cachedRows) return cachedRows;
	const filePath = path.join(process.cwd(), "app", "tosyo.json");
	const json = await fs.readFile(filePath, "utf8");
	const raw = JSON.parse(json) as Array<Record<string, unknown>>;
	cachedRows = raw
		.map((row) => {
			const r = row as { コード?: unknown; 銘柄名?: unknown } & Record<
				string,
				unknown
			>;
			const code = String(r.コード ?? "").trim();
			const name = String(r.銘柄名 ?? "").trim();
			return {
				code,
				name,
				nameKey: normalizeForSearch(name),
				codeKey: normalizeForSearch(code),
			};
		})
		.filter((r) => r.code && r.name);
	return cachedRows;
}

export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const q = normalizeForSearch((searchParams.get("q") ?? "").trim());
		const limitParam = Number(searchParams.get("limit") ?? "20");
		const limit = Math.min(
			Math.max(Number.isFinite(limitParam) ? limitParam : 20, 1),
			100,
		);

		const rows = await loadRows();
		if (!q) {
			return NextResponse.json(
				rows.slice(0, limit).map(({ code, name }) => ({ code, name })),
			);
		}

		const out: Array<{ code: string; name: string }> = [];
		for (const r of rows) {
			if (r.nameKey.includes(q) || r.codeKey.includes(q)) {
				out.push({ code: r.code, name: r.name });
				if (out.length >= limit) break;
			}
		}
		return NextResponse.json(out);
	} catch (e) {
		console.error(e);
		return NextResponse.json({ error: "Search failed" }, { status: 500 });
	}
}
