/**
 * Styles of the home page's flow diagram (Flow.astro): a library's harness/,
 * the install that runs `harnesspm sync`, and the files agents read.
 *
 * Three steps in a row on wide screens, a column on phones. Parts are named
 * by `data-element` in the markup, so the whole anatomy lives here.
 */
import { defineComponent } from '@tenphi/cookbook/styling';

export const HarnessFlow = defineComponent('HarnessFlow', {
  as: 'figure',
  styles: {
    display: 'grid',
    gridColumns: { '': '1fr', '@md': 'minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1.15fr)' },
    alignItems: 'stretch',
    gap: { '': '0.5x', '@md': '0' },
    margin: '3x 0',
    padding: '0',

    Step: {
      display: 'grid',
      alignContent: 'start',
      gap: '1x',
      padding: '2x',
      radius: '$card-radius',
      border: '1bw solid #border',
      fill: '#surface-2',
    },
    Eyebrow: {
      preset: 'control-label',
      color: '#accent-text',
    },
    Title: {
      preset: 'h4',
      color: '#heading',
      margin: '0',
    },
    List: {
      display: 'grid',
      gap: '0.5x',
      margin: '0',
      padding: '0',
      listStyle: 'none',
      preset: 'small',
      color: '#text',
    },
    Item: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'baseline',
      gap: '0 1x',
    },
    Note: {
      preset: 'small',
      color: '#text-soft',
    },
    Code: {
      preset: 'inline-code',
      color: '#text',
    },

    Link: {
      display: 'grid',
      placeItems: 'center',
      alignContent: 'center',
      gap: '0.5x',
      padding: { '': '0.5x 0', '@md': '0 0.5x' },
      color: '#text-soft',
    },
    LinkLabel: {
      preset: 'small',
      textAlign: 'center',
      whiteSpace: 'nowrap',
    },
    Arrow: {
      display: 'block',
      width: '1.5rem',
      height: '1.5rem',
      color: '#accent-text',
      transform: { '': 'rotate(90deg)', '@md': 'none' },
    },

    Caption: {
      gridColumn: '1 / -1',
      paddingTop: '1.5x',
      preset: 'small',
      color: '#text-soft',
    },
  },
});
