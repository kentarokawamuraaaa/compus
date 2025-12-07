"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

type CompanyRow = { code: string; name: string };

interface HistoricalDataPoint {
	date: string;
	close: number;
	per?: number;
	psr?: number;
}

interface CaseData {
	caseId: string;
	caseName: string;
	companyCodes: string[];
}

type PeriodType = "6mo" | "1y" | "2y" | "5y";

interface TimeSeriesChartProps {
	companies: CompanyRow[];
	historicalData?: Record<string, HistoricalDataPoint[]>;
	period?: PeriodType;
	onPeriodChange?: (period: PeriodType) => void;
	selectedCases?: CaseData[];
}

// X軸ラベル用にフォーマット（期間に応じて形式を変更）
function formatAxisLabel(isoDate: string, periodMonths: number): string {
	const date = new Date(isoDate);
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const quarter = Math.floor(date.getMonth() / 3) + 1;

	// 2年以上: YYYY/Q形式（四半期）
	if (periodMonths >= 24) {
		return `${year}/Q${quarter}`;
	}
	// 1年: YYYY/M形式（月）
	if (periodMonths >= 12) {
		return `${year}/${month}`;
	}
	// 6ヶ月: M月形式
	return `${month}月`;
}

// 日付からグループキーを生成（期間に応じて月または四半期でグループ化）
function getGroupKey(isoDate: string, periodMonths: number): string {
	const date = new Date(isoDate);
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const quarter = Math.floor(date.getMonth() / 3) + 1;

	// 2年以上: 四半期でグループ化
	if (periodMonths >= 24) {
		return `${year}-Q${quarter}`;
	}
	// それ以外: 月でグループ化
	return `${year}-${String(month).padStart(2, "0")}`;
}

