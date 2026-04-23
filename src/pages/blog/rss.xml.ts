import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';

const md = new MarkdownIt({ html: true, linkify: true });

const sanitizeOptions: sanitizeHtml.IOptions = {
	allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
	allowedAttributes: {
		...sanitizeHtml.defaults.allowedAttributes,
		a: ['href', 'name', 'target', 'rel'],
		img: ['src', 'alt', 'title'],
		code: ['class'],
		pre: ['class'],
	},
};

// dev.to parses a YAML frontmatter block at the start of <content:encoded>
// when importing via "Publishing from RSS" and uses its fields (tags,
// canonical_url, series, cover_image, description) in place of asking the
// author to fill them in the dev.to editor.
function devToFrontmatter(fields: Record<string, unknown>): string {
	const entries: string[] = [];
	for (const [key, value] of Object.entries(fields)) {
		if (value === undefined || value === null) continue;
		if (Array.isArray(value)) {
			if (value.length === 0) continue;
			entries.push(`${key}: ${value.join(', ')}`);
		} else if (typeof value === 'string') {
			if (value === '') continue;
			// Quote descriptions that may contain colons or hashes.
			const needsQuote = /[:#"']/.test(value);
			entries.push(
				needsQuote
					? `${key}: "${value.replace(/"/g, '\\"')}"`
					: `${key}: ${value}`,
			);
		} else {
			entries.push(`${key}: ${String(value)}`);
		}
	}
	return `---\n${entries.join('\n')}\n---\n`;
}

export async function GET(context: APIContext) {
	const site = context.site ?? new URL('https://actcore.dev');
	const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
		(a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
	);
	return rss({
		title: 'ACT Blog',
		description:
			'Announcements, design notes, and deeper dives from the ACT team.',
		site,
		items: posts.map((post) => {
			const canonical = new URL(`/blog/${post.id}/`, site).href;
			// `published` is intentionally omitted — let dev.to's RSS importer
			// default to draft so each post is reviewed in the dev.to UI before
			// going live (dev.to's "Publishing from RSS" setting controls the
			// global default, this just declines to override it).
			const frontmatter = devToFrontmatter({
				title: post.data.title,
				description: post.data.description,
				tags: post.data.tags,
				canonical_url: canonical,
				cover_image: post.data.cover_image,
				series: post.data.series,
			});
			const body = sanitizeHtml(md.render(post.body ?? ''), sanitizeOptions);
			return {
				title: post.data.title,
				description: post.data.description,
				pubDate: post.data.pubDate,
				link: canonical,
				author: post.data.author,
				content: `${frontmatter}\n${body}`,
			};
		}),
	});
}
