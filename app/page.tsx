"use client";
import debounce from "lodash.debounce";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

type CompanyRow = { code: string; name: string };

export default function Home() {
	const [queryText, setQueryText] = useState("");
	const [selected, setSelected] = useState<CompanyRow | null>(null);
	const [paste, setPaste] = useState("");
	type Parsed = { headers: string[]; rows: Array<Record<string, string>> };
	const [parsed, setParsed] = useState<Parsed | null>(null);
	const [results, setResults] = useState<CompanyRow[]>([]);
	const [searching, setSearching] = useState(false);
	const [searchError, setSearchError] = useState<string | null>(null);

	const debouncedSetQuery = useMemo(
		() => debounce((v: string) => setQueryText(v), 200),
		[],
	);

	useEffect(() => {
		const controller = new AbortController();
		const run = async () => {
			try {
				setSearching(true);
				setSearchError(null);
				const params = new URLSearchParams({ q: queryText, limit: "20" });
				const res = await fetch(`/api/companies/search?${params.toString()}`, {
					signal: controller.signal,
				});
				if (!res.ok) throw new Error("Search failed");
				const data = (await res.json()) as CompanyRow[];
				setResults(data);
			} catch (err: unknown) {
				if (
					typeof err === "object" &&
					err !== null &&
					"name" in err &&
					String((err as { name?: unknown }).name) === "AbortError"
				) {
					return;
				}
				setSearchError("検索に失敗しました");
			} finally {
				setSearching(false);
			}
		};
		run();
		return () => {
			controller.abort();
		};
	}, [queryText]);

	const onParse = useCallback(async () => {
		const res = await fetch("/api/parse", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ text: paste }),
		});
		const data = await res.json();
		setParsed(data);
	}, [paste]);

	const openBuffett = useCallback(() => {
		if (!selected?.code) return;
		const url = `https://www.buffett-code.com/company/${selected.code}/`;
		window.open(url, "_blank");
	}, [selected]);

	return (
		<div className="min-h-screen p-6 sm:p-10 max-w-5xl mx-auto flex flex-col gap-6">
			<h1 className="text-2xl font-semibold">分析支援ワークベンチ</h1>

			{/* <section className="border rounded p-4 flex flex-col gap-3">
				<h2 className="font-medium">企業マスター更新（XLS）</h2>
				<div className="flex gap-2 items-center flex-wrap">
					<input
						ref={fileInputRef}
						type="file"
						accept=".xls,.xlsx"
						onChange={(e) => {
							const f = e.target.files?.[0];
							if (f) onFile(f);
						}}
					/>
					<button
						type="button"
						className="border px-3 py-1 rounded"
						disabled={uploading}
						onClick={() => fileInputRef.current?.click()}
					>
						{uploading ? "Importing..." : "Upload & Replace"}
					</button>
				</div>
				<p className="text-sm text-gray-500">
					想定列: 日付, コード, 銘柄名, ...（他は任意）
				</p>
			</section> */}

			<Card>
				<CardHeader>
					<CardTitle>コンプス企業の設定（インクリメンタル検索）</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<Input
						placeholder="銘柄名の一部で検索"
						onChange={(e) => debouncedSetQuery(e.target.value)}
					/>
					<div className="border rounded">
						<ScrollArea className="max-h-60">
							{searching ? (
								<div className="p-3 space-y-2">
									<Skeleton className="h-5 w-2/3" />
									<Skeleton className="h-5 w-1/2" />
									<Skeleton className="h-5 w-3/4" />
								</div>
							) : searchError ? (
								<div className="p-3 text-sm text-red-600">{searchError}</div>
							) : results.length === 0 ? (
								<div className="p-3 text-sm text-gray-500">
									結果がありません
								</div>
							) : (
								<ul>
									{results.map((c) => (
										<li
											key={`${c.code}-${c.name}`}
											className="flex justify-between items-center px-3 py-2 hover:bg-gray-50"
										>
											<span>
												{c.name} ({c.code})
											</span>
											<Button
												variant="ghost"
												onClick={() =>
													setSelected({ code: c.code, name: c.name })
												}
												className="h-8 px-2 text-blue-600"
											>
												選択
											</Button>
										</li>
									))}
								</ul>
							)}
						</ScrollArea>
					</div>
					{selected && (
						<div className="text-sm text-gray-700">
							現在のコンプス企業: {selected.name} ({selected.code})
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>類似企業データの取得支援</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center gap-2">
						<Button type="button" disabled={!selected} onClick={openBuffett}>
							類似企業の情報を取得（外部サイトを開く）
						</Button>
						{selected && (
							<a
								className="text-sm text-blue-600"
								href={`https://www.buffett-code.com/company/${selected.code}/`}
								target="_blank"
								rel="noreferrer"
							>
								直接リンク
							</a>
						)}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>テキストを貼り付け → 表に変換</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<textarea
						className="border rounded p-2 min-h-40"
						placeholder="外部サイトでコピーしたブロックテキストを貼り付け"
						value={paste}
						onChange={(e) => setPaste(e.target.value)}
					/>
					<div>
						<Button type="button" onClick={onParse}>
							表に変換
						</Button>
					</div>

					{parsed && (
						<div className="overflow-auto">
							<table className="min-w-full border mt-2">
								<thead>
									<tr>
										<th className="border px-2 py-1 text-left">コード</th>
										<th className="border px-2 py-1 text-left">銘柄名</th>
										{parsed.headers?.map((h) => (
											<th key={h} className="border px-2 py-1 text-left">
												{h}
											</th>
										))}
										<th className="border px-2 py-1 text-left">操作</th>
									</tr>
								</thead>
								<tbody>
									{parsed.rows?.map((r, idx) => (
										<tr
											key={`${r.code ?? r.name ?? "row"}-${idx}`}
											className="hover:bg-gray-50"
										>
											<td className="border px-2 py-1">{r.code ?? ""}</td>
											<td className="border px-2 py-1">{r.name ?? ""}</td>
											{parsed.headers?.map((h) => (
												<td key={h} className="border px-2 py-1">
													{r[h] ?? ""}
												</td>
											))}
											<td className="border px-2 py-1">
												<Button
													variant="ghost"
													onClick={() => {
														if (r.code && r.name)
															setSelected({
																code: String(r.code),
																name: String(r.name),
															});
													}}
													className="text-blue-600 text-sm"
												>
													コンプス企業に変更
												</Button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
