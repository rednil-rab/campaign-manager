import { DomainError } from './actions';

export interface RollResult {
  dice: string;
  rolls: number[];
  modifier: number;
  total: number;
  /** Human-readable, e.g. "2d6+1 → 9 (3, 5, +1)". */
  text: string;
}

const DICE = /^(\d{0,2})d(\d{1,4})([+-]\d{1,4})?$/;

/**
 * Rolls dice written like "d20", "2d6+3" or "1d8-1".
 * `randomInt(n)` must return a whole number from 0 to n - 1; it is injected so the domain stays pure.
 */
export function rollDice(spec: string, randomInt: (n: number) => number): RollResult {
  const dice = spec.replace(/\s+/g, '').toLowerCase();
  const match = DICE.exec(dice);
  if (!match) throw new DomainError('Dice must look like d20, 2d6 or 1d8+3');
  const count = match[1] === '' ? 1 : Number(match[1]);
  const sides = Number(match[2]);
  const modifier = match[3] ? Number(match[3]) : 0;
  if (count < 1 || count > 20) throw new DomainError('Roll between 1 and 20 dice');
  if (sides < 2 || sides > 1000) throw new DomainError('Dice need between 2 and 1000 sides');

  const rolls = Array.from({ length: count }, () => randomInt(sides) + 1);
  const total = rolls.reduce((sum, r) => sum + r, 0) + modifier;
  const parts = [...rolls.map(String), ...(modifier ? [modifier > 0 ? `+${modifier}` : String(modifier)] : [])];
  return { dice, rolls, modifier, total, text: `${dice} → ${total} (${parts.join(', ')})` };
}
