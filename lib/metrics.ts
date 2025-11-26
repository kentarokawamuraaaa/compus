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
	const metrics: Record<string, number | null> = {};

	if (!parsed || !parsed.headers || !parsed.rows || parsed.rows.length === 0) {
		return { code, name, metrics };
	}

	const headers = parsed.headers;

	// Find the row matching the company code
	let row: string[] | Record<string, string> | undefined;

	for (const r of parsed.rows) {
		if (Array.isArray(r)) {
			// Array format: assume code is in first column
			if (r[0] === code) {
				row = r;
				break;
			}
		} else if (r && typeof r === "object") {
			// Object format: check code property
			const rowObj = r as Record<string, string>;
			if (rowObj.code === code) {
				row = rowObj;
				break;
			}
		}
	}

	// Fallback to first row if no match found (backward compatibility)
	if (!row && parsed.rows.length > 0) {
		row = parsed.rows[0];
	}

	if (!row) {
		return { code, name, metrics };
	}

	// Handle both array and object row formats
	if (Array.isArray(row)) {
		// Array format: row[i] corresponds to headers[i]
		for (let i = 0; i < headers.length; i++) {
			const header = headers[i];
			const value = row[i];
			if (value) {
				const parsedValue = parseJapaneseNumber(value);
				metrics[header] = parsedValue;
			}
		}
	} else {
		// Object format: row is an object with header names as keys
		for (const header of headers) {
			const value = row[header];
			if (value) {
				const parsedValue = parseJapaneseNumber(value);
				metrics[header] = parsedValue;
			}
		}
	}

	return { code, name, metrics };
}

/**
 * Calculate average metrics from multiple companies
 */
export function calculateAverages(
	companies: CompanyMetrics[]
): AverageMetrics {
	if (companies.length === 0) {
		return {};
	}

	// Collect all unique metric keys
	const allKeys = new Set<string>();
	for (const company of companies) {
		for (const key of Object.keys(company.metrics)) {
			allKeys.add(key);
		}
	}

	const averages: AverageMetrics = {};

	for (const key of allKeys) {
		const values = companies
			.map((company) => company.metrics[key])
			.filter((v): v is number => v !== null && !Number.isNaN(v));

		if (values.length > 0) {
			const sum = values.reduce((acc, val) => acc + val, 0);
			averages[key] = sum / values.length;
		} else {
			averages[key] = null;
		}
	}

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
