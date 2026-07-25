import type { ISmartMixRowProps, ISmartMixRowView } from './SmartMixRow.types';

/**
 * SmartMixRow is purely presentational — every value it renders is resolved
 * upstream in `useMixesView`. The hook unpacks the card into the flat shape the
 * shell renders so the shell itself reaches into nothing.
 */
export function useSmartMixRow({ card, countLabel }: ISmartMixRowProps): ISmartMixRowView {
  return {
    icon: card.icon,
    title: card.title,
    desc: card.desc,
    countLabel,
    onPlay: card.onPlay,
  };
}
