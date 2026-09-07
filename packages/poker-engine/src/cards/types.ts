export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
export type Rank = (typeof RANKS)[number];

export type Card = Readonly<{ suit: Suit; rank: Rank }>;

export const rankName = (rank: Rank): string => {
  if (rank <= 10) return String(rank);
  switch (rank) {
    case 11: return 'J';
    case 12: return 'Q';
    case 13: return 'K';
    case 14: return 'A';
    default: throw new Error('Invalid rank');
  }
};

export const cardKey = (card: Card): string => `${rankName(card.rank)}${card.suit[0]?.toUpperCase() ?? ''}`;
