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
		// Render markdown → HTML, then substitute asciinema placeholders
		// before sanitizeHtml strips data-* attributes. Two different
		// substitutions depending on the target:
		//   - dev.to importer: emit its `{% asciinema ID %}` liquid tag.
		//   - Generic feed readers: emit a link to the cast (no way to
		//     embed interactively without asciinema.org JS, which feed
		//     readers strip).
		const rawHtml = md.render(post.body ?? '');
		const substituted = opts.devToFrontmatter
			? replaceAsciinema(rawHtml, (id) => `{% asciinema ${id} %}`)
			: replaceAsciinema(
					rawHtml,
					(id) =>
						`<p><a href="https://asciinema.org/a/${id}">Terminal demo (asciinema)</a></p>`,
			  );
		const rendered = sanitizeHtml(substituted, sanitizeOptions);
		// Rewrite root-relative asset URLs (/blog/... etc.) to absolute so
		// crossposted feeds — and any aggregator that doesn't know our
		// site origin — can load images and follow links.
		const body = absolutizeUrls(rendered, site);
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

function absolutizeUrls(html: string, site: URL): string {
	return html.replace(
		/(\s(?:src|href))="(\/[^"]*)"/g,
		(_, attr, path) => `${attr}="${new URL(path, site).href}"`,
	);
}

function replaceAsciinema(
	html: string,
	fn: (id: string) => string,
): string {
	// Match <div data-asciinema-id="…"></div> (with optional whitespace,
	// other attrs, inner content). The placeholder is always a self-
	// contained element in our markdown, but be liberal in parsing.
	return html.replace(
		/<div([^>]*\sdata-asciinema-id="([^"]+)"[^>]*)>[\s\S]*?<\/div>/g,
		(_full, _attrs, id) => fn(id),
	);
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
