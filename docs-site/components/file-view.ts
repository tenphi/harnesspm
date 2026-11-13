/**
 * Styles of ManagedBlock.astro and Terminal.astro: a file or a command's
 * output in a frame whose long lines wrap, so nothing hides behind a scroll
 * bar or a copy button on a phone.
 *
 * Parts (`data-element`): Bar, Title, Tag, Body, and one per line kind:
 * Comment, Heading, Bullet, Text, Cut and Field (a `why` line: a Label column
 * and its value). Inside lines: Id (a unit ID) and Mark (a note on a line).
 */
import { defineComponent } from '@tenphi/cookbook/styling';

export const FileView = defineComponent('FileView', {
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
    Title: {
      preset: 'inline-code',
      fontWeight: 600,
      color: '#heading',
      overflowWrap: 'anywhere',
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
    Field: {
      display: 'grid',
      gridColumns: '12ch minmax(0, 1fr)',
    },
    Label: {
      color: '#text-soft',
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
    Mark: {
      display: 'inline-block',
      marginLeft: '1x',
      padding: '0 0.75x',
      radius: '1r',
      fill: '#accent-surface-subtle',
      border: '1bw solid #accent-text',
      color: '#accent-text',
      preset: 'small',
      fontWeight: 600,
      textIndent: '0',
      whiteSpace: 'nowrap',
    },
  },
});
