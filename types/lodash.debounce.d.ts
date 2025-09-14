// Minimal typings for lodash.debounce used in this project
declare module "lodash.debounce" {
	export default function debounce<T extends (...args: any[]) => any>(
		fn: T,
		wait?: number,
		options?: { leading?: boolean; trailing?: boolean; maxWait?: number },
	): ((...args: Parameters<T>) => void) & { cancel(): void; flush(): void };
}
