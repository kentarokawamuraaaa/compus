"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	ChartLegend,
	ChartLegendContent,
	type ChartConfig,
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";

type CompanyRow = { code: string; name: string };

interface TimeSeriesChartProps {
	companies: CompanyRow[];
}

// 静的なダミーデータ（メトリクスごと）
const DUMMY_METRICS_DATA = {
	PSR: [
		{ month: "5月" },
		{ month: "6月" },
		{ month: "7月" },
		{ month: "8月" },
		{ month: "9月" },
		{ month: "10月" },
		{ month: "11月" },
		{ month: "12月" },
		{ month: "1月" },
		{ month: "2月" },
		{ month: "3月" },
		{ month: "4月" },
	] as Array<Record<string, number | string>>,
	売上: [
		{ month: "5月" },
		{ month: "6月" },
		{ month: "7月" },
		{ month: "8月" },
		{ month: "9月" },
		{ month: "10月" },
		{ month: "11月" },
		{ month: "12月" },
		{ month: "1月" },
		{ month: "2月" },
		{ month: "3月" },
		{ month: "4月" },
	] as Array<Record<string, number | string>>,
	時価総額: [
		{ month: "5月" },
		{ month: "6月" },
		{ month: "7月" },
		{ month: "8月" },
		{ month: "9月" },
		{ month: "10月" },
		{ month: "11月" },
		{ month: "12月" },
		{ month: "1月" },
		{ month: "2月" },
		{ month: "3月" },
		{ month: "4月" },
	] as Array<Record<string, number | string>>,
	PER: [
		{ month: "5月" },
		{ month: "6月" },
		{ month: "7月" },
		{ month: "8月" },
		{ month: "9月" },
		{ month: "10月" },
		{ month: "11月" },
		{ month: "12月" },
		{ month: "1月" },
		{ month: "2月" },
		{ month: "3月" },
		{ month: "4月" },
	] as Array<Record<string, number | string>>,
	ROE: [
		{ month: "5月" },
		{ month: "6月" },
		{ month: "7月" },
		{ month: "8月" },
		{ month: "9月" },
		{ month: "10月" },
		{ month: "11月" },
		{ month: "12月" },
		{ month: "1月" },
		{ month: "2月" },
		{ month: "3月" },
		{ month: "4月" },
	] as Array<Record<string, number | string>>,
};

// 企業コードごとのベース値（ダミーデータ生成用）
const COMPANY_BASE_VALUES: Record<
	string,
	{ psr: number; sales: number; marketCap: number; per: number; roe: number }
> = {
	SHIFT: { psr: 8.5, sales: 1200, marketCap: 10000, per: 25, roe: 12 },
	"7203": { psr: 0.6, sales: 30000, marketCap: 35000, per: 8, roe: 9 },
	"6758": { psr: 1.2, sales: 8500, marketCap: 10000, per: 15, roe: 7 },
	"9984": { psr: 2.5, sales: 6000, marketCap: 15000, per: 18, roe: 11 },
	"4063": { psr: 4.2, sales: 800, marketCap: 3400, per: 22, roe: 15 },
};

// ダミーデータの変動パターン（月ごとの変化率）
const MONTHLY_VARIATIONS = [
	0.95, 0.98, 1.02, 1.05, 1.03, 1.08, 1.12, 1.1, 1.15, 1.18, 1.2, 1.22,
];

// 企業コードに対してベース値を取得（存在しない場合はハッシュ値から生成）
function getBaseValues(code: string) {
	if (COMPANY_BASE_VALUES[code]) {
		return COMPANY_BASE_VALUES[code];
	}

	// ハッシュ値を生成
	let hash = 0;
	for (let i = 0; i < code.length; i++) {
		hash = (hash << 5) - hash + code.charCodeAt(i);
		hash = hash & hash;
	}
	const seed = Math.abs(hash) % 1000;

	return {
		psr: 1 + (seed % 10),
		sales: 500 + (seed % 500) * 10,
		marketCap: 2000 + (seed % 1000) * 10,
		per: 8 + (seed % 20),
		roe: 5 + (seed % 15),
	};
}

