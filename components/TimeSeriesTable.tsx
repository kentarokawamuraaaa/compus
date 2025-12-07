"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

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

interface TimeSeriesTableProps {
	companies: CompanyRow[];
	historicalData?: Record<string, HistoricalDataPoint[]>;
	period?: PeriodType;
	onPeriodChange?: (period: PeriodType) => void;
	selectedCases?: CaseData[];
}

// 日付を表示用にフォーマット
function formatDate(isoDate: string): string {
	const date = new Date(isoDate);
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();
	return `${year}/${month}/${day}`;
}

type Pitch = "weekly" | "monthly" | "quarterly" | "yearly";

// ピッチに応じてデータを集計する関数
function aggregateByPitch(
	dates: string[],
	pitch: Pitch,
): { key: string; dates: string[] }[] {
	if (pitch === "weekly") {
		// 週次: そのまま各日付を返す
		return dates.map((date) => ({ key: date, dates: [date] }));
	}

	// グループ化のキーを生成
	const groups = new Map<string, string[]>();
	for (const date of dates) {
		const d = new Date(date);
		let key: string;
		switch (pitch) {
			case "monthly":
				key = `${d.getFullYear()}/${d.getMonth() + 1}`;
				break;
			case "quarterly": {
				const quarter = Math.floor(d.getMonth() / 3) + 1;
				key = `${d.getFullYear()}/Q${quarter}`;
				break;
			}
			case "yearly":
				key = `${d.getFullYear()}`;
				break;
			default:
				key = date;
		}
		if (!groups.has(key)) {
			groups.set(key, []);
		}
		groups.get(key)?.push(date);
	}

	// 各グループの最終日の値を使用するためのデータを返す
	return Array.from(groups.entries()).map(([key, groupDates]) => ({
		key,
		dates: groupDates.sort(), // 日付順にソート
	}));
}

