import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { buildRssItems } from '../../lib/rss-items';

export async function GET(context: APIContext) {
	const site = context.site ?? new URL('https://actcore.dev');
	const items = await buildRssItems(site);
	return rss({
		title: 'ACT Blog',
		description:
			'Announcements, design notes, and deeper dives from the ACT team.',
		site,
		items,
	});
}
