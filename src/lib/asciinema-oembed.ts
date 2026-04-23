import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.resolve('.cache/asciinema-oembed');

export interface AsciinemaOembed {
	type: string;
	version: string | number;
	title?: string;
	author_name?: string;
	author_url?: string;
	provider_name?: string;
	provider_url?: string;
	thumbnail_url?: string;
	thumbnail_width?: number;
	thumbnail_height?: number;
	width?: number;
	height?: number;
	html?: string;
}

export function castIdFromUrl(url: string): string | null {
	const m = url.match(/^https:\/\/asciinema\.org\/a\/([^/?#]+)/);
	return m ? m[1] : null;
}

/**
 * Fetch asciinema.org's oEmbed JSON for a cast URL. Result is cached on
 * disk so subsequent builds don't re-hit the network. Returns null on
 * any error — callers must handle missing metadata gracefully so a
 * temporary asciinema.org outage can't fail the build.
 */
export async function fetchAsciinemaOembed(
	url: string,
): Promise<AsciinemaOembed | null> {
	const key = createHash('sha256').update(url).digest('hex').slice(0, 16);
	const cachePath = path.join(CACHE_DIR, `${key}.json`);

	try {
		const cached = await readFile(cachePath, 'utf8');
		return JSON.parse(cached) as AsciinemaOembed;
	} catch {
		// cache miss — fall through to network
	}

	const endpoint = `https://asciinema.org/oembed?format=json&url=${encodeURIComponent(url)}`;
	try {
		const res = await fetch(endpoint);
		if (!res.ok) {
			console.warn(`[asciinema-oembed] ${res.status} ${res.statusText} for ${url}`);
			return null;
		}
		const data = (await res.json()) as AsciinemaOembed;
		await mkdir(CACHE_DIR, { recursive: true });
		await writeFile(cachePath, JSON.stringify(data, null, 2));
		return data;
	} catch (err) {
		console.warn(`[asciinema-oembed] fetch failed for ${url}: ${err}`);
		return null;
	}
}
