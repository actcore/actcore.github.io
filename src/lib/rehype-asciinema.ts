/**
 * Rehype plugin: server-side upgrade of standalone asciinema.org links
 * into an interactive asciinema-player script embed, with a noscript
 * thumbnail fallback sourced from asciinema.org's oEmbed metadata.
 *
 * Applied at build time via astro.config.mjs so there's no client-side
 * JS dance on the reader's side. Links that appear inline in prose
 * (not alone in their own paragraph) stay as plain links.
 */
import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';
import { castIdFromUrl, fetchAsciinemaOembed } from './asciinema-oembed.js';

export function rehypeAsciinema() {
	return async function transform(tree: Root) {
		const jobs: Array<() => Promise<void>> = [];

		visit(tree, 'element', (node, idx, parent) => {
			if (!parent || idx === undefined) return;
			if (node.tagName !== 'p') return;
			if (node.children.length !== 1) return;
			const child = node.children[0];
			if (child.type !== 'element' || child.tagName !== 'a') return;
			const href = child.properties?.href;
			if (typeof href !== 'string') return;
			const id = castIdFromUrl(href);
			if (!id) return;

			// Capture a local copy of the anchor's label (used in noscript alt).
			const labelNode = child.children[0];
			const label =
				labelNode && labelNode.type === 'text' ? labelNode.value : undefined;

			jobs.push(async () => {
				const oembed = await fetchAsciinemaOembed(href);
				const embed: Element = {
					type: 'element',
					tagName: 'div',
					properties: { className: ['asciinema-embed'] },
					children: [
						{
							type: 'element',
							tagName: 'script',
							properties: {
								async: true,
								src: `https://asciinema.org/a/${id}.js`,
								id: `asciicast-${id}`,
							},
							children: [],
						},
					],
				};
				if (oembed?.thumbnail_url) {
					embed.children.push({
						type: 'element',
						tagName: 'noscript',
						properties: {},
						children: [
							{
								type: 'element',
								tagName: 'a',
								properties: { href },
								children: [
									{
										type: 'element',
										tagName: 'img',
										properties: {
											src: oembed.thumbnail_url,
											alt: label ?? oembed.title ?? 'Terminal demo',
											width: oembed.thumbnail_width,
											height: oembed.thumbnail_height,
											loading: 'lazy',
										},
										children: [],
									},
								],
							},
						],
					});
				}
				(parent.children as any[]).splice(idx as number, 1, embed);
			});
		});

		await Promise.all(jobs.map((fn) => fn()));
	};
}