export function TimeSeriesTable({
	companies,
	historicalData,
	period: _externalPeriod,
	onPeriodChange,
	selectedCases,
}: TimeSeriesTableProps) {
	const [metric, setMetric] = useState<string>("PSR");
	const [internalPeriod, setInternalPeriod] = useState<number>(6);
	const [pitch, setPitch] = useState<Pitch>("weekly");

	const metrics = ["PSR", "PER"];
	const periods = [
		{ label: "6ヶ月", value: 6, apiValue: "6mo" as const },
		{ label: "1年", value: 12, apiValue: "1y" as const },
		{ label: "2年", value: 24, apiValue: "2y" as const },
		{ label: "5年", value: 60, apiValue: "5y" as const },
	];
	const pitchOptions = [
		{ label: "週次", value: "weekly" as Pitch },
		{ label: "月次", value: "monthly" as Pitch },
		{ label: "四半期", value: "quarterly" as Pitch },
		{ label: "年次", value: "yearly" as Pitch },
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

	// テーブルデータを生成
	const tableData = (() => {
		if (!historicalData || Object.keys(historicalData).length === 0) {
			return {
				dates: [] as string[],
				rows: [] as { company: CompanyRow; values: (number | null)[] }[],
				averageValues: [] as (number | null)[],
				caseAverageRows: [] as {
					caseId: string;
					caseName: string;
					companyCount: number;
					values: (number | null)[];
				}[],
			};
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

		// ピッチに応じて日付をグループ化
		const aggregatedGroups = aggregateByPitch(sortedDates, pitch);

		// 企業ごとに、各期間の最終日の値を取得するヘルパー関数
		const getValueForGroup = (
			companyCode: string,
			groupDates: string[],
		): number | null => {
			const companyData = historicalData[companyCode] || [];
			// グループ内の最終日から順に有効な値を探す
			for (let i = groupDates.length - 1; i >= 0; i--) {
				const date = groupDates[i];
				const dataPoint = companyData.find((p) => p.date === date);
				if (dataPoint) {
					const value = metric === "PSR" ? dataPoint.psr : dataPoint.per;
					if (value !== undefined && value !== null && !Number.isNaN(value)) {
						return value;
					}
				}
			}
			return null;
		};

		// 各企業の行データを作成
		const rows = companiesWithData.map((company) => {
			const values = aggregatedGroups.map((group) =>
				getValueForGroup(company.code, group.dates),
			);

			return {
				company,
				values,
			};
		});

		// 平均値の行を計算
		const averageValues = aggregatedGroups.map((_group, groupIndex) => {
			const validValues = rows
				.map((row) => row.values[groupIndex])
				.filter((v): v is number => v !== null && !Number.isNaN(v));

			if (validValues.length > 0) {
				return validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
			}
			return null;
		});

		// ケース別平均値を計算
		const caseAverageRows = (selectedCases ?? []).map((caseData) => {
			// このケースに含まれる企業でhistoricalDataがある企業コード
			const caseCompanyCodes = caseData.companyCodes.filter(
				(code) => historicalData[code] && historicalData[code].length > 0,
			);

			const values = aggregatedGroups.map((group) => {
				const validValues: number[] = [];
				for (const code of caseCompanyCodes) {
					const value = getValueForGroup(code, group.dates);
					if (value !== null) {
						validValues.push(value);
					}
				}
				if (validValues.length > 0) {
					return (
						validValues.reduce((sum, v) => sum + v, 0) / validValues.length
					);
				}
				return null;
			});

			return {
				caseId: caseData.caseId,
				caseName: caseData.caseName,
				companyCount: caseCompanyCodes.length,
				values,
			};
		});

		// 表示用の日付ラベル
		const displayDates = aggregatedGroups.map((group) => group.key);

		return {
			dates: displayDates,
			rows,
			averageValues,
			caseAverageRows,
		};
	})();

	// テーブルをクリップボードにコピー
	const handleCopy = () => {
		const headers = ["企業", ...(tableData.dates ?? [])];
		const dataRows = [
			...tableData.rows.map((row) => [
				`${row.company.name}(${row.company.code})`,
				...row.values.map((v) => (v !== null ? v.toFixed(2) : "N/A")),
			]),
			[
				"平均",
				...tableData.averageValues.map((v) =>
					v !== null ? v.toFixed(2) : "N/A",
				),
			],
			...tableData.caseAverageRows.map((caseRow) => [
				`${caseRow.caseName}(${caseRow.companyCount}社)`,
				...caseRow.values.map((v) => (v !== null ? v.toFixed(2) : "N/A")),
			]),
		];

		// TSV形式で作成（Excelに貼り付けやすい）
		const tsv = [
			headers.join("\t"),
			...dataRows.map((row) => row.join("\t")),
		].join("\n");

		navigator.clipboard.writeText(tsv);
		alert("テーブルをクリップボードにコピーしました");
	};

	// CSVダウンロード
	const handleDownloadCSV = () => {
		const headers = ["企業", ...(tableData.dates ?? [])];
		const dataRows = [
			...tableData.rows.map((row) => [
				`${row.company.name}(${row.company.code})`,
				...row.values.map((v) => (v !== null ? v.toFixed(2) : "N/A")),
			]),
			[
				"平均",
				...tableData.averageValues.map((v) =>
					v !== null ? v.toFixed(2) : "N/A",
				),
			],
			...tableData.caseAverageRows.map((caseRow) => [
				`${caseRow.caseName}(${caseRow.companyCount}社)`,
				...caseRow.values.map((v) => (v !== null ? v.toFixed(2) : "N/A")),
			]),
		];

		const csv = [
			headers.join(","),
			...dataRows.map((row) => row.join(",")),
		].join("\n");

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
	if (!tableData.dates || tableData.dates.length === 0) {
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
						{/* ピッチ選択ボタン */}
						<div className="flex gap-1 border-l pl-2 ml-1">
							{pitchOptions.map((p) => (
								<Button
									key={p.value}
									variant={pitch === p.value ? "default" : "outline"}
									size="sm"
									onClick={() => setPitch(p.value)}
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
											{pitch === "weekly" ? formatDate(date) : date}
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
								{/* ケース別平均行（10色対応） */}
								{tableData.caseAverageRows.map((caseRow, caseIndex) => {
									const colors = [
										"bg-blue-50 dark:bg-blue-950",
										"bg-green-50 dark:bg-green-950",
										"bg-orange-50 dark:bg-orange-950",
										"bg-purple-50 dark:bg-purple-950",
										"bg-pink-50 dark:bg-pink-950",
										"bg-teal-50 dark:bg-teal-950",
										"bg-yellow-50 dark:bg-yellow-950",
										"bg-indigo-50 dark:bg-indigo-950",
										"bg-lime-50 dark:bg-lime-950",
										"bg-rose-50 dark:bg-rose-950",
									];
									return (
										<tr
											key={caseRow.caseId}
											className={`${colors[caseIndex % colors.length]} font-medium`}
										>
											<td className="border px-3 py-2">
												{caseRow.caseName}
												<div className="text-xs text-muted-foreground">
													({caseRow.companyCount}社)
												</div>
											</td>
											{tableData.dates.map((date, index) => (
												<td
													key={`case-${caseRow.caseId}-${date}`}
													className="border px-3 py-2 text-right"
												>
													{caseRow.values[index] !== null
														? caseRow.values[index]?.toFixed(2)
														: "N/A"}
												</td>
											))}
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</ScrollArea>
			</CardContent>
		</Card>
	);
}
