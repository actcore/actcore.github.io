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
				{ icon: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/company/actcore' },
				{ icon: 'rss', label: 'Blog RSS', href: '/blog/rss.xml' },
			],
			sidebar: [
				{
					label: 'Start here',
					items: [
						{ slug: 'docs', label: 'What is ACT' },
						{ slug: 'docs/install' },
						{ slug: 'docs/run-first-component' },
					],
				},
				{
					label: 'Build a component',
					items: [
						{ slug: 'docs/build/rust' },
						{ slug: 'docs/build/python' },
						{ slug: 'docs/build/manifest' },
						{ slug: 'docs/build/skills' },
						{ slug: 'docs/build/testing' },
					],
				},
				{
					label: 'Host / run',
					items: [
						{ slug: 'docs/host/transports' },
						{ slug: 'docs/host/policy' },
						{ slug: 'docs/host/config' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ slug: 'docs/reference/cli' },
						{ slug: 'docs/reference/wit' },
						{ slug: 'docs/reference/std-keys' },
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
