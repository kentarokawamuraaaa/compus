import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// タブを作成
export const createTab = mutation({
	args: {
		name: v.string(),
	},
	handler: async (ctx, { name }) => {
		// 現在の最大orderを取得
		const allTabs = await ctx.db.query("tabs").order("desc").take(1);
		const maxOrder = allTabs.length > 0 ? allTabs[0].order : -1;

		const tabId = await ctx.db.insert("tabs", {
			name,
			order: maxOrder + 1,
			createdAt: Date.now(),
		});

		return tabId;
	},
});

// タブ名を更新
export const updateTabName = mutation({
	args: {
		tabId: v.id("tabs"),
		name: v.string(),
	},
	handler: async (ctx, { tabId, name }) => {
		await ctx.db.patch(tabId, { name });
	},
});

// タブを削除（関連するtabCompaniesも削除）
export const deleteTab = mutation({
	args: {
		tabId: v.id("tabs"),
	},
	handler: async (ctx, { tabId }) => {
		// 関連するtabCompaniesをすべて削除
		const companies = await ctx.db
			.query("tabCompanies")
			.withIndex("by_tab", (q) => q.eq("tabId", tabId))
			.collect();

		for (const company of companies) {
			await ctx.db.delete(company._id);
		}

		// タブを削除
		await ctx.db.delete(tabId);
	},
});

// タブの並び順を更新
export const reorderTabs = mutation({
	args: {
		tabIds: v.array(v.id("tabs")),
	},
	handler: async (ctx, { tabIds }) => {
		// 各タブのorderを更新
		for (let i = 0; i < tabIds.length; i++) {
			await ctx.db.patch(tabIds[i], { order: i });
		}
	},
});

// すべてのタブを取得（order順）
export const listTabs = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("tabs").withIndex("by_order").collect();
	},
});

// 単一のタブを取得
export const getTab = query({
	args: {
		tabId: v.id("tabs"),
	},
	handler: async (ctx, { tabId }) => {
		return await ctx.db.get(tabId);
	},
});
