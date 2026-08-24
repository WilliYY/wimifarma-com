import {
  parseCotacaoEncomendasCommand,
  type CotacaoEncomendasCommand,
} from './cotacao-command.js';

export type PreSemanticRoute =
  | { kind: 'missing_prefix' }
  | { kind: 'cotacao_encomendas'; command: CotacaoEncomendasCommand }
  | { kind: 'semantic' };

export function choosePreSemanticRoute(message: string, missingPrefixHelpOnly: boolean): PreSemanticRoute {
  const command = parseCotacaoEncomendasCommand(message);
  if (command) return { kind: 'cotacao_encomendas', command };
  if (missingPrefixHelpOnly) return { kind: 'missing_prefix' };
  return { kind: 'semantic' };
}

export type ConfirmationPath<TDecision, TPending> =
  | { kind: 'not_confirmation' }
  | { kind: 'conversation' }
  | { kind: 'strong_confirmation'; decision: TDecision; pending: TPending };

export function chooseConfirmationPath<TDecision, TPending>(
  decision: TDecision | null,
  pending: TPending | null,
): ConfirmationPath<TDecision, TPending> {
  if (!decision) return { kind: 'not_confirmation' };
  if (!pending) return { kind: 'conversation' };
  return { kind: 'strong_confirmation', decision, pending };
}
