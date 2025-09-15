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
	type Parsed = { headers: string[]; rows: Array<Record<string, string>> };
	type CompanyState = {
		paste: string;
		parsed: Parsed | null;
		parsing: boolean;
		summary: Record<string, string> | null;
	};
	const [selectedList, setSelectedList] = useState<CompanyRow[]>([]);
	const [stateByCode, setStateByCode] = useState<Record<string, CompanyState>>(
		{},
	);
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

	const isSelected = useCallback(
		(code: string) => selectedList.some((c) => c.code === code),
		[selectedList],
	);

	const addCompany = useCallback((comp: CompanyRow) => {
		setSelectedList((list) => {
			if (list.some((c) => c.code === comp.code)) return list;
			return [...list, comp];
		});
		setStateByCode((s) => {
			if (s[comp.code]) return s;
			return {
				...s,
				[comp.code]: { paste: "", parsed: null, parsing: false, summary: null },
			};
		});
	}, []);

	const removeCompany = useCallback((code: string) => {
		setSelectedList((list) => list.filter((c) => c.code !== code));
		setStateByCode((s) => {
			const { [code]: _removed, ...rest } = s;
			return rest;
		});
	}, []);

	const setCompanyPaste = useCallback((code: string, value: string) => {
		setStateByCode((s) => ({
			...s,
			[code]: {
				...(s[code] ?? {
					paste: "",
					parsed: null,
					parsing: false,
					summary: null,
				}),
				paste: value,
			},
		}));
	}, []);

	const onParseFor = useCallback(
		async (code: string) => {
			const currentPaste = stateByCode[code]?.paste ?? "";
			setStateByCode((s) => ({
				...s,
				[code]: {
					...(s[code] ?? {
						paste: currentPaste,
						parsed: null,
						parsing: false,
						summary: null,
					}),
					parsing: true,
				},
			}));
			try {
				const res = await fetch("/api/parse", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ text: currentPaste }),
				});
				const data = await res.json();
				// Build summary from parsed rows for this company
				let summary: Record<string, string> | null = null;
				if (data && Array.isArray(data.rows)) {
					const selfCompany = selectedList.find((c) => c.code === code);
					const row = data.rows.find((r: Record<string, string>) => {
						const rc = String((r as Record<string, unknown>).code ?? "");
						const rn = String((r as Record<string, unknown>).name ?? "");
						return rc === code || (!!selfCompany && rn === selfCompany.name);
					});
					if (row) {
						const rr = row as Record<string, string>;
						const KEY_EV = "企業価値" as const;
						const KEY_MC = "時価総額" as const;
						const KEY_PER_KAI = "PER (会)" as const;
						const KEY_PER = "PER" as const;
						const KEY_SALES = "売上" as const;
						const KEY_OP = "営利" as const;
						const KEY_NET = "純利" as const;
						const KEY_ROE = "ROE" as const;
						const KEY_EQUITY = "自資本比" as const;
						const KEY_FEATURE = "特徴語" as const;
						const divKey =
							KEY_SALES in rr && "配当利予" in rr
								? ("配当利予" as const)
								: "配当利･予" in rr
									? ("配当利･予" as const)
									: ("配当利回り" as const);
						summary = {
							企業価値: String(rr[KEY_EV] ?? ""),
							時価総額: String(rr[KEY_MC] ?? ""),
							"PER (会)": String(rr[KEY_PER_KAI] ?? rr[KEY_PER] ?? ""),
							売上: String(rr[KEY_SALES] ?? ""),
							営利: String(rr[KEY_OP] ?? ""),
							純利: String(rr[KEY_NET] ?? ""),
							配当利予: String(rr[divKey] ?? ""),
							ROE: String(rr[KEY_ROE] ?? ""),
							自資本比: String(rr[KEY_EQUITY] ?? ""),
							特徴語: String(rr[KEY_FEATURE] ?? ""),
						};
					}
				}
				setStateByCode((s) => ({
					...s,
					[code]: {
						...(s[code] ?? {
							paste: currentPaste,
							parsed: null,
							parsing: false,
							summary: null,
						}),
						parsed: data,
						summary: summary ?? s[code]?.summary ?? null,
					},
				}));
			} finally {
				setStateByCode((s) => ({
					...s,
					[code]: {
						...(s[code] ?? {
							paste: currentPaste,
							parsed: null,
							parsing: false,
							summary: null,
						}),
						parsing: false,
					},
				}));
			}
		},
		[stateByCode, selectedList],
	);

	const openBuffettFor = useCallback((code: string) => {
		const url = `https://www.buffett-code.com/company/${code}/`;
		window.open(url, "_blank");
	}, []);

	return (
		<div className="min-h-screen p-6 sm:p-10 mx-auto flex flex-col gap-6">
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
									{results.map((c) => {
										const already = isSelected(c.code);
										return (
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
														already ? removeCompany(c.code) : addCompany(c)
													}
													className={`h-8 px-2 ${already ? "text-red-600" : "text-blue-600"}`}
												>
													{already ? "削除" : "追加"}
												</Button>
											</li>
										);
									})}
								</ul>
							)}
						</ScrollArea>
					</div>
					{selectedList.length > 0 && (
						<div className="text-sm text-gray-700 flex flex-wrap gap-2">
							{selectedList.map((c) => (
								<span
									key={c.code}
									className="inline-flex items-center gap-1 border rounded px-2 py-1"
								>
									{c.name} ({c.code})
									<Button
										variant="ghost"
										className="h-6 px-1 text-red-600"
										onClick={() => removeCompany(c.code)}
									>
										×
									</Button>
								</span>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			{selectedList.map((c) => {
				const st = stateByCode[c.code] ?? {
					paste: "",
					parsed: null,
					parsing: false,
					summary: null,
				};
				return (
					<Card key={c.code}>
						<CardContent className="flex flex-row gap-3">
							<div className="flex flex-col gap-3 min-w-0 flex-[1_1_320px]">
								<div className="flex items-center justify-between">
									<CardTitle>
										{c.name} ({c.code})
									</CardTitle>
									<Button
										variant="ghost"
										className="h-8 px-2 text-red-600"
										onClick={() => removeCompany(c.code)}
									>
										削除
									</Button>
								</div>
								<div className="flex items-center gap-2">
									<Button
										type="button"
										variant="outline"
										onClick={() => openBuffettFor(c.code)}
									>
										類似企業の情報を取得
									</Button>
									<Button
										type="button"
										onClick={() => onParseFor(c.code)}
										disabled={st.parsing || st.paste.trim().length === 0}
									>
										{st.parsing ? "変換中..." : "表に変換"}
									</Button>
								</div>
								<textarea
									className="border rounded p-2 min-h-40"
									placeholder="外部サイトでコピーしたブロックテキストを貼り付け"
									value={st.paste}
									onChange={(e) => setCompanyPaste(c.code, e.target.value)}
									disabled={st.parsing}
								/>
								{st.summary && (
									<table className="text-sm border rounded">
										<tbody>
											<tr>
												<th className="border px-2 py-1 text-left text-gray-500">
													コード
												</th>
												<td className="border px-2 py-1">{c.code}</td>
											</tr>
											<tr>
												<th className="border px-2 py-1 text-left text-gray-500">
													銘柄名
												</th>
												<td className="border px-2 py-1">{c.name}</td>
											</tr>
											{[
												"企業価値",
												"時価総額",
												"PER (会)",
												"売上",
												"営利",
												"純利",
												"配当利予",
												"ROE",
												"自資本比",
												"特徴語",
											].map((k) => (
												<tr key={`${c.code}-${k}`}>
													<th className="border px-2 py-1 text-left text-gray-500">
														{k}
													</th>
													<td className="border px-2 py-1">
														{st.summary?.[k] ?? ""}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								)}
							</div>

							<div className="flex flex-col gap-3 min-w-0 flex-[2_1_480px]">
								{st.parsed && (
									<div className="w-full overflow-auto">
										<ScrollArea
											className={st.summary ? "max-h-[70vh]" : "max-h-60"}
										>
											<table className="min-w-full border mt-2 whitespace-nowrap table-auto">
												<thead>
													<tr>
														<th className="border px-2 py-1 text-left" />
														<th className="border px-2 py-1 text-left">
															コード
														</th>
														<th className="border px-2 py-1 text-left">
															銘柄名
														</th>
														{st.parsed?.headers?.map((h) => (
															<th
																key={h}
																className="border px-2 py-1 text-left"
															>
																{h}
															</th>
														))}
													</tr>
												</thead>
												<tbody>
													{st.parsed?.rows?.map((r, idx) => (
														<tr
															key={`${r.code ?? r.name ?? "row"}-${idx}`}
															className="hover:bg-gray-50"
														>
															<td className="border px-2 py-1">
																<Button
																	variant="ghost"
																	onClick={() => {
																		if (r.code && r.name) {
																			const newCode = String(r.code);
																			const newName = String(r.name);
																			addCompany({
																				code: newCode,
																				name: newName,
																			});
																			const rAny = r as Record<
																				string,
																				string | undefined
																			>;
																			const dividendKey = "配当利予" as const;
																			const dividendYield = String(
																				rAny[dividendKey] ?? "",
																			);
																			setStateByCode((s) => ({
																				...s,
																				[newCode]: {
																					...(s[newCode] ?? {
																						paste: "",
																						parsed: null,
																						parsing: false,
																						summary: null,
																					}),
																					summary: {
																						企業価値: String(r.企業価値 ?? ""),
																						時価総額: String(r.時価総額 ?? ""),
																						"PER (会)": String(
																							r["PER (会)"] ?? r.PER ?? "",
																						),
																						売上: String(r.売上 ?? ""),
																						営利: String(r.営利 ?? ""),
																						純利: String(r.純利 ?? ""),
																						配当利予: dividendYield,
																						ROE: String(r.ROE ?? ""),
																						自資本比: String(r.自資本比 ?? ""),
																						特徴語: String(r.特徴語 ?? ""),
																					},
																				},
																			}));
																		}
																	}}
																	disabled={
																		!r.code ||
																		!r.name ||
																		isSelected(String(r.code))
																	}
																	className="text-blue-600 text-sm"
																>
																	{isSelected(String(r.code ?? ""))
																		? "追加済み"
																		: "追加"}
																</Button>
															</td>
															<td className="border px-2 py-1">
																{r.code ?? ""}
															</td>
															<td className="border px-2 py-1">
																{r.name ?? ""}
															</td>
															{st.parsed?.headers?.map((h) => (
																<td key={h} className="border px-2 py-1">
																	{r[h] ?? ""}
																</td>
															))}
														</tr>
													))}
												</tbody>
											</table>
										</ScrollArea>
									</div>
								)}
							</div>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
