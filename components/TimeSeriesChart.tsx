"use client";

import { useMemo, useState } from "react";
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

interface TimeSeriesChartProps {
	companies: CompanyRow[];
	historicalData?: Record<string, HistoricalDataPoint[]>;
	period?: "1mo" | "3mo" | "6mo" | "1y";
	onPeriodChange?: (period: "1mo" | "3mo" | "6mo" | "1y") => void;
	selectedCases?: CaseData[];
}

// 日付を表示用にフォーマット
function formatDate(isoDate: string): string {
	const date = new Date(isoDate);
	const month = date.getMonth() + 1;
	const day = date.getDate();
	return `${month}/${day}`;
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

	const metrics = ["PSR", "PER"];
	const periods = [
		{ label: "3ヶ月", value: 3, apiValue: "3mo" as const },
		{ label: "6ヶ月", value: 6, apiValue: "6mo" as const },
		{ label: "1年", value: 12, apiValue: "1y" as const },
	];

	const handlePeriodChange = (value: number) => {
		setInternalPeriod(value);
		const apiValue = periods.find((p) => p.value === value)?.apiValue;
		if (apiValue && onPeriodChange) {
			onPeriodChange(apiValue);
		}
	};

	// 選択されたメトリクスのデータを持つ企業のみをフィルタ
	const companiesWithData = useMemo(() => {
		console.log("[TimeSeriesChart] Filtering companies for metric:", metric);
		console.log("[TimeSeriesChart] Total companies:", companies.length);
		console.log(
			"[TimeSeriesChart] Historical data keys:",
			Object.keys(historicalData || {}),
		);

		const filtered = companies.filter((company) => {
			const companyData = historicalData?.[company.code];
			if (!companyData || companyData.length === 0) {
				console.log(`[TimeSeriesChart] ${company.code}: No data`);
				return false;
			}

			// 少なくとも1つのデータポイントで選択されたメトリクスが有効かチェック
			const hasValidData = companyData.some((point) => {
				const value = metric === "PSR" ? point.psr : point.per;
				return value !== undefined && value !== null && !Number.isNaN(value);
			});

			console.log(
				`[TimeSeriesChart] ${company.code}: hasValidData=${hasValidData}`,
			);
			return hasValidData;
		});

		console.log(
			"[TimeSeriesChart] Filtered companies:",
			filtered.map((c) => c.code),
		);
		return filtered;
	}, [companies, historicalData, metric]);

	// 実データからchartDataを生成
	const chartData = useMemo(() => {
		console.log("[TimeSeriesChart] Generating chartData");
		console.log(
			"[TimeSeriesChart] companiesWithData:",
			companiesWithData.map((c) => c.code),
		);
		console.log("[TimeSeriesChart] selectedCases:", selectedCases.length);

		if (!historicalData || Object.keys(historicalData).length === 0) {
			console.log("[TimeSeriesChart] No historical data");
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
		console.log("[TimeSeriesChart] Total dates:", sortedDates.length);

		// 各日付のデータポイントを作成
		const data = sortedDates.map((date) => {
			const point: Record<string, number | string> = {
				date: formatDate(date),
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

			// 全体の平均値を計算（有効な値を持つ企業のみ）
			const values = companiesWithData
				.map((c) => point[c.code])
				.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));

			if (values.length > 0) {
				const average = values.reduce((sum, v) => sum + v, 0) / values.length;
				point.平均 = Number(average.toFixed(2));
			}

			// 各ケースの平均値を計算
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

				if (caseValues.length > 0) {
					const caseAverage =
						caseValues.reduce((sum, v) => sum + v, 0) / caseValues.length;
					point[caseKey] = Number(caseAverage.toFixed(2));
				}
			}

			return point;
		});

		console.log(
			"[TimeSeriesChart] Sample chartData (first 3 points):",
			data.slice(0, 3),
		);
		console.log(
			"[TimeSeriesChart] Chart has 平均 values:",
			data.filter((p) => p.平均 !== undefined).length,
		);
		return data;
	}, [historicalData, companiesWithData, metric, selectedCases]);

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

	// 各ケースの平均値の設定を追加
	const caseColors = ["#3b82f6", "#10b981", "#f59e0b"];
	selectedCases.forEach((caseData, index) => {
		const caseKey = `ケース_${caseData.caseName}`;
		chartConfig[caseKey] = {
			label: `${caseData.caseName}平均`,
			color: caseColors[index % caseColors.length],
		};
	});

	console.log("[TimeSeriesChart] chartConfig keys:", Object.keys(chartConfig));
	console.log("[TimeSeriesChart] showAverageLine:", showAverageLine);

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
				</div>
			</CardHeader>
			<CardContent className="px-2 sm:p-6">
				<ChartContainer
					config={chartConfig}
					className="aspect-auto h-[250px] w-full"
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
						/>
						<YAxis tickLine={false} axisLine={false} tickMargin={8} />
						<ChartTooltip content={<ChartTooltipContent />} />
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
									/>
								);
							})}
					</LineChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}
