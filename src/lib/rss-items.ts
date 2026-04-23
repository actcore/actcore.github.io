import { getCollection } from 'astro:content';
import MarkdownIt from 'markdown-it';
import sanitizeHtml from 'sanitize-html';
import { fetchAsciinemaOembed } from './asciinema-oembed';

const md = new MarkdownIt({ html: true, linkify: true });

const sanitizeOptions: sanitizeHtml.IOptions = {
	allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
	allowedAttributes: {
		...sanitizeHtml.defaults.allowedAttributes,
		a: ['href', 'name', 'target', 'rel'],
		img: ['src', 'alt', 'title', 'width', 'height'],
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

	return await Promise.all(
		posts.map(async (post) => {
			const canonical = new URL(`/blog/${post.id}/`, site).href;
			const rawHtml = md.render(post.body ?? '');

			// Standalone asciinema.org links get resolved differently per
			// feed target. dev.to recognises its own liquid tag and hands
			// the URL to its registered oEmbed provider; generic feed
			// readers can't execute JS, so we emit a thumbnail image
			// sourced from asciinema.org's oEmbed response (cached on disk).
			const substituted = opts.devToFrontmatter
				? replaceAsciinemaLink(rawHtml, (url) => `{% embed ${url} %}`)
				: await replaceAsciinemaLinkAsync(rawHtml, thumbnailFallback);

			const rendered = sanitizeHtml(substituted, sanitizeOptions);
			// Rewrite root-relative asset URLs (/blog/... etc.) to absolute
			// so crossposted feeds — and any aggregator that doesn't know
			// our site origin — can load images and follow links.
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
		}),
	);
}

function absolutizeUrls(html: string, site: URL): string {
	return html.replace(
		/(\s(?:src|href))="(\/[^"]*)"/g,
		(_, attr, path) => `${attr}="${new URL(path, site).href}"`,
	);
}

const ASCIINEMA_LINK_RE =
	/<p>\s*<a\s+href="(https:\/\/asciinema\.org\/a\/[^"]+)"[^>]*>([^<]*)<\/a>\s*<\/p>/g;

function replaceAsciinemaLink(
	html: string,
	fn: (url: string, label: string) => string,
): string {
	return html.replace(ASCIINEMA_LINK_RE, (_full, url, label) => fn(url, label));
}

async function replaceAsciinemaLinkAsync(
	html: string,
	fn: (url: string, label: string) => Promise<string>,
): Promise<string> {
	const matches = [...html.matchAll(ASCIINEMA_LINK_RE)];
	if (matches.length === 0) return html;
	const replacements = await Promise.all(
		matches.map((m) => fn(m[1], m[2])),
	);
	let offset = 0;
	let out = html;
	matches.forEach((m, i) => {
		const start = (m.index ?? 0) + offset;
		const end = start + m[0].length;
		out = out.slice(0, start) + replacements[i] + out.slice(end);
		offset += replacements[i].length - m[0].length;
	});
	return out;
}

async function thumbnailFallback(url: string, label: string): Promise<string> {
	const oembed = await fetchAsciinemaOembed(url);
	if (!oembed?.thumbnail_url) {
		return `<p><a href="${url}">${label || 'Terminal demo'}</a></p>`;
	}
	const alt = escapeAttr(label || oembed.title || 'Terminal demo');
	const dims =
		oembed.thumbnail_width && oembed.thumbnail_height
			? ` width="${oembed.thumbnail_width}" height="${oembed.thumbnail_height}"`
			: '';
	return `<p><a href="${url}"><img src="${oembed.thumbnail_url}" alt="${alt}"${dims} /></a></p>`;
}

function escapeAttr(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
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
