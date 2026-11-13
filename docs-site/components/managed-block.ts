/**
 * Styles of ManagedBlock.astro: an excerpt of a managed block in AGENTS.md,
 * shown as a file whose long lines wrap, with each unit ID highlighted.
 *
 * Parts (`data-element`): Bar, File, Tag, Body, Comment, Heading, Bullet,
 * Text, Cut, Id.
 */
import { defineComponent } from '@tenphi/cookbook/styling';

export const ManagedBlockFrame = defineComponent('ManagedBlock', {
  as: 'figure',
  styles: {
    display: 'grid',
    margin: '2x 0',
    padding: '0',
    radius: '$card-radius',
    border: '1bw solid #border',
    fill: '#surface-2',
    overflow: 'hidden',

    Bar: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: '0.5x 2x',
      padding: '1.25x 2x',
      border: 'bottom 1bw solid #border',
    },
    File: {
      preset: 'inline-code',
      fontWeight: 600,
      color: '#heading',
    },
    Tag: {
      preset: 'small',
      color: '#text-soft',
    },
    Body: {
      display: 'block',
      margin: '0',
      padding: '2x',
      preset: 'code',
      color: '#text',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      // `<!--` stays as typed, not an arrow ligature.
      fontVariantLigatures: 'none',
    },
    Comment: {
      display: 'block',
      color: '#text-soft',
      fontStyle: 'italic',
    },
    Heading: {
      display: 'block',
      color: '#heading',
      fontWeight: 700,
    },
    Bullet: {
      display: 'block',
      paddingLeft: '2ch',
      textIndent: '-2ch',
    },
    Text: {
      display: 'block',
      minBlockSize: '1lh',
    },
    Cut: {
      display: 'block',
      color: '#text-soft',
    },
    Id: {
      color: '#accent-text',
      fontWeight: 600,
    },
  },
});
