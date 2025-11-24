"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy } from "lucide-react";

type CompanyRow = { code: string; name: string };

interface HistoricalDataPoint {
	date: string;
	close: number;
	per?: number;
	psr?: number;
}

interface TimeSeriesTableProps {
	companies: CompanyRow[];
	historicalData?: Record<string, HistoricalDataPoint[]>;
	period?: "1mo" | "3mo" | "6mo" | "1y";
	onPeriodChange?: (period: "1mo" | "3mo" | "6mo" | "1y") => void;
}

// 日付を表示用にフォーマット
function formatDate(isoDate: string): string {
	const date = new Date(isoDate);
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();
	return `${year}/${month}/${day}`;
}

export function TimeSeriesTable({
	companies,
	historicalData,
	period: externalPeriod,
	onPeriodChange,
}: TimeSeriesTableProps) {
	const [metric, setMetric] = useState<string>("PSR");
	const [internalPeriod, setInternalPeriod] = useState<number>(6);

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
		return companies.filter((company) => {
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
	}, [companies, historicalData, metric]);

	// テーブルデータを生成
	const tableData = useMemo(() => {
		if (!historicalData || Object.keys(historicalData).length === 0) {
			return { dates: [], rows: [], averageValues: [] };
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

		// 各企業の行データを作成
		const rows = companiesWithData.map((company) => {
			const companyData = historicalData[company.code] || [];
			const values = sortedDates.map((date) => {
				const dataPoint = companyData.find((p) => p.date === date);
				if (dataPoint) {
					const value = metric === "PSR" ? dataPoint.psr : dataPoint.per;
					return value !== undefined && value !== null && !Number.isNaN(value)
						? value
						: null;
				}
				return null;
			});

			return {
				company,
				values,
			};
		});

		// 平均値の行を計算
		const averageValues = sortedDates.map((date, dateIndex) => {
			const validValues = rows
				.map((row) => row.values[dateIndex])
				.filter((v): v is number => v !== null && !Number.isNaN(v));

			if (validValues.length > 0) {
				return validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
			}
			return null;
		});

		return {
			dates: sortedDates,
			rows,
			averageValues,
		};
	}, [historicalData, companiesWithData, metric]);

	// テーブルをクリップボードにコピー
	const handleCopy = () => {
		const headers = [
			"企業",
			...tableData.dates.map((d) => formatDate(d)),
		];
		const dataRows = [
			...tableData.rows.map((row) => [
				`${row.company.name}(${row.company.code})`,
				...row.values.map((v) => (v !== null ? v.toFixed(2) : "N/A")),
			]),
			[
				"平均",
				...tableData.averageValues.map((v) => (v !== null ? v.toFixed(2) : "N/A")),
			],
		];

		// TSV形式で作成（Excelに貼り付けやすい）
		const tsv = [headers.join("\t"), ...dataRows.map((row) => row.join("\t"))].join(
			"\n",
		);

		navigator.clipboard.writeText(tsv);
		alert("テーブルをクリップボードにコピーしました");
	};

	// CSVダウンロード
	const handleDownloadCSV = () => {
		const headers = [
			"企業",
			...tableData.dates.map((d) => formatDate(d)),
		];
		const dataRows = [
			...tableData.rows.map((row) => [
				`${row.company.name}(${row.company.code})`,
				...row.values.map((v) => (v !== null ? v.toFixed(2) : "N/A")),
			]),
			[
				"平均",
				...tableData.averageValues.map((v) => (v !== null ? v.toFixed(2) : "N/A")),
			],
		];

		const csv = [headers.join(","), ...dataRows.map((row) => row.join(","))].join(
			"\n",
		);

		const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
		const link = document.createElement("a");
		link.href = URL.createObjectURL(blob);
		link.download = `timeseries_${metric}_${new Date().toISOString().split("T")[0]}.csv`;
		link.click();
	};

	if (companies.length === 0) {
		return null;
	}

	// データが無い場合
	if (tableData.dates.length === 0) {
		return (
			<Card className="py-4">
				<CardHeader>
					<CardTitle>時系列データ表</CardTitle>
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
					<span>時系列データ表</span>
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
						<Button variant="outline" size="sm" onClick={handleCopy}>
							<Copy className="h-4 w-4 mr-2" />
							コピー
						</Button>
						<Button variant="outline" size="sm" onClick={handleDownloadCSV}>
							CSV
						</Button>
					</div>
				</CardTitle>
			</CardHeader>
			<CardContent className="px-2 sm:p-6">
				<ScrollArea className="h-[500px] w-full">
					<div className="overflow-x-auto">
						<table className="min-w-full border-collapse border text-sm">
							<thead className="sticky top-0 bg-background z-10">
								<tr className="bg-muted/50">
									<th className="border px-3 py-2 text-left font-medium min-w-[150px]">
										企業
									</th>
									{tableData.dates.map((date) => (
										<th
											key={date}
											className="border px-3 py-2 text-right font-medium min-w-[100px]"
										>
											{formatDate(date)}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{tableData.rows.map((row) => (
									<tr key={row.company.code} className="hover:bg-muted/30">
										<td className="border px-3 py-2 font-medium">
											{row.company.name}
											<div className="text-xs text-muted-foreground">
												({row.company.code})
											</div>
										</td>
										{tableData.dates.map((date, index) => (
											<td
												key={`${row.company.code}-${date}`}
												className="border px-3 py-2 text-right"
											>
												{row.values[index] !== null
													? row.values[index]?.toFixed(2)
													: "N/A"}
											</td>
										))}
									</tr>
								))}
								{/* 平均行 */}
								<tr className="bg-primary/10 font-medium">
									<td className="border px-3 py-2">平均</td>
									{tableData.dates.map((date, index) => (
										<td
											key={`avg-${date}`}
											className="border px-3 py-2 text-right"
										>
											{tableData.averageValues[index] !== null
												? tableData.averageValues[index]?.toFixed(2)
												: "N/A"}
										</td>
									))}
								</tr>
							</tbody>
						</table>
					</div>
				</ScrollArea>
			</CardContent>
		</Card>
	);
}
