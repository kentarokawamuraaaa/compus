import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	companies: defineTable({
		code: v.string(),
		name: v.string(),
		nameLower: v.string(),
		uploadedAt: v.number(),
		extra: v.optional(v.record(v.string(), v.string())),
	})
		.index("by_code", ["code"])
		.index("by_nameLower", ["nameLower"]),

	tabs: defineTable({
		name: v.string(),
		order: v.number(),
		createdAt: v.number(),
	}).index("by_order", ["order"]),

	tabCompanies: defineTable({
		tabId: v.id("tabs"),
		companyCode: v.string(),
		companyName: v.string(),
		enabled: v.boolean(),
		order: v.number(),
		addedAt: v.number(),
		paste: v.string(),
		parsed: v.string(),
		summary: v.string(),
	})
		.index("by_tab", ["tabId", "order"])
		.index("by_tab_company", ["tabId", "companyCode"]),
});
