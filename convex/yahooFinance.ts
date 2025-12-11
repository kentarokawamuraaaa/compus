"use node";

import { v } from "convex/values";
import YahooFinance from "yahoo-finance2";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";

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
			v.literal("5y"),
		),
		interval: v.optional(
			v.union(v.literal("1d"), v.literal("1wk"), v.literal("1mo")),
		),
	},
	handler: async (ctx, args) => {
		const { symbols, period, interval = "1wk" } = args;

		if (symbols.length === 0) {
			throw new Error("シンボルが指定されていません");
		}

		// 日本株の場合、.Tサフィックスを追加
		const yahooSymbols = symbols.map((symbol) => {
			if (symbol.endsWith(".T")) return symbol;
			if (/^\d+$/.test(symbol)) return `${symbol}.T`;
			return symbol;
		});

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

			try {
				// 履歴データ取得 (chart APIを使用)
				const queryOptions = {
					period1: getPeriodStartDate(period),
					period2: new Date(), // 現在まで
					interval,
				};

				// chart()を使用 (historical()は非推奨)
				const chartResult = await yahooFinance.chart(symbol, queryOptions);

				// chart()の結果を変換 (closeがnullの場合はフィルタで除外)
				const priceHistory: HistoricalPoint[] = (chartResult.quotes || [])
					.filter(
						(quote): quote is typeof quote & { close: number } =>
							quote.close !== null && quote.close !== undefined,
					)
					.map((quote) => ({
						date: new Date(quote.date),
						close: quote.close,
						high: quote.high ?? 0,
						low: quote.low ?? 0,
						open: quote.open ?? 0,
						volume: quote.volume ?? 0,
					}));

				// quoteSummaryで財務指標を取得（年次・四半期の損益計算書を含む）
				const quote = (await yahooFinance.quoteSummary(symbol, {
					modules: [
						"defaultKeyStatistics",
						"summaryDetail",
						"financialData",
						"incomeStatementHistory",
						"incomeStatementHistoryQuarterly",
					],
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
						trailingEps?: number;
					};
					incomeStatementHistory?: {
						incomeStatementHistory?: Array<{
							endDate?: Date;
							netIncome?: number;
							totalRevenue?: number;
						}>;
					};
					incomeStatementHistoryQuarterly?: {
						incomeStatementHistory?: Array<{
							endDate?: Date;
							netIncome?: number;
							totalRevenue?: number;
						}>;
					};
				};

				// 財務データ
				const currentMarketCap = quote.summaryDetail?.marketCap ?? null;
				const revenue = quote.financialData?.totalRevenue ?? null;
				const currentPSR =
					currentMarketCap && revenue ? currentMarketCap / revenue : null;
				const sharesOutstanding =
					quote.defaultKeyStatistics?.sharesOutstanding ?? null;

				// 年次損益計算書データ
				const annualStatements =
					quote.incomeStatementHistory?.incomeStatementHistory ?? [];
				// 四半期損益計算書データ
				const quarterlyStatements =
					quote.incomeStatementHistoryQuarterly?.incomeStatementHistory ?? [];

				// TTM純利益を計算（直近4四半期の純利益合計）
				let ttmNetIncome: number | null = null;
				if (quarterlyStatements.length >= 4) {
					ttmNetIncome = quarterlyStatements
						.slice(0, 4)
						.reduce((sum, stmt) => sum + (stmt.netIncome ?? 0), 0);
				}

				// 現在のPERを計算（時価総額 / TTM純利益）、フォールバックとしてYahooのtrailingPEを使用
				const calculatedPER =
					currentMarketCap && ttmNetIncome && ttmNetIncome > 0
						? currentMarketCap / ttmNetIncome
						: null;
				const trailingPE =
					calculatedPER ?? (quote.summaryDetail?.trailingPE ?? null);

				// 年次純利益マップを作成（年 → 純利益）
				// 決算期の年を使用（例: 2025年3月期 → 2025年）
				const annualNetIncomeMap = new Map<number, number>();
				for (const stmt of annualStatements) {
					if (stmt.endDate && stmt.netIncome !== undefined) {
						const fiscalYear = new Date(stmt.endDate).getFullYear();
						annualNetIncomeMap.set(fiscalYear, stmt.netIncome);
					}
				}

				// 年次売上高マップを作成（PSR計算用）
				const annualRevenueMap = new Map<number, number>();
				for (const stmt of annualStatements) {
					if (stmt.endDate && stmt.totalRevenue !== undefined) {
						const fiscalYear = new Date(stmt.endDate).getFullYear();
						annualRevenueMap.set(fiscalYear, stmt.totalRevenue);
					}
				}

				// 最新決算年を取得
				const latestFiscalYear =
					annualStatements.length > 0 && annualStatements[0].endDate
						? new Date(annualStatements[0].endDate).getFullYear()
						: new Date().getFullYear();

				// データポイントの年に対応する純利益を取得する関数
				// 直近年はTTM、過去は年次データを使用
				const getNetIncomeForDate = (date: Date): number | null => {
					const year = date.getFullYear();
					// 直近年または年次データがない場合はTTMを使用
					if (year >= latestFiscalYear) {
						return ttmNetIncome;
					}
					// 過去の年は年次データを使用（決算期でマッチング）
					// 例: 2023年のデータポイント → 2024年3月期（2024年）の純利益を使用
					const fiscalYear = year + 1;
					return annualNetIncomeMap.get(fiscalYear) ?? null;
				};

				// データポイントの年に対応する売上高を取得する関数
				const getRevenueForDate = (date: Date): number | null => {
					const year = date.getFullYear();
					if (year >= latestFiscalYear) {
						return revenue;
					}
					const fiscalYear = year + 1;
					return annualRevenueMap.get(fiscalYear) ?? null;
				};

				// PSRとPERの時系列を計算
				const history = priceHistory.map((point) => {
					let psr: number | undefined;
					let per: number | undefined;
					let marketCap: number | undefined;

					// 時価総額計算: 株価 × 発行株数
					if (sharesOutstanding && point.close > 0) {
						marketCap = point.close * sharesOutstanding;
					}

					// その時点での純利益と売上高を取得
					const netIncomeForPeriod = getNetIncomeForDate(point.date);
					const revenueForPeriod = getRevenueForDate(point.date);

					// PSR計算: 時価総額 / 売上高（その年の売上高を使用）
					if (marketCap && revenueForPeriod && revenueForPeriod > 0) {
						psr = marketCap / revenueForPeriod;
					}

					// PER計算: 時価総額 / 純利益（その年の純利益を使用）
					if (marketCap && netIncomeForPeriod && netIncomeForPeriod > 0) {
						per = marketCap / netIncomeForPeriod;
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

				// Convexに保存
				await ctx.runMutation(internal.historicalData.save, {
					companyCode: originalSymbol,
					yahooSymbol: symbol,
					period,
					interval,
					data: JSON.stringify(results[originalSymbol].history),
					currentMetrics: JSON.stringify(
						results[originalSymbol].currentMetrics,
					),
				});
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				console.error(`❌ ${symbol}: ${errorMessage}`);
			}
		}

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
