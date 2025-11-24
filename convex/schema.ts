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
		defaultCaseId: v.optional(v.id("cases")),
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

	cases: defineTable({
		tabId: v.id("tabs"),
		name: v.string(),
		description: v.optional(v.string()),
		companySet: v.array(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
		notes: v.optional(v.string()),
	})
		.index("by_tab", ["tabId"])
		.index("by_tab_created", ["tabId", "createdAt"]),

	caseSnapshots: defineTable({
		caseId: v.id("cases"),
		date: v.number(),
		metrics: v.string(),
		companyCount: v.number(),
	})
		.index("by_case", ["caseId"])
		.index("by_case_date", ["caseId", "date"]),

	historicalData: defineTable({
		companyCode: v.string(),
		yahooSymbol: v.string(),
		period: v.string(),
		interval: v.string(),
		data: v.string(), // JSON stringified array of historical points
		currentMetrics: v.string(), // JSON stringified current metrics
		fetchedAt: v.number(),
		expiresAt: v.number(), // キャッシュ有効期限
	})
		.index("by_company", ["companyCode"])
		.index("by_company_period", ["companyCode", "period", "interval"])
		.index("by_expiry", ["expiresAt"]),
});
