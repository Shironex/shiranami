import { describe, it, expect } from 'vitest';
import { cleanTitleForSearch } from './metadata-lookup';

describe('cleanTitleForSearch', () => {
  describe('artist prefix stripping', () => {
    it('strips artist prefix when title starts with "Artist - Song"', () => {
      expect(cleanTitleForSearch('Lil Peep - Belgium (Official Video)', 'Lil Peep'))
        .toBe('Belgium');
    });

    it('strips artist prefix with en-dash', () => {
      expect(cleanTitleForSearch('Lil Peep – Belgium', 'Lil Peep'))
        .toBe('Belgium');
    });

    it('does not strip when artist is not at start', () => {
      expect(cleanTitleForSearch('Best of Lil Peep - Belgium', 'Lil Peep'))
        .toBe('Best of Lil Peep - Belgium');
    });

    it('is case-insensitive for artist matching', () => {
      expect(cleanTitleForSearch('LIL PEEP - Belgium', 'Lil Peep'))
        .toBe('Belgium');
    });
  });

  describe('YouTube noise removal', () => {
    it('strips (Official Video)', () => {
      expect(cleanTitleForSearch('Song (Official Video)', 'Unknown Artist'))
        .toBe('Song');
    });

    it('strips (Official Audio)', () => {
      expect(cleanTitleForSearch('Song (Official Audio)', 'Unknown Artist'))
        .toBe('Song');
    });

    it('strips (Official Music Video)', () => {
      expect(cleanTitleForSearch('Song (Official Music Video)', 'Unknown Artist'))
        .toBe('Song');
    });

    it('strips (Visualizer)', () => {
      expect(cleanTitleForSearch('Crash and Burn (Visualizer)', 'Maggie Lindemann'))
        .toBe('Crash and Burn');
    });

    it('strips (Lyrics)', () => {
      expect(cleanTitleForSearch('Song (Lyrics)', 'Unknown Artist'))
        .toBe('Song');
    });

    it('strips (Official Lyric Video)', () => {
      expect(cleanTitleForSearch('Song (Official Lyric Video)', 'Unknown Artist'))
        .toBe('Song');
    });

    it('strips (Prod. xyz)', () => {
      expect(cleanTitleForSearch('Song (Prod. Someone)', 'Unknown Artist'))
        .toBe('Song');
    });

    it('strips (Male Version)', () => {
      expect(cleanTitleForSearch('Darkside (Male Version)', 'Unknown Artist'))
        .toBe('Darkside');
    });

    it('strips (Rock Cover)', () => {
      expect(cleanTitleForSearch('Song (Rock Cover)', 'Unknown Artist'))
        .toBe('Song');
    });
  });

  describe('bracket removal', () => {
    it('strips square brackets with any content', () => {
      expect(cleanTitleForSearch('Song [NMV]', 'Unknown Artist'))
        .toBe('Song');
    });

    it('strips [Official Audio]', () => {
      expect(cleanTitleForSearch('Song [Official Audio]', 'Unknown Artist'))
        .toBe('Song');
    });

    it('strips [Looped/Extended]', () => {
      expect(cleanTitleForSearch('star shopping [Looped/Extended]', 'Unknown Artist'))
        .toBe('star shopping');
    });

    it('strips CJK brackets 「」 and preserves spacing', () => {
      expect(cleanTitleForSearch('In The End「Linkin Park」', 'Unknown Artist'))
        .toBe('In The End Linkin Park');
    });

    it('strips CJK brackets 【】with content', () => {
      expect(cleanTitleForSearch('【Emotional】Kokoronashi', 'Unknown Artist'))
        .toBe('Kokoronashi');
    });
  });

  describe('pipe and suffix stripping', () => {
    it('strips everything after |', () => {
      expect(cleanTitleForSearch('Song | ENGLISH ver | AmaLee', 'Unknown Artist'))
        .toBe('Song');
    });

    it('strips everything after full-width ｜', () => {
      expect(cleanTitleForSearch('Song ｜ Remix', 'Unknown Artist'))
        .toBe('Song');
    });
  });

  describe('Nightcore prefix', () => {
    it('strips "Nightcore - " prefix', () => {
      expect(cleanTitleForSearch('Nightcore - Circus', 'Unknown Artist'))
        .toBe('Circus');
    });

    it('strips "Nightcore – " prefix with en-dash', () => {
      expect(cleanTitleForSearch('Nightcore – Circus', 'Unknown Artist'))
        // After artist prefix strip fails (Unknown Artist), Nightcore - strip runs
        .toBe('Circus');
    });

    it('is case-insensitive', () => {
      expect(cleanTitleForSearch('NIGHTCORE - Song', 'Unknown Artist'))
        .toBe('Song');
    });
  });

  describe('feat/ft stripping', () => {
    it('strips "ft. Artist" suffix', () => {
      expect(cleanTitleForSearch('Song ft. Someone', 'Unknown Artist'))
        .toBe('Song');
    });

    it('strips "feat. Artist" suffix', () => {
      expect(cleanTitleForSearch('Song feat. Someone Else', 'Unknown Artist'))
        .toBe('Song');
    });
  });

  describe('underscore replacement', () => {
    it('replaces underscores with spaces', () => {
      expect(cleanTitleForSearch('Lost_Umbrella', 'Unknown Artist'))
        .toBe('Lost Umbrella');
    });
  });

  describe('combined patterns', () => {
    it('handles complex YouTube title: artist prefix + official video + feat', () => {
      expect(cleanTitleForSearch(
        'Lil Peep - Belgium (Official Video) ft. Someone',
        'Lil Peep'
      )).toBe('Belgium');
    });

    it('handles Nightcore with lyrics and brackets', () => {
      expect(cleanTitleForSearch(
        'Nightcore - Sorry (Lyrics) [HD]',
        'Some Channel'
      )).toBe('Sorry');
    });

    it('handles Japanese with CJK brackets and underscores', () => {
      const result = cleanTitleForSearch(
        '【Emotional】Song_Name (Official Video)',
        'Unknown Artist'
      );
      expect(result).toBe('Song Name');
    });

    it('returns original title if cleaning strips everything', () => {
      expect(cleanTitleForSearch('(Official Video)', 'Unknown Artist'))
        .toBe('(Official Video)');
    });
  });
});
