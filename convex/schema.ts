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
});
