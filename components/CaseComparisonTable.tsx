"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";

interface CaseData {
	caseId: string;
	caseName: string;
	averages: Record<string, number | string | null>;
	companyCount: number;
}

interface CaseComparisonTableProps {
	cases: CaseData[];
}

export function CaseComparisonTable({ cases }: CaseComparisonTableProps) {
	console.log("[CaseComparisonTable] Received cases:", cases);

	if (cases.length === 0) {
		console.log("[CaseComparisonTable] No cases to display");
		return null;
	}

	// 全ケースから指標名を収集
	const allMetrics = new Set<string>();
	for (const caseData of cases) {
		console.log("[CaseComparisonTable] Processing case:", caseData.caseName);
		console.log("[CaseComparisonTable] Case averages:", caseData.averages);
		for (const key of Object.keys(caseData.averages)) {
			allMetrics.add(key);
		}
	}
	const metricNames = Array.from(allMetrics);
	console.log("[CaseComparisonTable] All metrics:", metricNames);

	// テーブルをクリップボードにコピー
	const handleCopy = () => {
		const headers = ["指標", ...cases.map((c) => c.caseName)];
		const rows = metricNames.map((metric) => {
			return [metric, ...cases.map((c) => c.averages[metric] ?? "N/A")];
		});

		// TSV形式で作成（Excelに貼り付けやすい）
		const tsv = [
			headers.join("\t"),
			...rows.map((row) => row.join("\t")),
		].join("\n");

		navigator.clipboard.writeText(tsv);
		alert("テーブルをクリップボードにコピーしました");
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center justify-between">
					<span>ケース比較表</span>
					<Button variant="outline" size="sm" onClick={handleCopy}>
						<Copy className="h-4 w-4 mr-2" />
						コピー
					</Button>
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="overflow-x-auto">
					<table className="min-w-full border-collapse border">
						<thead>
							<tr className="bg-muted/50">
								<th className="border px-4 py-2 text-left font-medium">
									指標
								</th>
								{cases.map((caseData) => (
									<th
										key={caseData.caseId}
										className="border px-4 py-2 text-left font-medium"
									>
										{caseData.caseName}
										<div className="text-xs font-normal text-muted-foreground">
											({caseData.companyCount}社)
										</div>
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{metricNames.map((metric) => (
								<tr key={metric} className="hover:bg-muted/30">
									<td className="border px-4 py-2 font-medium">{metric}</td>
									{cases.map((caseData) => {
										const value = caseData.averages[metric];
										console.log(`[CaseComparisonTable] Metric: ${metric}, Case: ${caseData.caseName}, Value:`, value, "Type:", typeof value);
										return (
											<td
												key={caseData.caseId}
												className="border px-4 py-2 text-right"
											>
												{value !== undefined && value !== null
													? typeof value === "number"
														? value.toLocaleString("ja-JP", {
																maximumFractionDigits: 2,
															})
														: value
													: "N/A"}
											</td>
										);
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>

				{/* 差分表示（2ケースの場合のみ） */}
				{cases.length === 2 && (
					<div className="mt-6">
						<h4 className="text-sm font-medium mb-2">
							差分 ({cases[1].caseName} - {cases[0].caseName})
						</h4>
						<div className="overflow-x-auto">
							<table className="min-w-full border-collapse border">
								<thead>
									<tr className="bg-muted/50">
										<th className="border px-4 py-2 text-left font-medium">
											指標
										</th>
										<th className="border px-4 py-2 text-left font-medium">
											差分
										</th>
										<th className="border px-4 py-2 text-left font-medium">
											変化率
										</th>
									</tr>
								</thead>
								<tbody>
									{metricNames.map((metric) => {
										const val1 = cases[0].averages[metric];
										const val2 = cases[1].averages[metric];

										if (
											typeof val1 !== "number" ||
											typeof val2 !== "number" ||
											val1 === 0
										) {
											return (
												<tr key={metric} className="hover:bg-muted/30">
													<td className="border px-4 py-2 font-medium">
														{metric}
													</td>
													<td className="border px-4 py-2 text-right text-muted-foreground">
														N/A
													</td>
													<td className="border px-4 py-2 text-right text-muted-foreground">
														N/A
													</td>
												</tr>
											);
										}

										const diff = val2 - val1;
										const changePercent = ((diff / val1) * 100).toFixed(1);
										const diffColor =
											diff > 0
												? "text-green-600"
												: diff < 0
													? "text-red-600"
													: "";

										return (
											<tr key={metric} className="hover:bg-muted/30">
												<td className="border px-4 py-2 font-medium">
													{metric}
												</td>
												<td className={`border px-4 py-2 text-right ${diffColor}`}>
													{diff > 0 ? "+" : ""}
													{diff.toLocaleString("ja-JP", {
														maximumFractionDigits: 2,
													})}
												</td>
												<td className={`border px-4 py-2 text-right ${diffColor}`}>
													{diff > 0 ? "+" : ""}
													{changePercent}%
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
