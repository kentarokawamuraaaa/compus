/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as cases from "../cases.js";
import type * as companies from "../companies.js";
import type * as historicalData from "../historicalData.js";
import type * as tabCompanies from "../tabCompanies.js";
import type * as tabs from "../tabs.js";
import type * as tasks from "../tasks.js";
import type * as yahooFinance from "../yahooFinance.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  cases: typeof cases;
  companies: typeof companies;
  historicalData: typeof historicalData;
  tabCompanies: typeof tabCompanies;
  tabs: typeof tabs;
  tasks: typeof tasks;
  yahooFinance: typeof yahooFinance;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
