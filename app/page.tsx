"use client";
import debounce from "lodash.debounce";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardAction,
	CardDescription,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import { TimeSeriesChart } from "@/components/TimeSeriesChart";
import { TimeSeriesTable } from "@/components/TimeSeriesTable";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import {
	Settings,
	Plus,
	BarChart3,
	FileText,
	ChevronDown,
	ChevronUp,
	Trash2,
} from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";

type CompanyRow = { code: string; name: string };

export default function Home() {
	const [queryText, setQueryText] = useState("");
	const [results, setResults] = useState<CompanyRow[]>([]);
	const [searching, setSearching] = useState(false);
	const [searchError, setSearchError] = useState<string | null>(null);
	const [activeTabId, setActiveTabId] = useState<Id<"tabs"> | null>(null);
	const [parsingCompany, setParsingCompany] = useState<string | null>(null);

	// Dialog state for tab settings (bulk editing)
	const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
	const [editingTabs, setEditingTabs] = useState<Record<string, string>>({});

	// Dialog state for new tab creation
	const [newTabDialogOpen, setNewTabDialogOpen] = useState(false);
	const [newTabName, setNewTabName] = useState("");

	// Dialog state for company search/add
	const [companyDialogOpen, setCompanyDialogOpen] = useState(false);

	// Case management state
	const [activeCaseId, setActiveCaseId] = useState<Id<"cases"> | null>(null);
	const [selectedCaseIds, setSelectedCaseIds] = useState<Set<Id<"cases">>>(
		new Set(),
	);
	const [caseDialogOpen, setCaseDialogOpen] = useState(false);
	const [newCaseName, setNewCaseName] = useState("");

	// Sub-tab state for chart vs details view (now includes table and timeseries)
	const [viewMode, setViewMode] = useState<
		"chart" | "table" | "timeseries" | "details"
	>("chart");

	// Historical data state
	const [chartPeriod, setChartPeriod] = useState<"1mo" | "3mo" | "6mo" | "1y">(
		"6mo",
	);
	const [historicalData, setHistoricalData] = useState<
		Record<
			string,
			Array<{
				date: string;
				close: number;
				per?: number;
				psr?: number;
				roe?: number;
			}>
		>
	>({});
	const [loadingHistorical, setLoadingHistorical] = useState(false);

	// Accordion state for expanded companies
	const [expandedCompanies, setExpandedCompanies] = useState<string[]>([]);

	// Helper to expand/collapse all companies
	const expandAll = () => {
		if (!tabCompanies) return;
		setExpandedCompanies(tabCompanies.map((c) => c.companyCode));
	};

	const collapseAll = () => {
		setExpandedCompanies([]);
	};

	// Convex queries and mutations
	const tabs = useQuery(api.tabs.listTabs);
	const tabCompanies = useQuery(
		api.tabCompanies.getTabCompanies,
		activeTabId ? { tabId: activeTabId } : "skip",
	);
	const createTab = useMutation(api.tabs.createTab);
	const updateTabName = useMutation(api.tabs.updateTabName);
	const deleteTab = useMutation(api.tabs.deleteTab);
	const addCompanyToTab = useMutation(api.tabCompanies.addCompanyToTab);
	const removeCompanyFromTab = useMutation(
		api.tabCompanies.removeCompanyFromTab,
	);
	const toggleCompanyEnabled = useMutation(
		api.tabCompanies.toggleCompanyEnabled,
	);
	const updateCompanyData = useMutation(api.tabCompanies.updateCompanyData);

	// Case queries and mutations
	const cases = useQuery(
		api.cases.list,
		activeTabId ? { tabId: activeTabId } : "skip",
	);
	const createCase = useMutation(api.cases.create);
	const deleteCase = useMutation(api.cases.deleteCase);
	const renameCase = useMutation(api.cases.rename);
	const duplicateCase = useMutation(api.cases.duplicate);
	const setActiveCase = useMutation(api.cases.setActiveCase);
	const updateCompanyInCase = useMutation(api.cases.updateCompanyInCase);

	// Yahoo Finance action
	const fetchYahooData = useAction(api.yahooFinance.fetchHistoricalData);

	const debouncedSetQuery = debounce((v: string) => setQueryText(v), 200);

	// 最初のタブを自動選択
	useEffect(() => {
		if (tabs && tabs.length > 0 && !activeTabId) {
			setActiveTabId(tabs[0]._id);
		}
	}, [tabs, activeTabId]);

	// 最初のケースを自動選択（タブが切り替わった時も）
	useEffect(() => {
		if (cases && cases.length > 0 && !activeCaseId) {
			setActiveCaseId(cases[0]._id);
		}
	}, [cases, activeCaseId]);

	// タブが変更されたら全企業のデータを自動取得
	useEffect(() => {
		if (activeTabId && tabCompanies) {
			fetchHistoricalData(chartPeriod);
		}
	}, [activeTabId, chartPeriod, tabCompanies]);

	// 企業検索
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

	// タブ作成（Plusアイコンから）
	const handleCreateTab = async () => {
		if (!newTabName.trim()) return;
		const tabId = await createTab({ name: newTabName.trim() });
		setNewTabName("");
		setNewTabDialogOpen(false);
		setActiveTabId(tabId);
	};

	// 設定ダイアログを開く（全タブの一括編集）
	const openSettingsDialog = () => {
		if (!tabs) return;
		// 現在のタブ名で初期化
		const tabNames: Record<string, string> = {};
		for (const tab of tabs) {
			tabNames[tab._id] = tab.name;
		}
		setEditingTabs(tabNames);
		setSettingsDialogOpen(true);
	};

	// タブ名の変更を記録
	const updateEditingTabName = (tabId: string, name: string) => {
		setEditingTabs((prev) => ({ ...prev, [tabId]: name }));
	};

	// すべてのタブ名を保存
	const handleSaveAllTabs = async () => {
		for (const [tabId, name] of Object.entries(editingTabs)) {
			if (name.trim()) {
				await updateTabName({ tabId: tabId as Id<"tabs">, name: name.trim() });
			}
		}
		setSettingsDialogOpen(false);
	};

	// タブ削除
	const handleDeleteTab = async (tabId: Id<"tabs">) => {
		if (confirm("このタブとタブ内のすべての企業データを削除しますか？")) {
			await deleteTab({ tabId });
			if (activeTabId === tabId) {
				setActiveTabId(null);
			}
			// editingTabsからも削除
			setEditingTabs((prev) => {
				const newTabs = { ...prev };
				delete newTabs[tabId];
				return newTabs;
			});
		}
	};

	// 企業追加（現在のアクティブタブとアクティブケースに）
	const handleAddCompany = async (comp: CompanyRow) => {
		if (!activeTabId) {
			alert("まずタブを選択してください");
			return;
		}
		await addCompanyToTab({
			tabId: activeTabId,
			companyCode: comp.code,
			companyName: comp.name,
		});

		// アクティブなケースにも追加
		if (activeCaseId) {
			await updateCompanyInCase({
				caseId: activeCaseId,
				companyCode: comp.code,
				shouldInclude: true,
			});
		}

		// 新規追加した企業を展開状態にする
		setExpandedCompanies((prev) => [...prev, comp.code]);
	};

	// 企業削除
	const handleRemoveCompany = async (companyCode: string) => {
		if (!activeTabId) return;
		await removeCompanyFromTab({ tabId: activeTabId, companyCode });
	};

	// 企業ON/OFF切り替え（アクティブなケースを更新）
	const handleToggleCompany = async (
		companyCode: string,
		newEnabled: boolean,
	) => {
		if (!activeCaseId) return;
		await updateCompanyInCase({
			caseId: activeCaseId,
			companyCode,
			shouldInclude: newEnabled,
		});
	};

	// 企業がタブ内に存在するかチェック
	const isCompanyInTab = (code: string) => {
		return tabCompanies?.some((c) => c.companyCode === code) ?? false;
	};

	// テキスト貼り付け
	const handlePaste = async (companyCode: string, value: string) => {
		if (!activeTabId) return;
		await updateCompanyData({
			tabId: activeTabId,
			companyCode,
			paste: value,
		});
	};

	// データパース
	const handleParse = async (companyCode: string) => {
		if (!activeTabId) return;

		const company = tabCompanies?.find((c) => c.companyCode === companyCode);
		if (!company || !company.paste.trim()) return;

		setParsingCompany(companyCode);
		try {
			const res = await fetch("/api/parse", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: company.paste }),
			});
			const data = await res.json();

			// サマリーを構築
			let summaryObj: Record<string, string> | null = null;
			if (data && Array.isArray(data.rows)) {
				const row = data.rows.find((r: Record<string, string>) => {
					const rc = String((r as Record<string, unknown>).code ?? "");
					const rn = String((r as Record<string, unknown>).name ?? "");
					return rc === companyCode || rn === company.companyName;
				});

				if (row) {
					const rr = row as Record<string, string>;
					const getProp = (key: string) => rr[key] ?? "";

					// 企業価値と売上からPSRを計算
					const calculatePSR = (): string => {
						const evStr = getProp("企業価値");
						const salesStr = getProp("売上");

						if (!evStr || !salesStr) return "N/A";

						// 企業価値を億円単位でパース（例: "124,976億円" → 124976）
						const parseEV = (str: string): number | null => {
							const match = str.match(/([\d,]+\.?\d*)\s*億円/);
							if (!match) return null;
							return Number.parseFloat(match[1].replace(/,/g, ""));
						};

						// 売上を百万円単位でパース（例: "779,707" → 779707）
						// 百万円 = 0.01億円なので、億円に変換するには 0.01 を掛ける
						const parseSales = (str: string): number | null => {
							const match = str.match(/([\d,]+\.?\d*)/);
							if (!match) return null;
							const salesInMillions = Number.parseFloat(
								match[1].replace(/,/g, ""),
							);
							// 百万円 → 億円に変換
							return salesInMillions * 0.01;
						};

						const ev = parseEV(evStr);
						const sales = parseSales(salesStr);

						if (ev === null || sales === null || sales === 0) return "N/A";

						const psr = ev / sales;
						return psr.toFixed(2);
					};

					summaryObj = {
						企業価値: String(getProp("企業価値")),
						時価総額: String(getProp("時価総額")),
						PSR: calculatePSR(),
						"PER (会)": String(getProp("PER (会)") || getProp("PER")),
						売上: String(getProp("売上")),
						営利: String(getProp("営利")),
						純利: String(getProp("純利")),
						配当利予: String(
							getProp("配当利予") ||
								getProp("配当利･予") ||
								getProp("配当利回り"),
						),
						ROE: String(getProp("ROE")),
						自資本比: String(getProp("自資本比")),
						特徴語: String(getProp("特徴語")),
					};
				}
			}

			// Convexに保存
			await updateCompanyData({
				tabId: activeTabId,
				companyCode,
				parsed: JSON.stringify(data),
				summary: summaryObj ? JSON.stringify(summaryObj) : "",
			});
		} finally {
			setParsingCompany(null);
		}
	};

	// Buffett Codeを開く
	const openBuffettFor = (code: string) => {
		const url = `https://www.buffett-code.com/company/${code}/`;
		window.open(url, "_blank");
	};

	// 有効な企業のみ取得（グラフ用）
	const enabledCompanies =
		tabCompanies
			?.filter((c) => c.enabled)
			.map((c) => ({
				code: c.companyCode,
				name: c.companyName,
			})) ?? [];

	// ケース保存ハンドラー
	const handleSaveCase = async () => {
		if (!activeTabId || !newCaseName.trim()) {
			alert("ケース名を入力してください");
			return;
		}
		const enabledCodes =
			tabCompanies?.filter((c) => c.enabled).map((c) => c.companyCode) ?? [];
		if (enabledCodes.length === 0) {
			alert("有効な企業を選択してください");
			return;
		}
		await createCase({
			tabId: activeTabId,
			name: newCaseName,
			companySet: enabledCodes,
		});
		setNewCaseName("");
		setCaseDialogOpen(false);
	};

	// ケース選択ハンドラー（複数選択対応）
	const handleSelectCase = async (caseId: Id<"cases">) => {
		setActiveCaseId(caseId);
		await setActiveCase({ caseId });
	};

	// ケース比較用の選択トグル
	const handleToggleCaseSelection = (caseId: Id<"cases">) => {
		setSelectedCaseIds((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(caseId)) {
				newSet.delete(caseId);
			} else {
				// 最大3ケースまで選択可能
				if (newSet.size >= 3) {
					alert("最大3ケースまで同時に選択できます");
					return prev;
				}
				newSet.add(caseId);
			}
			return newSet;
		});
	};

	// ケース削除ハンドラー
	const handleDeleteCase = async (caseId: Id<"cases">) => {
		try {
			await deleteCase({ caseId });
			// 削除後、activeCaseIdをnullにして最初のケースが自動選択されるようにする
			if (activeCaseId === caseId) {
				setActiveCaseId(null);
			}
		} catch (error) {
			alert(
				error instanceof Error ? error.message : "ケースの削除に失敗しました",
			);
		}
	};

	// 履歴データ取得ハンドラー（タブ内の全企業データを取得）
	const fetchHistoricalData = async (period: "1mo" | "3mo" | "6mo" | "1y") => {
		if (!activeTabId || !tabCompanies) {
			return;
		}

		// タブ内の全企業のコードを取得
		const allCompaniesInTab = tabCompanies.filter(
			(tc: { tabId: Id<"tabs">; companyCode: string }) =>
				tc.tabId === activeTabId,
		);
		const allSymbols = allCompaniesInTab.map(
			(tc: { companyCode: string }) => tc.companyCode,
		);

		if (allSymbols.length === 0) {
			return;
		}

		setLoadingHistorical(true);
		try {
			// Convex Actionを呼び出し（全企業のデータを一括取得）
			const result = await fetchYahooData({
				symbols: allSymbols,
				period,
				interval: "1wk",
			});

			if (result.success && result.data) {
				// データをステートに保存
				const formatted: Record<
					string,
					Array<{
						date: string;
						close: number;
						per?: number;
						psr?: number;
						roe?: number;
					}>
				> = {};

				for (const [code, companyData] of Object.entries(result.data)) {
					const data = companyData as {
						history: Array<{
							date: string;
							close: number;
							high: number;
							low: number;
							open: number;
							volume: number;
							per?: number;
							psr?: number;
						}>;
					};
					formatted[code] = data.history;
				}

				setHistoricalData(formatted);
			}
		} catch (error) {
			console.error("[fetchHistoricalData] Error:", error);
			alert(
				`履歴データの取得に失敗しました: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		} finally {
			setLoadingHistorical(false);
		}
	};

	// 期間変更ハンドラー
	const handleChartPeriodChange = (period: "1mo" | "3mo" | "6mo" | "1y") => {
		setChartPeriod(period);
		fetchHistoricalData(period);
	};

	// タブ読み込み中の場合はスピナーを表示
	if (tabs === undefined) {
		return (
			<div className="min-h-screen p-6 sm:p-10 mx-auto flex items-center justify-center">
				<Spinner className="size-8" />
			</div>
		);
	}

	return (
		<div className="min-h-screen p-6 sm:p-10 mx-auto flex flex-col gap-6">
			<h1 className="text-2xl font-semibold">Comps分析</h1>

			{/* タブと企業一覧 */}
			{tabs && tabs.length > 0 ? (
				<Tabs
					value={activeTabId ?? ""}
					onValueChange={(v) => setActiveTabId(v as Id<"tabs">)}
				>
					<div className="flex items-center gap-2 flex-wrap">
						<TabsList className="flex-wrap h-auto">
							{tabs.map((tab) => (
								<TabsTrigger key={tab._id} value={tab._id}>
									{tab.name}
								</TabsTrigger>
							))}
							{/* Settings icon for bulk editing all tabs */}
							<Button
								variant="ghost"
								size="sm"
								className="h-9 w-9 p-0"
								onClick={openSettingsDialog}
							>
								<Settings className="h-4 w-4" />
							</Button>
							{/* Plus icon to add new tab */}
							<Button
								variant="ghost"
								size="sm"
								className="h-9 w-9 p-0"
								onClick={() => setNewTabDialogOpen(true)}
							>
								<Plus className="h-4 w-4" />
							</Button>
						</TabsList>
					</div>

					{tabs.map((tab) => (
						<TabsContent key={tab._id} value={tab._id} className="space-y-6">
							{/* ケース管理セクション */}
							<Card>
								<CardHeader>
									<CardTitle>保存済みケース</CardTitle>
									<CardDescription>
										チェックボックスで複数ケース（最大3つ）を選択すると、グラフとテーブルで比較できます
									</CardDescription>
									<CardAction>
										<Button
											variant="outline"
											size="sm"
											onClick={() => setCaseDialogOpen(true)}
										>
											現在のケースを保存
										</Button>
									</CardAction>
								</CardHeader>
								<CardContent>
									{cases && cases.length > 0 ? (
										<div className="space-y-4">
											{/* ケースリスト */}
											<div className="space-y-2">
												{cases.map((caseItem) => (
													<div
														key={caseItem._id}
														className={`flex items-center gap-3 border rounded p-3 hover:bg-muted/50 transition-colors ${
															activeCaseId === caseItem._id
																? "bg-primary/10 border-primary"
																: ""
														}`}
													>
														{/* 比較用チェックボックス */}
														<Checkbox
															checked={selectedCaseIds.has(caseItem._id)}
															onCheckedChange={() =>
																handleToggleCaseSelection(caseItem._id)
															}
															aria-label={`Compare case: ${caseItem.name}`}
														/>

														{/* ケース情報 */}
														<button
															type="button"
															className="flex-1 text-left cursor-pointer"
															onClick={() => handleSelectCase(caseItem._id)}
															aria-label={`Select case: ${caseItem.name}`}
														>
															<div className="font-medium">
																{caseItem.name}
																{activeCaseId === caseItem._id && (
																	<span className="ml-2 text-xs text-primary">
																		(アクティブ)
																	</span>
																)}
															</div>
															<div className="text-xs text-muted-foreground">
																{caseItem.companySet.length}社 -{" "}
																{new Date(
																	caseItem.createdAt,
																).toLocaleDateString("ja-JP")}
															</div>
														</button>

														{/* 削除ボタン */}
														<Button
															variant="ghost"
															size="sm"
															onClick={() => handleDeleteCase(caseItem._id)}
															aria-label={`Delete case: ${caseItem.name}`}
														>
															<Trash2 className="h-4 w-4" />
														</Button>
													</div>
												))}
											</div>

											{/* 選択中のケース表示 */}
											{selectedCaseIds.size > 0 && (
												<div className="border-t pt-3 mt-3">
													<div className="text-sm font-medium mb-2">
														比較中のケース ({selectedCaseIds.size})
													</div>
													<div className="flex flex-wrap gap-2">
														{Array.from(selectedCaseIds).map((id) => {
															const caseItem = cases.find((c) => c._id === id);
															if (!caseItem) return null;
															return (
																<span
																	key={id}
																	className="inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary rounded px-2 py-1 text-xs"
																>
																	{caseItem.name}
																	<button
																		type="button"
																		onClick={() =>
																			handleToggleCaseSelection(id)
																		}
																		className="hover:text-primary/70"
																		aria-label={`Remove ${caseItem.name} from comparison`}
																	>
																		×
																	</button>
																</span>
															);
														})}
													</div>
												</div>
											)}
										</div>
									) : (
										<p className="text-gray-500 text-sm">
											保存済みのケースがありません。現在の企業選択を保存してください。
										</p>
									)}
								</CardContent>
							</Card>

							{/* 企業ON/OFFリスト */}
							<Card>
								<CardHeader className="flex flex-row items-center justify-between">
									<CardTitle>
										コンプス企業（{tabCompanies?.length ?? 0}社）
									</CardTitle>
									<Button
										variant="ghost"
										size="sm"
										className="h-8 w-8 p-0"
										onClick={() => setCompanyDialogOpen(true)}
									>
										<Plus className="h-4 w-4" />
									</Button>
								</CardHeader>
								<CardContent>
									{tabCompanies && tabCompanies.length > 0 ? (
										<div className="flex flex-wrap gap-2">
											{tabCompanies.map((c) => (
												<span
													key={c.companyCode}
													className={`inline-flex items-center gap-2 border rounded px-2 py-1 ${!c.enabled ? "opacity-50" : ""}`}
												>
													<Switch
														checked={c.enabled}
														onCheckedChange={(newEnabled) =>
															handleToggleCompany(c.companyCode, newEnabled)
														}
														className="h-4"
													/>
													{c.companyName} ({c.companyCode})
													<Button
														variant="ghost"
														className="h-6 px-1 text-red-600"
														onClick={() => handleRemoveCompany(c.companyCode)}
													>
														×
													</Button>
												</span>
											))}
										</div>
									) : (
										<p className="text-gray-500 text-sm">
											企業が登録されていません。右上の +
											ボタンから追加してください。
										</p>
									)}
								</CardContent>
							</Card>

							{/* サブタブ: グラフ vs テーブル vs 時系列テーブル vs 企業詳細 */}
							<Tabs
								value={viewMode}
								onValueChange={(v) =>
									setViewMode(v as "chart" | "table" | "timeseries" | "details")
								}
							>
								<TabsList className="w-full">
									<TabsTrigger value="chart">
										<BarChart3 className="h-4 w-4 mr-2" />
										グラフ
									</TabsTrigger>
									<TabsTrigger value="timeseries">
										<FileText className="h-4 w-4 mr-2" />
										テーブル
									</TabsTrigger>
									<TabsTrigger value="details">
										<FileText className="h-4 w-4 mr-2" />
										企業詳細
									</TabsTrigger>
								</TabsList>

								{/* グラフタブ */}
								<TabsContent value="chart" className="mt-6">
									{enabledCompanies.length > 0 ? (
										<div className="space-y-4">
											{loadingHistorical && (
												<div className="flex items-center gap-2 text-sm text-muted-foreground">
													<Spinner className="h-4 w-4" />
													<span>データを読み込み中...</span>
												</div>
											)}
											{!loadingHistorical &&
												Object.keys(historicalData).length > 0 && (
													<div className="text-sm text-muted-foreground">
														{Object.keys(historicalData).length}
														社のデータを表示中
													</div>
												)}
											<TimeSeriesChart
												companies={enabledCompanies}
												historicalData={historicalData}
												period={chartPeriod}
												onPeriodChange={handleChartPeriodChange}
												selectedCases={Array.from(selectedCaseIds)
													.map((id) => {
														const caseItem = cases?.find((c) => c._id === id);
														if (!caseItem) return null;
														return {
															caseId: id,
															caseName: caseItem.name,
															companyCodes: caseItem.companySet,
														};
													})
													.filter(
														(c): c is NonNullable<typeof c> => c !== null,
													)}
											/>
										</div>
									) : (
										<Card>
											<CardContent className="p-6">
												<p className="text-gray-500 text-center">
													有効な企業がありません。
													<br />
													上の企業リストでスイッチをONにしてください。
												</p>
											</CardContent>
										</Card>
									)}
								</TabsContent>

								{/* 時系列テーブルタブ */}
								<TabsContent value="timeseries" className="mt-6">
									{enabledCompanies.length > 0 ? (
										<div className="space-y-4">
											{loadingHistorical && (
												<div className="flex items-center gap-2 text-sm text-muted-foreground">
													<Spinner className="h-4 w-4" />
													<span>データを読み込み中...</span>
												</div>
											)}
											<TimeSeriesTable
												companies={enabledCompanies}
												historicalData={historicalData}
												period={chartPeriod}
												onPeriodChange={handleChartPeriodChange}
												selectedCases={Array.from(selectedCaseIds)
													.map((id) => {
														const caseItem = cases?.find((c) => c._id === id);
														if (!caseItem) return null;
														return {
															caseId: id,
															caseName: caseItem.name,
															companyCodes: caseItem.companySet,
														};
													})
													.filter(
														(c): c is NonNullable<typeof c> => c !== null,
													)}
											/>
										</div>
									) : (
										<Card>
											<CardContent className="p-6">
												<p className="text-gray-500 text-center">
													有効な企業がありません。
													<br />
													上の企業リストでスイッチをONにしてください。
												</p>
											</CardContent>
										</Card>
									)}
								</TabsContent>

								{/* 企業詳細タブ */}
								<TabsContent value="details" className="mt-6 space-y-6">
									{tabCompanies && tabCompanies.length > 0 ? (
										<>
											{/* 展開/折りたたみボタン */}
											<div className="flex gap-2 justify-end">
												<Button variant="outline" size="sm" onClick={expandAll}>
													<ChevronDown className="h-4 w-4 mr-1" />
													すべて展開
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={collapseAll}
												>
													<ChevronUp className="h-4 w-4 mr-1" />
													すべて折りたたむ
												</Button>
											</div>

											{/* 各企業のアコーディオン */}
											<Accordion
												type="multiple"
												value={expandedCompanies}
												onValueChange={setExpandedCompanies}
											>
												{tabCompanies.map((c) => {
													const parsed = c.parsed ? JSON.parse(c.parsed) : null;
													const summary = c.summary
														? JSON.parse(c.summary)
														: null;
													const isParsing = parsingCompany === c.companyCode;

													return (
														<AccordionItem
															key={c.companyCode}
															value={c.companyCode}
														>
															<Card>
																<AccordionTrigger className="px-6 py-4 hover:no-underline">
																	<div className="flex items-center justify-between w-full pr-4">
																		<div className="flex items-center gap-4">
																			<CardTitle className="text-lg">
																				{c.companyName} ({c.companyCode})
																			</CardTitle>
																		</div>
																		{summary && (
																			<div className="flex gap-6 text-sm text-muted-foreground">
																				{Object.entries(summary)
																					.filter(([key]) => {
																						const hiddenColumns = [
																							"配当利予",
																							"ROE",
																							"自資本比",
																							"特徴語",
																						];
																						return !hiddenColumns.includes(key);
																					})
																					.slice(0, 5)
																					.map(([key, value]) => (
																						<span
																							key={key}
																							className="whitespace-nowrap"
																						>
																							<span className="font-medium">
																								{key}:
																							</span>{" "}
																							{String(value)}
																						</span>
																					))}
																			</div>
																		)}
																	</div>
																</AccordionTrigger>
																<AccordionContent>
																	<CardContent className="flex flex-row gap-3 pt-0">
																		<div className="flex flex-col gap-3 min-w-0 flex-[1_1_320px]">
																			<div className="flex items-center gap-2 justify-end">
																				<Button
																					variant="ghost"
																					className="h-8 px-2 text-red-600"
																					onClick={() =>
																						handleRemoveCompany(c.companyCode)
																					}
																				>
																					削除
																				</Button>
																			</div>
																			<div className="flex items-center gap-2">
																				<Button
																					type="button"
																					variant="outline"
																					onClick={() =>
																						openBuffettFor(c.companyCode)
																					}
																				>
																					類似企業の情報を取得
																				</Button>
																				<Button
																					type="button"
																					onClick={() =>
																						handleParse(c.companyCode)
																					}
																					disabled={
																						isParsing ||
																						c.paste.trim().length === 0
																					}
																				>
																					{isParsing ? "変換中..." : "表に変換"}
																				</Button>
																			</div>
																			<textarea
																				className="border rounded p-2 min-h-40"
																				placeholder="外部サイトでコピーしたブロックテキストを貼り付け"
																				value={c.paste}
																				onChange={(e) =>
																					handlePaste(
																						c.companyCode,
																						e.target.value,
																					)
																				}
																				disabled={isParsing}
																			/>
																			{summary && (
																				<table className="text-sm border rounded">
																					<tbody>
																						<tr>
																							<th className="border px-2 py-1 text-left text-gray-500">
																								コード
																							</th>
																							<td className="border px-2 py-1">
																								{c.companyCode}
																							</td>
																						</tr>
																						<tr>
																							<th className="border px-2 py-1 text-left text-gray-500">
																								銘柄名
																							</th>
																							<td className="border px-2 py-1">
																								{c.companyName}
																							</td>
																						</tr>
																						{Object.entries(summary)
																							.filter(([key]) => {
																								// 非表示にするカラムをフィルタリング
																								const hiddenColumns = [
																									"配当利予",
																									"ROE",
																									"自資本比",
																									"特徴語",
																								];
																								return !hiddenColumns.includes(
																									key,
																								);
																							})
																							.map(([key, value]) => (
																								<tr key={key}>
																									<th className="border px-2 py-1 text-left text-gray-500">
																										{key}
																									</th>
																									<td className="border px-2 py-1">
																										{String(value)}
																									</td>
																								</tr>
																							))}
																					</tbody>
																				</table>
																			)}
																		</div>

																		<div className="flex flex-col gap-3 min-w-0 flex-[2_1_480px]">
																			{parsed &&
																				(() => {
																					// ヘッダーをフィルタリングして準備
																					const hiddenColumns = [
																						"配当利予",
																						"配当利･予",
																						"配当利回り",
																						"ROE",
																						"自資本比",
																						"特徴語",
																					];
																					const filteredHeaders = (
																						parsed?.headers || []
																					).filter(
																						(h: string) =>
																							!hiddenColumns.includes(h),
																					);

																					// PSR計算用のヘルパー関数
																					const calculatePSRFromRow = (
																						row: Record<string, string>,
																					): string => {
																						const evStr = row.企業価値 || "";
																						const salesStr = row.売上 || "";

																						if (!evStr || !salesStr)
																							return "N/A";

																						// 企業価値を億円単位でパース（例: "124,976億円" → 124976）
																						const parseEV = (
																							str: string,
																						): number | null => {
																							const match =
																								str.match(
																									/([\d,]+\.?\d*)\s*億円/,
																								);
																							if (!match) return null;
																							return Number.parseFloat(
																								match[1].replace(/,/g, ""),
																							);
																						};

																						// 売上を百万円単位でパース（例: "779,707" → 779707）
																						// 百万円 = 0.01億円なので、億円に変換するには 0.01 を掛ける
																						const parseSales = (
																							str: string,
																						): number | null => {
																							const match =
																								str.match(/([\d,]+\.?\d*)/);
																							if (!match) return null;
																							const salesInMillions =
																								Number.parseFloat(
																									match[1].replace(/,/g, ""),
																								);
																							// 百万円 → 億円に変換
																							return salesInMillions * 0.01;
																						};

																						const ev = parseEV(evStr);
																						const sales = parseSales(salesStr);

																						if (
																							ev === null ||
																							sales === null ||
																							sales === 0
																						)
																							return "N/A";

																						const psr = ev / sales;
																						return psr.toFixed(2);
																					};

																					// 企業価値と売上の両方が存在するかチェック
																					const hasEVAndSales =
																						filteredHeaders.includes(
																							"企業価値",
																						) &&
																						filteredHeaders.includes("売上");

																					// PSRを挿入する位置を見つける（PERの左 = 時価総額の後）
																					const displayHeaders = [
																						...filteredHeaders,
																					];
																					if (hasEVAndSales) {
																						// PERまたはPER (会)の位置を探す
																						const perIndex =
																							displayHeaders.findIndex(
																								(h) =>
																									h === "PER" ||
																									h === "PER (会)" ||
																									h.startsWith("PER"),
																							);
																						if (perIndex !== -1) {
																							// PERの直前に挿入
																							displayHeaders.splice(
																								perIndex,
																								0,
																								"PSR",
																							);
																						} else {
																							// PERが見つからない場合は時価総額の後に挿入
																							const marketCapIndex =
																								displayHeaders.indexOf(
																									"時価総額",
																								);
																							if (marketCapIndex !== -1) {
																								displayHeaders.splice(
																									marketCapIndex + 1,
																									0,
																									"PSR",
																								);
																							}
																						}
																					}

																					return (
																						<div className="w-full overflow-auto">
																							<ScrollArea
																								className={
																									summary
																										? "max-h-[70vh]"
																										: "max-h-60"
																								}
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
																											{displayHeaders.map(
																												(h: string) => (
																													<th
																														key={h}
																														className="border px-2 py-1 text-left"
																													>
																														{h}
																													</th>
																												),
																											)}
																										</tr>
																									</thead>
																									<tbody>
																										{parsed?.rows?.map(
																											(
																												r: Record<
																													string,
																													string
																												>,
																												idx: number,
																											) => {
																												const rowCode = String(
																													r.code ?? "",
																												);
																												const rowName = String(
																													r.name ?? "",
																												);
																												const isAlreadyAdded =
																													tabCompanies?.some(
																														(tc) =>
																															tc.companyCode ===
																															rowCode,
																													) ?? false;

																												return (
																													<tr
																														key={`${r.code ?? r.name ?? "row"}-${idx}`}
																														className="hover:bg-gray-50"
																													>
																														<td className="border px-2 py-1">
																															<Button
																																variant="ghost"
																																onClick={async () => {
																																	if (
																																		rowCode &&
																																		rowName &&
																																		activeTabId
																																	) {
																																		// 企業をタブに追加
																																		await handleAddCompany(
																																			{
																																				code: rowCode,
																																				name: rowName,
																																			},
																																		);

																																		// 行データからサマリーを作成してPSRも計算
																																		const getRowValue =
																																			(
																																				key: string,
																																			) =>
																																				String(
																																					r[
																																						key
																																					] ??
																																						"",
																																				);
																																		const summaryData =
																																			{
																																				企業価値:
																																					getRowValue(
																																						"企業価値",
																																					),
																																				時価総額:
																																					getRowValue(
																																						"時価総額",
																																					),
																																				PSR: calculatePSRFromRow(
																																					r,
																																				),
																																				"PER (会)":
																																					getRowValue(
																																						"PER (会)",
																																					) ||
																																					getRowValue(
																																						"PER",
																																					),
																																				売上: getRowValue(
																																					"売上",
																																				),
																																				営利: getRowValue(
																																					"営利",
																																				),
																																				純利: getRowValue(
																																					"純利",
																																				),
																																				配当利予:
																																					getRowValue(
																																						"配当利予",
																																					) ||
																																					getRowValue(
																																						"配当利･予",
																																					) ||
																																					getRowValue(
																																						"配当利回り",
																																					),
																																				ROE: getRowValue(
																																					"ROE",
																																				),
																																				自資本比:
																																					getRowValue(
																																						"自資本比",
																																					),
																																				特徴語:
																																					getRowValue(
																																						"特徴語",
																																					),
																																			};

																																		// サマリーデータを保存
																																		await updateCompanyData(
																																			{
																																				tabId:
																																					activeTabId,
																																				companyCode:
																																					rowCode,
																																				summary:
																																					JSON.stringify(
																																						summaryData,
																																					),
																																			},
																																		);
																																	}
																																}}
																																disabled={
																																	!rowCode ||
																																	!rowName ||
																																	isAlreadyAdded
																																}
																																className="text-blue-600 text-sm h-auto py-1 px-2"
																															>
																																{isAlreadyAdded
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
																														{displayHeaders.map(
																															(h: string) => (
																																<td
																																	key={h}
																																	className="border px-2 py-1"
																																>
																																	{h === "PSR"
																																		? calculatePSRFromRow(
																																				r,
																																			)
																																		: (r[h] ??
																																			"")}
																																</td>
																															),
																														)}
																													</tr>
																												);
																											},
																										)}
																									</tbody>
																								</table>
																							</ScrollArea>
																						</div>
																					);
																				})()}
																		</div>
																	</CardContent>
																</AccordionContent>
															</Card>
														</AccordionItem>
													);
												})}
											</Accordion>
										</>
									) : (
										<Card>
											<CardContent className="p-6">
												<p className="text-gray-500 text-center">
													企業が登録されていません。
													<br />
													上の企業リストの + ボタンから追加してください。
												</p>
											</CardContent>
										</Card>
									)}
								</TabsContent>
							</Tabs>
						</TabsContent>
					))}
				</Tabs>
			) : (
				<Card>
					<CardContent className="flex flex-col items-center justify-center p-6 gap-3">
						<p className="text-gray-500 text-center">
							タブがありません。下のボタンから新しいタブを作成してください。
						</p>
						<Button
							variant="outline"
							size="lg"
							className="flex items-center gap-2"
							onClick={() => setNewTabDialogOpen(true)}
						>
							<Plus className="h-4 w-4" />
							タブを作成
						</Button>
					</CardContent>
				</Card>
			)}

			{/* タブ設定ダイアログ（一括編集） */}
			<Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>タブ一括設定</DialogTitle>
					</DialogHeader>
					<ScrollArea className="max-h-[60vh] py-4">
						<div className="space-y-3">
							{tabs?.map((tab) => (
								<div key={tab._id} className="flex items-center gap-2">
									<Input
										value={editingTabs[tab._id] ?? tab.name}
										onChange={(e) =>
											updateEditingTabName(tab._id, e.target.value)
										}
										className="flex-1"
									/>
									<Button
										variant="destructive"
										size="sm"
										onClick={() => handleDeleteTab(tab._id)}
									>
										削除
									</Button>
								</div>
							))}
						</div>
					</ScrollArea>
					<DialogFooter>
						<Button onClick={handleSaveAllTabs}>保存</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* 新規タブ作成ダイアログ */}
			<Dialog open={newTabDialogOpen} onOpenChange={setNewTabDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>新規タブ作成</DialogTitle>
					</DialogHeader>
					<div className="py-4">
						<label htmlFor="new-tab-name" className="text-sm font-medium">
							タブ名
						</label>
						<Input
							id="new-tab-name"
							value={newTabName}
							onChange={(e) => setNewTabName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									handleCreateTab();
								}
							}}
							placeholder="タブ名を入力"
							className="mt-2"
							autoFocus
						/>
					</div>
					<DialogFooter>
						<Button onClick={handleCreateTab} disabled={!newTabName.trim()}>
							作成
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ケース保存ダイアログ */}
			<Dialog open={caseDialogOpen} onOpenChange={setCaseDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>ケースを保存</DialogTitle>
					</DialogHeader>
					<div className="py-4">
						<label htmlFor="new-case-name" className="text-sm font-medium">
							ケース名
						</label>
						<Input
							id="new-case-name"
							value={newCaseName}
							onChange={(e) => setNewCaseName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									handleSaveCase();
								}
							}}
							placeholder="例: ケース1"
							className="mt-2"
							autoFocus
						/>
						<p className="text-xs text-muted-foreground mt-2">
							現在有効な企業（{enabledCompanies.length}社）を保存します
						</p>
					</div>
					<DialogFooter>
						<Button onClick={handleSaveCase} disabled={!newCaseName.trim()}>
							保存
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* 企業追加ダイアログ */}
			<Dialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>企業を追加</DialogTitle>
					</DialogHeader>
					<div className="py-4 space-y-3">
						{!activeTabId ? (
							<p className="text-sm text-amber-600">
								タブを選択してから企業を追加してください
							</p>
						) : (
							<>
								<Input
									placeholder="銘柄名の一部で検索"
									onChange={(e) => debouncedSetQuery(e.target.value)}
								/>
								<div className="border rounded">
									<ScrollArea className="max-h-96">
										{searching ? (
											<div className="p-3 space-y-2">
												<Skeleton className="h-5 w-2/3" />
												<Skeleton className="h-5 w-1/2" />
												<Skeleton className="h-5 w-3/4" />
											</div>
										) : searchError ? (
											<div className="p-3 text-sm text-red-600">
												{searchError}
											</div>
										) : results.length === 0 ? (
											<div className="p-3 text-sm text-gray-500">
												結果がありません
											</div>
										) : (
											<ul>
												{results.map((c) => {
													const already = isCompanyInTab(c.code);
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
																onClick={() => {
																	if (already) {
																		handleRemoveCompany(c.code);
																	} else {
																		handleAddCompany(c);
																	}
																}}
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
							</>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
