export type PollVisibility = 'always' | 'after_vote' | 'after_close' | 'hidden';
export type PollSelection = 'single' | 'multiple';

export interface PollRules {
  selection: PollSelection;
  minChoices: number;
  maxChoices: number;
  opensAt?: string | null;
  closesAt?: string | null;
  closedManually?: boolean;
  visibility: PollVisibility;
}

export function assertPollOpen(rules: PollRules, now = new Date()): void {
  if (rules.closedManually) throw new Error('A enquete foi encerrada.');
  if (rules.opensAt && now < new Date(rules.opensAt)) throw new Error('A enquete ainda não está aberta.');
  if (rules.closesAt && now > new Date(rules.closesAt)) throw new Error('A enquete está encerrada.');
}

export function assertChoices(rules: PollRules, choices: string[], validIds: string[]): void {
  if (new Set(choices).size !== choices.length) throw new Error('Há alternativas repetidas.');
  if (choices.some((choice) => !validIds.includes(choice))) throw new Error('Alternativa inválida.');
  const min = rules.selection === 'single' ? 1 : rules.minChoices;
  const max = rules.selection === 'single' ? 1 : rules.maxChoices;
  if (choices.length < min || choices.length > max) {
    throw new Error('Quantidade de alternativas incompatível com a enquete.');
  }
}

export function canSeeResults(input: {
  visibility: PollVisibility;
  hasVoted: boolean;
  closed: boolean;
  management: boolean;
}): boolean {
  if (input.management) return true;
  switch (input.visibility) {
    case 'always':
      return true;
    case 'after_vote':
      return input.hasVoted;
    case 'after_close':
      return input.closed;
    case 'hidden':
      return false;
    default:
      return false;
  }
}