export function TimeSeriesChart({
	companies,
	historicalData,
	period: _externalPeriod,
	onPeriodChange,
	selectedCases = [],
}: TimeSeriesChartProps) {
	const [metric, setMetric] = useState<string>("PSR");
	const [internalPeriod, setInternalPeriod] = useState<number>(6);
	const [showIndividualLines, setShowIndividualLines] = useState<boolean>(true);
	const [showAverageLine, setShowAverageLine] = useState<boolean>(true);
	const [showCaseAverages, setShowCaseAverages] = useState<boolean>(true);
	const [yAxisMin, setYAxisMin] = useState<string>("");
	const [yAxisMax, setYAxisMax] = useState<string>("");

	const metrics = ["PSR", "PER"];
	const periods = [
		{ label: "6ヶ月", value: 6, apiValue: "6mo" as PeriodType },
		{ label: "1年", value: 12, apiValue: "1y" as PeriodType },
		{ label: "2年", value: 24, apiValue: "2y" as PeriodType },
		{ label: "5年", value: 60, apiValue: "5y" as PeriodType },
	];

	const handlePeriodChange = (value: number) => {
		setInternalPeriod(value);
		const apiValue = periods.find((p) => p.value === value)?.apiValue;
		if (apiValue && onPeriodChange) {
			onPeriodChange(apiValue);
		}
	};

	// 選択されたメトリクスのデータを持つ企業のみをフィルタ
	const companiesWithData = companies.filter((company) => {
		const companyData = historicalData?.[company.code];
		if (!companyData || companyData.length === 0) {
			return false;
		}

		// 少なくとも1つのデータポイントで選択されたメトリクスが有効かチェック
		const hasValidData = companyData.some((point) => {
			const value = metric === "PSR" ? point.psr : point.per;
			return value !== undefined && value !== null && !Number.isNaN(value);
		});

		return hasValidData;
	});

	// 実データからchartDataを生成
	const chartData = (() => {
		if (!historicalData || Object.keys(historicalData).length === 0) {
			return [];
		}

		// 全企業の日付の和集合を取得
		const allDates = new Set<string>();
		for (const points of Object.values(historicalData)) {
			for (const point of points) {
				allDates.add(point.date);
			}
		}

		// 日付順にソート
		const sortedDates = Array.from(allDates).sort();

		// 各日付のデータポイントを作成（グループキーとラベルも追加）
		const data = sortedDates.map((date) => {
			const point: Record<string, number | string> = {
				date: date, // 元のISO日付を保持
				groupKey: getGroupKey(date, internalPeriod),
				axisLabel: formatAxisLabel(date, internalPeriod),
			};

			// データを持つ企業のみのメトリクス値を追加
			for (const company of companiesWithData) {
				const companyData = historicalData[company.code];
				const dataPoint = companyData?.find((p) => p.date === date);

				if (dataPoint) {
					// 選択中のメトリクスに応じた値を設定
					const value = metric === "PSR" ? dataPoint.psr : dataPoint.per;
					if (value !== undefined && value !== null && !Number.isNaN(value)) {
						point[company.code] = value;
					}
				}
			}

			// 全体の平均値を計算（有効データが2社以上の場合のみ）
			const values = companiesWithData
				.map((c) => point[c.code])
				.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));

			// 2社以上の場合のみ平均を計算（1社以下はデータ不足としてnull）
			if (values.length >= 2) {
				const average = values.reduce((sum, v) => sum + v, 0) / values.length;
				point.平均 = Number(average.toFixed(2));
			}

			// 各ケースの平均値を計算（同様に2社以上の場合のみ）
			for (const caseData of selectedCases) {
				const caseKey = `ケース_${caseData.caseName}`;
				// このケースに含まれる企業で、historicalDataとcompaniesWithDataの両方に存在する企業のみを対象
				const caseCompanies = caseData.companyCodes.filter(
					(code) =>
						historicalData[code] &&
						companiesWithData.some((c) => c.code === code),
				);

				const caseValues = caseCompanies
					.map((code) => {
						const companyData = historicalData[code];
						const dataPoint = companyData?.find((p) => p.date === date);
						if (dataPoint) {
							const value = metric === "PSR" ? dataPoint.psr : dataPoint.per;
							return value;
						}
						return undefined;
					})
					.filter(
						(v): v is number =>
							v !== undefined && v !== null && !Number.isNaN(v),
					);

				// 2社以上の場合のみケース平均を計算
				if (caseValues.length >= 2) {
					const caseAverage =
						caseValues.reduce((sum, v) => sum + v, 0) / caseValues.length;
					point[caseKey] = Number(caseAverage.toFixed(2));
				}
			}

			return point;
		});

		return data;
	})();

	const chartConfig: ChartConfig = {};
	companiesWithData.forEach((company, index) => {
		chartConfig[company.code] = {
			label: company.name,
			color: `var(--chart-${(index % 5) + 1})`,
		};
	});

	// 平均値の設定を追加
	chartConfig.平均 = {
		label: "平均",
		color: "#ef4444",
	};

	// 各ケースの平均値の設定を追加（10色対応）
	const caseColors = [
		"#3b82f6", // blue
		"#22c55e", // green
		"#f97316", // orange
		"#a855f7", // purple
		"#ec4899", // pink
		"#14b8a6", // teal
		"#eab308", // yellow
		"#6366f1", // indigo
		"#84cc16", // lime
		"#f43f5e", // rose
	];
	selectedCases.forEach((caseData, index) => {
		const caseKey = `ケース_${caseData.caseName}`;
		chartConfig[caseKey] = {
			label: `${caseData.caseName}平均`,
			color: caseColors[index % caseColors.length],
		};
	});

	if (companies.length === 0) {
		return null;
	}

	// データが無い場合は表示しない
	if (chartData.length === 0) {
		return (
			<Card className="py-4">
				<CardHeader>
					<CardTitle>時系列グラフ</CardTitle>
				</CardHeader>
				<CardContent className="px-2 sm:p-6">
					<div className="text-center text-muted-foreground py-8">
						データを読み込み中...
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="py-4">
			<CardHeader>
				<CardTitle className="flex items-center justify-between flex-wrap gap-4">
					<span>時系列グラフ</span>
					<div className="flex gap-2 flex-wrap">
						<div className="flex gap-1">
							{metrics.map((m) => (
								<Button
									key={m}
									variant={metric === m ? "default" : "outline"}
									size="sm"
									onClick={() => setMetric(m)}
								>
									{m}
								</Button>
							))}
						</div>
						<div className="flex gap-1">
							{periods.map((p) => (
								<Button
									key={p.value}
									variant={internalPeriod === p.value ? "default" : "outline"}
									size="sm"
									onClick={() => handlePeriodChange(p.value)}
								>
									{p.label}
								</Button>
							))}
						</div>
					</div>
				</CardTitle>
				<div className="flex gap-4 items-center pt-4 flex-wrap">
					<div className="flex items-center gap-2">
						<Switch
							id="show-individual"
							checked={showIndividualLines}
							onCheckedChange={setShowIndividualLines}
						/>
						<label htmlFor="show-individual" className="text-sm cursor-pointer">
							個別企業
						</label>
					</div>
					<div className="flex items-center gap-2">
						<Switch
							id="show-average"
							checked={showAverageLine}
							onCheckedChange={setShowAverageLine}
						/>
						<label htmlFor="show-average" className="text-sm cursor-pointer">
							全体平均
						</label>
					</div>
					{selectedCases.length > 0 && (
						<div className="flex items-center gap-2">
							<Switch
								id="show-case-averages"
								checked={showCaseAverages}
								onCheckedChange={setShowCaseAverages}
							/>
							<label
								htmlFor="show-case-averages"
								className="text-sm cursor-pointer"
							>
								ケース平均
							</label>
						</div>
					)}
					{/* Y軸スケール調整 */}
					<div className="flex items-center gap-2 border-l pl-3 ml-2">
						<span className="text-sm text-muted-foreground">Y軸:</span>
						<Input
							type="number"
							placeholder="自動"
							value={yAxisMin}
							onChange={(e) => setYAxisMin(e.target.value)}
							className="w-16 h-7 text-xs"
						/>
						<span className="text-muted-foreground">〜</span>
						<Input
							type="number"
							placeholder="自動"
							value={yAxisMax}
							onChange={(e) => setYAxisMax(e.target.value)}
							className="w-16 h-7 text-xs"
						/>
					</div>
				</div>
			</CardHeader>
			<CardContent className="px-2 sm:p-6">
				<ChartContainer
					config={chartConfig}
					className="aspect-auto h-[500px] w-full"
				>
					<LineChart
						accessibilityLayer
						data={chartData}
						margin={{
							left: 12,
							right: 12,
						}}
					>
						<CartesianGrid strokeDasharray="3 3" vertical={false} />
						<XAxis
							dataKey="date"
							tickLine={false}
							axisLine={false}
							tickMargin={8}
							tickFormatter={(_value, index) => {
								// グループ（月または四半期）の最初のデータポイントでのみラベルを表示
								const currentPoint = chartData[index];
								if (!currentPoint) return "";
								const prevPoint = index > 0 ? chartData[index - 1] : null;
								// 前のポイントとグループが異なる場合のみラベルを表示
								if (
									!prevPoint ||
									currentPoint.groupKey !== prevPoint.groupKey
								) {
									return currentPoint.axisLabel as string;
								}
								return "";
							}}
							interval={0}
						/>
						<YAxis
							tickLine={false}
							axisLine={false}
							tickMargin={8}
							domain={[
								yAxisMin !== "" && !Number.isNaN(Number(yAxisMin))
									? Number(yAxisMin)
									: "auto",
								yAxisMax !== "" && !Number.isNaN(Number(yAxisMax))
									? Number(yAxisMax)
									: "auto",
							]}
						/>
						<ChartTooltip content={<ChartTooltipContent hideLabel />} />
						<ChartLegend content={<ChartLegendContent />} />
						{showIndividualLines &&
							companiesWithData.map((company) => (
								<Line
									key={company.code}
									type="monotone"
									dataKey={company.code}
									stroke={`var(--color-${company.code})`}
									strokeWidth={2}
									dot={false}
								/>
							))}
						{showAverageLine && (
							<Line
								key="平均"
								type="monotone"
								dataKey="平均"
								stroke="var(--color-平均)"
								strokeWidth={3}
								dot={false}
								strokeDasharray="5 5"
								connectNulls={false}
							/>
						)}
						{showCaseAverages &&
							selectedCases.map((caseData) => {
								const caseKey = `ケース_${caseData.caseName}`;
								return (
									<Line
										key={caseKey}
										type="monotone"
										dataKey={caseKey}
										stroke={`var(--color-${caseKey})`}
										strokeWidth={3}
										dot={false}
										connectNulls={false}
									/>
								);
							})}
					</LineChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}
