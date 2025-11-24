"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import YahooFinance from "yahoo-finance2";

// YahooFinanceインスタンスを作成
const yahooFinance = new YahooFinance();

interface HistoricalPoint {
	date: Date;
	close: number;
	high: number;
	low: number;
	open: number;
	volume: number;
}

export const fetchHistoricalData = action({
	args: {
		symbols: v.array(v.string()),
		period: v.union(
			v.literal("1mo"),
			v.literal("3mo"),
			v.literal("6mo"),
			v.literal("1y"),
			v.literal("2y"),
			v.literal("5y")
		),
		interval: v.optional(
			v.union(v.literal("1d"), v.literal("1wk"), v.literal("1mo"))
		),
	},
	handler: async (ctx, args) => {
		console.log(
			`[fetchHistoricalData] Starting fetch for ${args.symbols.length} symbols, period: ${args.period}`
		);

		const { symbols, period, interval = "1wk" } = args;

		if (symbols.length === 0) {
			console.log("[fetchHistoricalData] No symbols provided");
			throw new Error("シンボルが指定されていません");
		}

		// 日本株の場合、.Tサフィックスを追加
		const yahooSymbols = symbols.map((symbol) => {
			if (symbol.endsWith(".T")) return symbol;
			if (/^\d+$/.test(symbol)) return `${symbol}.T`;
			return symbol;
		});

		console.log("[fetchHistoricalData] Yahoo symbols:", yahooSymbols);

		const results: Record<
			string,
			{
				symbol: string;
				yahooSymbol: string;
				history: Array<{
					date: string;
					close: number;
					high: number;
					low: number;
					open: number;
					volume: number;
					psr?: number;
					per?: number;
					marketCap?: number;
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
			}
		> = {};

		// 各シンボルの履歴データを取得
		for (const symbol of yahooSymbols) {
			const originalSymbol = symbol.replace(".T", "");
			console.log(`[fetchHistoricalData] Fetching data for ${symbol}...`);

			try {
				// 履歴データ取得 (chart APIを使用)
				const queryOptions = {
					period1: getPeriodStartDate(period),
					period2: new Date(), // 現在まで
					interval,
				};

				console.log(
					`[fetchHistoricalData] Query options for ${symbol}:`,
					queryOptions
				);

				// chart()を使用 (historical()は非推奨)
				const chartResult = await yahooFinance.chart(symbol, queryOptions);

				console.log(
					`[fetchHistoricalData] Chart result for ${symbol}:`,
					{
						hasQuotes: !!chartResult.quotes,
						quotesLength: chartResult.quotes?.length || 0,
					}
				);

				// chart()の結果を変換 (closeがnullの場合はフィルタで除外)
				const priceHistory: HistoricalPoint[] = (chartResult.quotes || [])
					.filter((quote): quote is typeof quote & { close: number } => quote.close !== null && quote.close !== undefined)
					.map((quote) => ({
						date: new Date(quote.date),
						close: quote.close,
						high: quote.high ?? 0,
						low: quote.low ?? 0,
						open: quote.open ?? 0,
						volume: quote.volume ?? 0,
					}));

				console.log(
					`[fetchHistoricalData] Got ${priceHistory.length} historical points for ${symbol}`
				);

				// quoteSummaryで財務指標を取得
				const quote = (await yahooFinance.quoteSummary(symbol, {
					modules: ["defaultKeyStatistics", "summaryDetail", "financialData"],
				})) as {
					summaryDetail?: {
						marketCap?: number;
						trailingPE?: number;
						dividendYield?: { raw?: number };
					};
					financialData?: {
						totalRevenue?: number;
					};
					defaultKeyStatistics?: {
						returnOnEquity?: { raw?: number };
						priceToBook?: number;
						sharesOutstanding?: number;
					};
				};

				console.log(
					`[fetchHistoricalData] Got quote summary for ${symbol}`,
					{
						hasMarketCap: !!quote.summaryDetail?.marketCap,
						hasRevenue: !!quote.financialData?.totalRevenue,
						hasPE: !!quote.summaryDetail?.trailingPE,
						hasShares: !!quote.defaultKeyStatistics?.sharesOutstanding,
						trailingPE: quote.summaryDetail?.trailingPE,
					}
				);

				// 財務データ
				const currentMarketCap = quote.summaryDetail?.marketCap ?? null;
				const revenue = quote.financialData?.totalRevenue ?? null;
				const currentPSR = currentMarketCap && revenue ? currentMarketCap / revenue : null;
				const sharesOutstanding = quote.defaultKeyStatistics?.sharesOutstanding ?? null;
				const trailingPE = quote.summaryDetail?.trailingPE ?? null;

				// 最新株価を事前に取得
				const latestPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].close : 0;

				console.log(
					`[fetchHistoricalData] PER calculation for ${symbol}:`,
					{
						trailingPE,
						latestPrice,
						historyLength: priceHistory.length,
					}
				);

				// PSRとPERの時系列を計算
				const history = priceHistory.map((point) => {
					let psr: number | undefined = undefined;
					let per: number | undefined = undefined;
					let marketCap: number | undefined = undefined;

					// PSR計算: (株価 × 発行株数) / 売上高
					if (sharesOutstanding && revenue && point.close > 0) {
						marketCap = point.close * sharesOutstanding;
						psr = marketCap / revenue;
					}

					// PER計算: (その時点の株価 / 最新株価) × 最新PER
					if (trailingPE && trailingPE > 0 && latestPrice > 0 && point.close > 0) {
						per = (point.close / latestPrice) * trailingPE;
					}

					return {
						date: point.date.toISOString(),
						close: point.close,
						high: point.high,
						low: point.low,
						open: point.open,
						volume: point.volume,
						psr: psr,
						per: per,
						marketCap: marketCap,
					};
				});

				console.log(
					`[fetchHistoricalData] Calculated time series metrics for ${symbol}:`,
					{
						totalPoints: history.length,
						pointsWithPSR: history.filter(h => h.psr !== undefined).length,
						pointsWithPER: history.filter(h => h.per !== undefined).length,
						samplePER: history.slice(-3).map(h => ({ date: h.date, per: h.per })),
					}
				);

				results[originalSymbol] = {
					symbol: originalSymbol,
					yahooSymbol: symbol,
					history: history,
					currentMetrics: {
						per: trailingPE,
						psr: currentPSR,
						roe:
							quote.defaultKeyStatistics?.returnOnEquity?.raw !== undefined
								? quote.defaultKeyStatistics.returnOnEquity.raw * 100
								: null,
						marketCap: currentMarketCap,
						revenue: revenue,
						dividendYield: quote.summaryDetail?.dividendYield?.raw ?? null,
						priceToBook: quote.defaultKeyStatistics?.priceToBook ?? null,
					},
				};

				console.log(`[fetchHistoricalData] Successfully processed ${symbol}`);

				// Convexに保存
				await ctx.runMutation(internal.historicalData.save, {
					companyCode: originalSymbol,
					yahooSymbol: symbol,
					period,
					interval,
					data: JSON.stringify(results[originalSymbol].history),
					currentMetrics: JSON.stringify(results[originalSymbol].currentMetrics),
				});

				console.log(`[fetchHistoricalData] Saved to Convex: ${originalSymbol}`);
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				console.error(
					`[fetchHistoricalData] Error fetching data for ${symbol}:`,
					errorMessage
				);
				console.error("[fetchHistoricalData] Full error:", error);
			}
		}

		console.log(
			`[fetchHistoricalData] Completed. Successfully fetched ${Object.keys(results).length} out of ${symbols.length} symbols`
		);

		return {
			success: true,
			period,
			interval,
			data: results,
		};
	},
});

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
