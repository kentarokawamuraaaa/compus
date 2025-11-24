import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";

interface HistoricalParams {
	symbols: string[]; // 企業コードの配列
	period: "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y";
	interval?: "1d" | "1wk" | "1mo";
}

interface HistoricalPoint {
	date: Date;
	close: number;
	high: number;
	low: number;
	open: number;
	volume: number;
}

export async function POST(req: NextRequest) {
	try {
		const body = (await req.json()) as HistoricalParams;
		const { symbols, period = "6mo", interval = "1wk" } = body;

		if (!symbols || symbols.length === 0) {
			return NextResponse.json(
				{ error: "シンボルが指定されていません" },
				{ status: 400 }
			);
		}

		// 日本株の場合、.Tサフィックスを追加
		const yahooSymbols = symbols.map((symbol) => {
			// 既に.Tがついている場合はそのまま、ない場合は追加
			if (symbol.endsWith(".T")) return symbol;
			// 数字のみの場合は日本株と判断して.Tを追加
			if (/^\d+$/.test(symbol)) return `${symbol}.T`;
			return symbol;
		});

		const results: Record<string, {
			symbol: string;
			yahooSymbol: string;
			history: Array<{
				date: string;
				close: number;
				high: number;
				low: number;
				open: number;
				volume: number;
			}>;
			currentMetrics: {
				per: number | null;
				psr: number | null;
				roe: number | null;
				marketCap: number | null;
				revenue: number | null;
				dividendYield: number | null;
				priceToBook: number | null;
			};
		} | { symbol: string; error: string }> = {};

		// 各シンボルの履歴データを取得
		for (const symbol of yahooSymbols) {
			try {
				const originalSymbol = symbol.replace(".T", "");

				// 履歴データ取得
				const queryOptions = { period1: getPeriodStartDate(period), interval };
				const history = (await yahooFinance.historical(symbol, queryOptions)) as HistoricalPoint[];

				// quoteSummaryで現在の財務指標を取得
				const quote = await yahooFinance.quoteSummary(symbol, {
					modules: ["defaultKeyStatistics", "summaryDetail", "financialData"],
				}) as {
					summaryDetail?: { marketCap?: number; trailingPE?: number; dividendYield?: { raw?: number } };
					financialData?: { totalRevenue?: number };
					defaultKeyStatistics?: { returnOnEquity?: { raw?: number }; priceToBook?: number };
				};

				// PSR計算用のデータ
				const marketCap = quote.summaryDetail?.marketCap ?? null;
				const revenue = quote.financialData?.totalRevenue ?? null;
				const psr = marketCap && revenue ? marketCap / revenue : null;

				results[originalSymbol] = {
					symbol: originalSymbol,
					yahooSymbol: symbol,
					history: history.map((point) => ({
						date: point.date.toISOString(),
						close: point.close,
						high: point.high,
						low: point.low,
						open: point.open,
						volume: point.volume,
					})),
					currentMetrics: {
						per: quote.summaryDetail?.trailingPE || null,
						psr: psr,
						roe:
							quote.defaultKeyStatistics?.returnOnEquity?.raw !== undefined
								? quote.defaultKeyStatistics.returnOnEquity.raw * 100
								: null,
						marketCap: marketCap,
						revenue: revenue,
						dividendYield: quote.summaryDetail?.dividendYield?.raw || null,
						priceToBook: quote.defaultKeyStatistics?.priceToBook ?? null,
					},
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "Unknown error";
				console.error(`Error fetching data for ${symbol}:`, errorMessage);
				results[symbol.replace(".T", "")] = {
					symbol: symbol.replace(".T", ""),
					error: errorMessage,
				};
			}
		}

		return NextResponse.json({
			success: true,
			period,
			interval,
			data: results,
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "データの取得に失敗しました";
		console.error("Historical API error:", error);
		return NextResponse.json(
			{ error: errorMessage },
			{ status: 500 }
		);
	}
}

function getPeriodStartDate(period: string): string {
	const now = new Date();
	const startDate = new Date(now);

	switch (period) {
		case "1mo":
			startDate.setMonth(now.getMonth() - 1);
			break;
		case "3mo":
			startDate.setMonth(now.getMonth() - 3);
			break;
		case "6mo":
			startDate.setMonth(now.getMonth() - 6);
			break;
		case "1y":
			startDate.setFullYear(now.getFullYear() - 1);
			break;
		case "2y":
			startDate.setFullYear(now.getFullYear() - 2);
			break;
		case "5y":
			startDate.setFullYear(now.getFullYear() - 5);
			break;
		default:
			startDate.setMonth(now.getMonth() - 6);
	}

	return startDate.toISOString().split("T")[0];
}
