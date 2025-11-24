import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const create = mutation({
	args: {
		tabId: v.id("tabs"),
		name: v.string(),
		companySet: v.array(v.string()),
		description: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const caseId = await ctx.db.insert("cases", {
			tabId: args.tabId,
			name: args.name,
			description: args.description,
			companySet: args.companySet,
			createdAt: now,
			updatedAt: now,
		});
		return caseId;
	},
});

export const list = query({
	args: {
		tabId: v.id("tabs"),
	},
	handler: async (ctx, args) => {
		const cases = await ctx.db
			.query("cases")
			.withIndex("by_tab", (q) => q.eq("tabId", args.tabId))
			.order("desc")
			.collect();
		return cases;
	},
});

export const get = query({
	args: {
		caseId: v.id("cases"),
	},
	handler: async (ctx, args) => {
		const caseDoc = await ctx.db.get(args.caseId);
		return caseDoc;
	},
});

export const rename = mutation({
	args: {
		caseId: v.id("cases"),
		name: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.caseId, {
			name: args.name,
			updatedAt: Date.now(),
		});
	},
});

export const updateDescription = mutation({
	args: {
		caseId: v.id("cases"),
		description: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.caseId, {
			description: args.description,
			updatedAt: Date.now(),
		});
	},
});

export const deleteCase = mutation({
	args: {
		caseId: v.id("cases"),
	},
	handler: async (ctx, args) => {
		// ケースを取得
		const caseToDelete = await ctx.db.get(args.caseId);
		if (!caseToDelete) {
			throw new Error("Case not found");
		}

		// 同じタブ内のケース数を確認
		const casesInTab = await ctx.db
			.query("cases")
			.withIndex("by_tab", (q) => q.eq("tabId", caseToDelete.tabId))
			.collect();

		// 最後のケースの場合は削除を防止
		if (casesInTab.length <= 1) {
			throw new Error("Cannot delete the last case in a tab");
		}

		// Delete associated snapshots first
		const snapshots = await ctx.db
			.query("caseSnapshots")
			.withIndex("by_case", (q) => q.eq("caseId", args.caseId))
			.collect();
		for (const snapshot of snapshots) {
			await ctx.db.delete(snapshot._id);
		}
		// Delete the case
		await ctx.db.delete(args.caseId);
	},
});

export const duplicate = mutation({
	args: {
		caseId: v.id("cases"),
		newName: v.string(),
	},
	handler: async (ctx, args) => {
		const original = await ctx.db.get(args.caseId);
		if (!original) {
			throw new Error("Case not found");
		}
		const now = Date.now();
		const newCaseId = await ctx.db.insert("cases", {
			tabId: original.tabId,
			name: args.newName,
			description: original.description,
			companySet: original.companySet,
			createdAt: now,
			updatedAt: now,
			notes: original.notes,
		});
		return newCaseId;
	},
});

export const saveSnapshot = mutation({
	args: {
		caseId: v.id("cases"),
		metrics: v.string(),
		companyCount: v.number(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const snapshotId = await ctx.db.insert("caseSnapshots", {
			caseId: args.caseId,
			date: now,
			metrics: args.metrics,
			companyCount: args.companyCount,
		});
		return snapshotId;
	},
});

export const getSnapshots = query({
	args: {
		caseId: v.id("cases"),
	},
	handler: async (ctx, args) => {
		const snapshots = await ctx.db
			.query("caseSnapshots")
			.withIndex("by_case", (q) => q.eq("caseId", args.caseId))
			.order("desc")
			.collect();
		return snapshots;
	},
});

// ケースをアクティブ化（企業のenabled状態を更新）
export const setActiveCase = mutation({
	args: {
		caseId: v.id("cases"),
	},
	handler: async (ctx, args) => {
		// ケースを取得
		const caseDoc = await ctx.db.get(args.caseId);
		if (!caseDoc) {
			throw new Error("Case not found");
		}

		// このケースに含まれる企業コードのセット
		const companySetInCase = new Set(caseDoc.companySet);

		// タブ内のすべての企業を取得
		const allCompanies = await ctx.db
			.query("tabCompanies")
			.withIndex("by_tab", (q) => q.eq("tabId", caseDoc.tabId))
			.collect();

		// 各企業のenabled状態を更新
		for (const company of allCompanies) {
			const shouldBeEnabled = companySetInCase.has(company.companyCode);
			if (company.enabled !== shouldBeEnabled) {
				await ctx.db.patch(company._id, {
					enabled: shouldBeEnabled,
				});
			}
		}
	},
});

// ケース内の企業セットを更新（スイッチ切り替え時）
export const updateCompanyInCase = mutation({
	args: {
		caseId: v.id("cases"),
		companyCode: v.string(),
		shouldInclude: v.boolean(),
	},
	handler: async (ctx, args) => {
		const caseDoc = await ctx.db.get(args.caseId);
		if (!caseDoc) {
			throw new Error("Case not found");
		}

		let newCompanySet = [...caseDoc.companySet];

		if (args.shouldInclude) {
			// 追加（重複チェック）
			if (!newCompanySet.includes(args.companyCode)) {
				newCompanySet.push(args.companyCode);
			}
		} else {
			// 削除
			newCompanySet = newCompanySet.filter((code) => code !== args.companyCode);
		}

		// ケースを更新
		await ctx.db.patch(args.caseId, {
			companySet: newCompanySet,
			updatedAt: Date.now(),
		});

		// tabCompaniesのenabled状態も更新
		const company = await ctx.db
			.query("tabCompanies")
			.withIndex("by_tab_company", (q) =>
				q.eq("tabId", caseDoc.tabId).eq("companyCode", args.companyCode)
			)
			.first();

		if (company) {
			await ctx.db.patch(company._id, {
				enabled: args.shouldInclude,
			});
		}
	},
});
