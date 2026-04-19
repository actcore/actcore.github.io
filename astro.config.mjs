// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';

export default defineConfig({
	site: 'https://actcore.dev',
	integrations: [
		mermaid({
			theme: 'dark',
			autoTheme: true,
		}),
		starlight({
			title: 'ACT',
			description: 'Agent Component Tools — universal tool components built on WebAssembly',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/actcore' },
				{ icon: 'rss', label: 'Blog RSS', href: '/blog/rss.xml' },
			],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ slug: 'docs' },
						{ slug: 'docs/getting-started/installation' },
						{ slug: 'docs/getting-started/first-component' },
					],
				},
				{
					label: 'Concepts',
					items: [
						{ slug: 'docs/concepts/overview' },
						{ slug: 'docs/concepts/components' },
						{ slug: 'docs/concepts/transports' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ slug: 'docs/reference/wit-api' },
						{ slug: 'docs/reference/cli' },
					],
				},
			],
			customCss: ['./src/styles/custom.css'],
			head: [
				{
					tag: 'link',
					attrs: {
						rel: 'preconnect',
						href: 'https://fonts.googleapis.com',
					},
				},
				{
					tag: 'link',
					attrs: {
						rel: 'preconnect',
						href: 'https://fonts.gstatic.com',
						crossorigin: true,
					},
				},
				{
					tag: 'link',
					attrs: {
						rel: 'stylesheet',
						href: 'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;600;700;800&family=Instrument+Sans:wght@400;500;600;700&display=swap',
					},
				},
			],
		}),
	],
});