// ダミーデータを初期化
function initializeDummyData() {
	// PSRデータ
	MONTHLY_VARIATIONS.forEach((variation, index) => {
		for (const code of Object.keys(COMPANY_BASE_VALUES)) {
			const base = COMPANY_BASE_VALUES[code];
			DUMMY_METRICS_DATA.PSR[index][code] = Number.parseFloat(
				(base.psr * variation).toFixed(2),
			);
		}
	});

	// 売上データ
	MONTHLY_VARIATIONS.forEach((variation, index) => {
		for (const code of Object.keys(COMPANY_BASE_VALUES)) {
			const base = COMPANY_BASE_VALUES[code];
			DUMMY_METRICS_DATA.売上[index][code] = Math.round(base.sales * variation);
		}
	});

	// 時価総額データ
	MONTHLY_VARIATIONS.forEach((variation, index) => {
		for (const code of Object.keys(COMPANY_BASE_VALUES)) {
			const base = COMPANY_BASE_VALUES[code];
			DUMMY_METRICS_DATA.時価総額[index][code] = Math.round(
				base.marketCap * variation,
			);
		}
	});

	// PERデータ
	MONTHLY_VARIATIONS.forEach((variation, index) => {
		for (const code of Object.keys(COMPANY_BASE_VALUES)) {
			const base = COMPANY_BASE_VALUES[code];
			DUMMY_METRICS_DATA.PER[index][code] = Number.parseFloat(
				(base.per * variation).toFixed(2),
			);
		}
	});

	// ROEデータ
	MONTHLY_VARIATIONS.forEach((variation, index) => {
		for (const code of Object.keys(COMPANY_BASE_VALUES)) {
			const base = COMPANY_BASE_VALUES[code];
			DUMMY_METRICS_DATA.ROE[index][code] = Number.parseFloat(
				(base.roe * variation).toFixed(2),
			);
		}
	});
}

// 初期化実行
initializeDummyData();

export function TimeSeriesChart({ companies }: TimeSeriesChartProps) {
	const [metric, setMetric] = useState<string>("売上");
	const [period, setPeriod] = useState<number>(6);

	const metrics = ["PSR", "売上", "時価総額", "PER", "ROE"];
	const periods = [
		{ label: "3ヶ月", value: 3 },
		{ label: "6ヶ月", value: 6 },
		{ label: "1年", value: 12 },
	];

	// 選択されたメトリクスのデータを取得し、期間でフィルタリング
	const baseData =
		DUMMY_METRICS_DATA[metric as keyof typeof DUMMY_METRICS_DATA] ||
		DUMMY_METRICS_DATA.売上;
	const chartData = baseData.slice(-period).map((dataPoint) => {
		const newPoint: Record<string, number | string> = {
			month: dataPoint.month,
		};

		// 現在選択されている企業のデータのみを含める
		for (const company of companies) {
			if (dataPoint[company.code] !== undefined) {
				newPoint[company.code] = dataPoint[company.code];
			} else {
				// 存在しない企業コードの場合、動的に生成
				const base = getBaseValues(company.code);
				const monthIndex = baseData.indexOf(dataPoint);
				const variation = MONTHLY_VARIATIONS[monthIndex] || 1;

				if (metric === "PSR") {
					newPoint[company.code] = Number.parseFloat(
						(base.psr * variation).toFixed(2),
					);
				} else if (metric === "売上") {
					newPoint[company.code] = Math.round(base.sales * variation);
				} else if (metric === "時価総額") {
					newPoint[company.code] = Math.round(base.marketCap * variation);
				} else if (metric === "PER") {
					newPoint[company.code] = Number.parseFloat(
						(base.per * variation).toFixed(2),
					);
				} else if (metric === "ROE") {
					newPoint[company.code] = Number.parseFloat(
						(base.roe * variation).toFixed(2),
					);
				}
			}
		}

		return newPoint;
	});

	const chartConfig: ChartConfig = {};
	companies.forEach((company, index) => {
		chartConfig[company.code] = {
			label: company.name,
			color: `var(--chart-${(index % 5) + 1})`,
		};
	});

	if (companies.length === 0) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center justify-between flex-wrap gap-4">
					<span>時系列グラフ（ダミーデータ）</span>
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
									variant={period === p.value ? "default" : "outline"}
									size="sm"
									onClick={() => setPeriod(p.value)}
								>
									{p.label}
								</Button>
							))}
						</div>
					</div>
				</CardTitle>
			</CardHeader>
			<CardContent>
				<ChartContainer config={chartConfig} className="min-h-[300px] w-full">
					<LineChart accessibilityLayer data={chartData}>
						<CartesianGrid strokeDasharray="3 3" vertical={false} />
						<XAxis
							dataKey="month"
							tickLine={false}
							axisLine={false}
							tickMargin={8}
						/>
						<YAxis
							tickLine={false}
							axisLine={false}
							tickMargin={8}
							tickFormatter={(value) => {
								if (metric === "売上" || metric === "時価総額") {
									return `${value}億`;
								}
								return value.toString();
							}}
						/>
						<ChartTooltip content={<ChartTooltipContent />} />
						<ChartLegend content={<ChartLegendContent />} />
						{companies.map((company) => (
							<Line
								key={company.code}
								type="monotone"
								dataKey={company.code}
								stroke={`var(--color-${company.code})`}
								strokeWidth={2}
								dot={false}
							/>
						))}
					</LineChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}
