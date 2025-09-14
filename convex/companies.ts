import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const replaceAll = mutation({
	args: {
		rows: v.array(
			v.object({
				code: v.string(),
				name: v.string(),
				uploadedAt: v.number(),
				extra: v.optional(v.record(v.string(), v.string())),
			}),
		),
	},
	handler: async (ctx, { rows }) => {
		// Delete all existing companies
		const existing = await ctx.db.query("companies").collect();
		for (const doc of existing) {
			await ctx.db.delete(doc._id);
		}

		// Insert new rows
		for (const row of rows) {
			const code = normalizeCode(row.code);
			await ctx.db.insert("companies", {
				code,
				name: row.name,
				nameLower: row.name.toLowerCase(),
				uploadedAt: row.uploadedAt,
				extra: row.extra,
			});
		}

		return { inserted: rows.length };
	},
});

export const upsertMany = mutation({
	args: {
		rows: v.array(
			v.object({
				code: v.string(),
				name: v.string(),
				uploadedAt: v.number(),
				extra: v.optional(v.record(v.string(), v.string())),
			}),
		),
	},
	handler: async (ctx, { rows }) => {
		let upserts = 0;
		for (const row of rows) {
			const code = normalizeCode(row.code);
			const existing = await ctx.db
				.query("companies")
				.withIndex("by_code", (q) => q.eq("code", code))
				.first();
			if (existing) {
				await ctx.db.patch(existing._id, {
					name: row.name,
					nameLower: row.name.toLowerCase(),
					uploadedAt: row.uploadedAt,
					extra: row.extra,
				});
				upserts += 1;
			} else {
				await ctx.db.insert("companies", {
					code,
					name: row.name,
					nameLower: row.name.toLowerCase(),
					uploadedAt: row.uploadedAt,
					extra: row.extra,
				});
				upserts += 1;
			}
		}
		return { upserts };
	},
});

export const search = query({
	args: { q: v.string(), limit: v.optional(v.number()) },
	handler: async (ctx, { q, limit }) => {
		const queryText = q.trim().toLowerCase();
		const take = Math.min(Math.max(limit ?? 20, 1), 100);
		if (queryText.length === 0) {
			return await ctx.db.query("companies").order("desc").take(take);
		}

		// Range scan using nameLower prefix
		const upperBound = `${queryText}\uffff`;
		return await ctx.db
			.query("companies")
			.withIndex("by_nameLower", (q2) =>
				q2.gte("nameLower", queryText).lte("nameLower", upperBound),
			)
			.take(take);
	},
});

export const getByCode = query({
	args: { code: v.string() },
	handler: async (ctx, { code }) => {
		const normalized = normalizeCode(code);
		return await ctx.db
			.query("companies")
			.withIndex("by_code", (q) => q.eq("code", normalized))
			.first();
	},
});

function normalizeCode(input: string): string {
	return input.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}
