// Utility functions for calculating averages from company data

export interface ParsedData {
	headers: string[];
	rows: string[][];
}

export interface CompanyMetrics {
	code: string;
	name: string;
	metrics: Record<string, number | null>;
}

export interface AverageMetrics {
	[key: string]: number | null;
}

/**
 * Parse Japanese number format to number
 * Handles: "4,855億円", "12.5倍", "15.3%", etc.
 */
export function parseJapaneseNumber(value: string): number | null {
	if (!value || typeof value !== "string") return null;

	// Remove whitespace
	const cleaned = value.trim();
	if (cleaned === "-" || cleaned === "" || cleaned === "N/A") return null;

	// Remove common Japanese units and convert
	const numStr = cleaned
		.replace(/兆円?/g, "e12")
		.replace(/億円?/g, "e8")
		.replace(/百万円?/g, "e6")
		.replace(/千円?/g, "e3")
		.replace(/円/g, "")
		.replace(/倍/g, "")
		.replace(/%/g, "")
		.replace(/,/g, "");

	// Handle scientific notation from replacements
	if (numStr.includes("e")) {
		const parts = numStr.split("e");
		if (parts.length === 2) {
			const base = parseFloat(parts[0]);
			const exp = parseInt(parts[1], 10);
			if (!isNaN(base) && !isNaN(exp)) {
				return base * Math.pow(10, exp);
			}
		}
	}

	const parsed = parseFloat(numStr);
	return isNaN(parsed) ? null : parsed;
}

/**
 * Extract metrics from parsed data for a single company
 */
export function extractMetrics(
	parsed: ParsedData,
	code: string,
	name: string
): CompanyMetrics {
	console.log(`[extractMetrics] Processing ${name} (${code})`);
	console.log("[extractMetrics] Parsed data:", parsed);

	const metrics: Record<string, number | null> = {};

	if (!parsed || !parsed.headers || !parsed.rows || parsed.rows.length === 0) {
		console.log("[extractMetrics] Invalid or empty parsed data");
		return { code, name, metrics };
	}

	const headers = parsed.headers;
	const row = parsed.rows[0]; // Assuming first row is the company data

	console.log("[extractMetrics] Headers:", headers);
	console.log("[extractMetrics] Row data:", row);

	for (let i = 0; i < headers.length; i++) {
		const header = headers[i];
		const value = row[i];
		if (value) {
			const parsedValue = parseJapaneseNumber(value);
			console.log(`[extractMetrics] ${header}: "${value}" -> ${parsedValue}`);
			metrics[header] = parsedValue;
		}
	}

	console.log("[extractMetrics] Final metrics:", metrics);
	return { code, name, metrics };
}

/**
 * Calculate average metrics from multiple companies
 */
export function calculateAverages(
	companies: CompanyMetrics[]
): AverageMetrics {
	console.log("[calculateAverages] Input companies:", companies);

	if (companies.length === 0) {
		console.log("[calculateAverages] No companies provided");
		return {};
	}

	// Collect all unique metric keys
	const allKeys = new Set<string>();
	companies.forEach((company) => {
		Object.keys(company.metrics).forEach((key) => allKeys.add(key));
	});

	console.log("[calculateAverages] All metric keys:", Array.from(allKeys));

	const averages: AverageMetrics = {};

	allKeys.forEach((key) => {
		const values = companies
			.map((company) => company.metrics[key])
			.filter((v): v is number => v !== null && !isNaN(v));

		console.log(`[calculateAverages] ${key}: values =`, values);

		if (values.length > 0) {
			const sum = values.reduce((acc, val) => acc + val, 0);
			averages[key] = sum / values.length;
			console.log(`[calculateAverages] ${key}: average = ${averages[key]}`);
		} else {
			averages[key] = null;
			console.log(`[calculateAverages] ${key}: no valid values, setting to null`);
		}
	});

	console.log("[calculateAverages] Final averages:", averages);
	return averages;
}

/**
 * Format number back to Japanese format for display
 */
export function formatJapaneseNumber(
	value: number | null,
	unit?: string
): string {
	if (value === null || isNaN(value)) return "-";

	// Determine appropriate unit if not specified
	if (!unit) {
		if (value >= 1e12) {
			return `${(value / 1e12).toFixed(2)}兆円`;
		} else if (value >= 1e8) {
			return `${(value / 1e8).toFixed(0)}億円`;
		} else if (value >= 1e6) {
			return `${(value / 1e6).toFixed(0)}百万円`;
		} else {
			return value.toLocaleString("ja-JP");
		}
	}

	// Format based on unit
	if (unit.includes("兆")) {
		return `${(value / 1e12).toFixed(2)}兆円`;
	} else if (unit.includes("億")) {
		return `${(value / 1e8).toFixed(0)}億円`;
	} else if (unit.includes("倍")) {
		return `${value.toFixed(2)}倍`;
	} else if (unit.includes("%")) {
		return `${value.toFixed(2)}%`;
	} else {
		return value.toLocaleString("ja-JP");
	}
}
