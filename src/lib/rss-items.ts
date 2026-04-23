import { getCollection } from 'astro:content';
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

export interface RssItem {
	title: string;
	description?: string;
	pubDate: Date;
	link: string;
	author: string;
	content: string;
}

export interface BuildOptions {
	/** Prepend a dev.to-compatible YAML frontmatter block inside content:encoded. */
	devToFrontmatter?: boolean;
}

/**
 * Collect published blog posts ordered newest-first, with each item's
 * content:encoded rendered to sanitized HTML. With `devToFrontmatter`,
 * a YAML frontmatter block is prepended so the feed is consumable by
 * dev.to's "Publishing from RSS" importer without leaking metadata
 * into generic feed readers.
 */
export async function buildRssItems(
	site: URL,
	opts: BuildOptions = {},
): Promise<RssItem[]> {
	const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
		(a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
	);

	return posts.map((post) => {
		const canonical = new URL(`/blog/${post.id}/`, site).href;
		const body = sanitizeHtml(md.render(post.body ?? ''), sanitizeOptions);
		const content = opts.devToFrontmatter
			? `${devToFrontmatter({
					title: post.data.title,
					description: post.data.description,
					tags: post.data.tags,
					canonical_url: canonical,
					cover_image: post.data.cover_image,
					series: post.data.series,
			  })}\n${body}`
			: body;

		return {
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.pubDate,
			link: canonical,
			author: post.data.author,
			content,
		};
	});
}

function devToFrontmatter(fields: Record<string, unknown>): string {
	const entries: string[] = [];
	for (const [key, value] of Object.entries(fields)) {
		if (value === undefined || value === null) continue;
		if (Array.isArray(value)) {
			if (value.length === 0) continue;
			entries.push(`${key}: ${value.join(', ')}`);
		} else if (typeof value === 'string') {
			if (value === '') continue;
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
