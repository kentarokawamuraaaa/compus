import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// タブに企業を追加
export const addCompanyToTab = mutation({
	args: {
		tabId: v.id("tabs"),
		companyCode: v.string(),
		companyName: v.string(),
	},
	handler: async (ctx, { tabId, companyCode, companyName }) => {
		// すでに追加されているか確認
		const existing = await ctx.db
			.query("tabCompanies")
			.withIndex("by_tab_company", (q) =>
				q.eq("tabId", tabId).eq("companyCode", companyCode),
			)
			.first();

		if (existing) {
			return existing._id; // すでに存在する場合はそのIDを返す
		}

		// 現在のタブ内の最大orderを取得
		const allCompanies = await ctx.db
			.query("tabCompanies")
			.withIndex("by_tab", (q) => q.eq("tabId", tabId))
			.order("desc")
			.take(1);

		const maxOrder = allCompanies.length > 0 ? allCompanies[0].order : -1;

		// 新規追加
		const companyId = await ctx.db.insert("tabCompanies", {
			tabId,
			companyCode,
			companyName,
			enabled: true,
			order: maxOrder + 1,
			addedAt: Date.now(),
			paste: "",
			parsed: "",
			summary: "",
		});

		return companyId;
	},
});

// タブから企業を削除
export const removeCompanyFromTab = mutation({
	args: {
		tabId: v.id("tabs"),
		companyCode: v.string(),
	},
	handler: async (ctx, { tabId, companyCode }) => {
		const company = await ctx.db
			.query("tabCompanies")
			.withIndex("by_tab_company", (q) =>
				q.eq("tabId", tabId).eq("companyCode", companyCode),
			)
			.first();

		if (company) {
			await ctx.db.delete(company._id);
		}
	},
});

// 企業のON/OFF状態を切り替え
export const toggleCompanyEnabled = mutation({
	args: {
		tabId: v.id("tabs"),
		companyCode: v.string(),
	},
	handler: async (ctx, { tabId, companyCode }) => {
		const company = await ctx.db
			.query("tabCompanies")
			.withIndex("by_tab_company", (q) =>
				q.eq("tabId", tabId).eq("companyCode", companyCode),
			)
			.first();

		if (company) {
			await ctx.db.patch(company._id, {
				enabled: !company.enabled,
			});
		}
	},
});

// 企業データを更新
export const updateCompanyData = mutation({
	args: {
		tabId: v.id("tabs"),
		companyCode: v.string(),
		paste: v.optional(v.string()),
		parsed: v.optional(v.string()),
		summary: v.optional(v.string()),
	},
	handler: async (ctx, { tabId, companyCode, paste, parsed, summary }) => {
		const company = await ctx.db
			.query("tabCompanies")
			.withIndex("by_tab_company", (q) =>
				q.eq("tabId", tabId).eq("companyCode", companyCode),
			)
			.first();

		if (company) {
			const updates: {
				paste?: string;
				parsed?: string;
				summary?: string;
			} = {};
			if (paste !== undefined) updates.paste = paste;
			if (parsed !== undefined) updates.parsed = parsed;
			if (summary !== undefined) updates.summary = summary;

			await ctx.db.patch(company._id, updates);
		}
	},
});

// タブ内の企業の並び順を更新
export const reorderCompaniesInTab = mutation({
	args: {
		tabId: v.id("tabs"),
		companyCodes: v.array(v.string()),
	},
	handler: async (ctx, { tabId, companyCodes }) => {
		for (let i = 0; i < companyCodes.length; i++) {
			const company = await ctx.db
				.query("tabCompanies")
				.withIndex("by_tab_company", (q) =>
					q.eq("tabId", tabId).eq("companyCode", companyCodes[i]),
				)
				.first();

			if (company) {
				await ctx.db.patch(company._id, { order: i });
			}
		}
	},
});

// タブ内のすべての企業を取得（order順）
export const getTabCompanies = query({
	args: {
		tabId: v.id("tabs"),
	},
	handler: async (ctx, { tabId }) => {
		return await ctx.db
			.query("tabCompanies")
			.withIndex("by_tab", (q) => q.eq("tabId", tabId))
			.collect();
	},
});

// タブ内のON（enabled=true）の企業のみを取得
export const getEnabledTabCompanies = query({
	args: {
		tabId: v.id("tabs"),
	},
	handler: async (ctx, { tabId }) => {
		const allCompanies = await ctx.db
			.query("tabCompanies")
			.withIndex("by_tab", (q) => q.eq("tabId", tabId))
			.collect();

		return allCompanies.filter((c) => c.enabled);
	},
});

// 特定の企業がタブ内に存在するかチェック
export const isCompanyInTab = query({
	args: {
		tabId: v.id("tabs"),
		companyCode: v.string(),
	},
	handler: async (ctx, { tabId, companyCode }) => {
		const company = await ctx.db
			.query("tabCompanies")
			.withIndex("by_tab_company", (q) =>
				q.eq("tabId", tabId).eq("companyCode", companyCode),
			)
			.first();

		return company !== null;
	},
});
