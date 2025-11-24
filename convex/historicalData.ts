import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24時間

export const save = internalMutation({
	args: {
		companyCode: v.string(),
		yahooSymbol: v.string(),
		period: v.string(),
		interval: v.string(),
		data: v.string(),
		currentMetrics: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const expiresAt = now + CACHE_DURATION_MS;

		// 既存のデータを検索
		const existing = await ctx.db
			.query("historicalData")
			.withIndex("by_company_period", (q) =>
				q
					.eq("companyCode", args.companyCode)
					.eq("period", args.period)
					.eq("interval", args.interval)
			)
			.first();

		if (existing) {
			// 更新
			await ctx.db.patch(existing._id, {
				yahooSymbol: args.yahooSymbol,
				data: args.data,
				currentMetrics: args.currentMetrics,
				fetchedAt: now,
				expiresAt: expiresAt,
			});
			return existing._id;
		} else {
			// 新規作成
			return await ctx.db.insert("historicalData", {
				companyCode: args.companyCode,
				yahooSymbol: args.yahooSymbol,
				period: args.period,
				interval: args.interval,
				data: args.data,
				currentMetrics: args.currentMetrics,
				fetchedAt: now,
				expiresAt: expiresAt,
			});
		}
	},
});

export const get = query({
	args: {
		companyCode: v.string(),
		period: v.string(),
		interval: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		const data = await ctx.db
			.query("historicalData")
			.withIndex("by_company_period", (q) =>
				q
					.eq("companyCode", args.companyCode)
					.eq("period", args.period)
					.eq("interval", args.interval)
			)
			.first();

		// キャッシュが期限切れの場合はnullを返す
		if (data && data.expiresAt < now) {
			return null;
		}

		return data;
	},
});

export const getMultiple = query({
	args: {
		companyCodes: v.array(v.string()),
		period: v.string(),
		interval: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const results: Record<string, any> = {};

		for (const code of args.companyCodes) {
			const data = await ctx.db
				.query("historicalData")
				.withIndex("by_company_period", (q) =>
					q.eq("companyCode", code).eq("period", args.period).eq("interval", args.interval)
				)
				.first();

			// キャッシュが有効な場合のみ返す
			if (data && data.expiresAt >= now) {
				results[code] = {
					...data,
					data: JSON.parse(data.data),
					currentMetrics: JSON.parse(data.currentMetrics),
				};
			}
		}

		return results;
	},
});

export const deleteExpired = mutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const expired = await ctx.db
			.query("historicalData")
			.withIndex("by_expiry", (q) => q.lt("expiresAt", now))
			.collect();

		for (const doc of expired) {
			await ctx.db.delete(doc._id);
		}

		return expired.length;
	},
});
