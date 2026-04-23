import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { buildRssItems } from '../../lib/rss-items';

/**
 * RSS feed variant for dev.to's "Publishing from RSS" importer. Each
 * <content:encoded> starts with a YAML frontmatter block (title, tags,
 * canonical_url, description, cover_image, series) that dev.to parses
 * and applies to the imported draft. Generic feed readers would render
 * this block as plain text, so it's kept out of the main /blog/rss.xml
 * feed.
 *
 * Point dev.to at https://actcore.dev/blog/devto.xml in
 * Settings → Extensions → Publishing from RSS.
 */
export async function GET(context: APIContext) {
	const site = context.site ?? new URL('https://actcore.dev');
	const items = await buildRssItems(site, { devToFrontmatter: true });
	return rss({
		title: 'ACT Blog',
		description:
			'Announcements, design notes, and deeper dives from the ACT team.',
		site,
		items,
	});
}
