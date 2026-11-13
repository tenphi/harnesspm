import { defineDocsConfig } from '@tenphi/cookbook/config';
import harnesspmPackage from './package.json' with { type: 'json' };

/*
  The site holds Home, Getting started, the guides and the reference. The
  specification (docs/spec/) and the research notes (docs/research/) stay on
  GitHub, and site pages link to them there: docs/spec/ is also the docs index
  that harnesspm's own harness gives to agents, and it ships in the npm package.
*/
export default defineDocsConfig({
  site: {
    title: 'harnesspm',
    version: harnesspmPackage.version,
    description: 'The harness package manager: share agent rules, docs, skills and tools through npm packages.',
    url: 'https://harnesspm.tenphi.me',
    repository: 'https://github.com/tenphi/harnesspm',
    logo: './assets/harnesspm.svg',
    favicon: {
      source: './assets/harnesspm.svg',
      background: '#1b6b66',
    },
    headerLinks: [
      {
        label: 'npm',
        link: 'https://www.npmjs.com/package/@tenphi/harnesspm',
        newTab: true,
      },
    ],
  },
  editLink: {
    baseUrl: 'https://github.com/tenphi/harnesspm/edit/main/',
  },
  lastUpdated: true,
  content: {
    sources: [
      { id: 'home', file: 'docs-site/index.mdx', route: '/' },
      { id: 'start', file: 'docs/guide/getting-started.mdx', route: '/getting-started' },
      { id: 'guides', glob: 'docs/guide/*.md', base: 'docs/guide', routeBase: '/guides' },
      { id: 'reference', glob: 'docs/guide/reference/*.md', base: 'docs/guide/reference', routeBase: '/reference' },
    ],
  },
  navigation: {
    items: [
      { label: 'Home', link: '/' },
      '/getting-started',
      {
        label: 'Guides',
        items: [
          { label: 'Use a package’s harness', link: '/guides/use' },
          { label: 'Share from a library', link: '/guides/share' },
          { label: 'Add your own', link: '/guides/add-your-own' },
          { label: 'Change upstream units', link: '/guides/change-upstream' },
          { label: 'Trust and safety', link: '/guides/trust' },
          { label: 'Monorepos', link: '/guides/monorepos' },
          { label: 'Cloud sessions', link: '/guides/cloud' },
          { label: 'Telemetry', link: '/guides/telemetry' },
        ],
      },
      {
        label: 'Reference',
        items: [
          { label: 'CLI', link: '/reference/cli' },
          { label: 'harnesspm.json', link: '/reference/config' },
          { label: 'Package format', link: '/reference/package-format' },
        ],
      },
    ],
  },
  theme: {
    brand: { from: '#1b6b66' },
    styles: {
      /*
        Code groups carry a tab per package manager or file; the language
        caption under the tabs repeats what the tab already says.
      */
      CodeGroup: { Caption: { hide: true } },
      /*
        Some headings are names in code (`~/.harnesspm/config.json`) that
        can't wrap on a phone and would widen the page.
      */
      MarkdownHeading: { Heading: { overflowWrap: 'anywhere' } },
      /*
        The hero has no image: one centered column, with less space around
        it, so the install commands under it show above the fold.
      */
      Hero: {
        gridColumns: 'minmax(0, 1fr)',
        blockPadding: {
          '': 'clamp(2.5rem, 5vw, 4.5rem) start, 2.5rem end',
          '!@md': '4x start, 2rem end',
        },
        Stack: { alignItems: 'center', textAlign: 'center' },
        Title: { inlineSize: 'max 24ch' },
        Tagline: { inlineSize: 'max 60ch' },
        Actions: { justifyContent: 'center' },
      },
    },
  },
});
