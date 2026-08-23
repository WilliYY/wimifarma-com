export const DEFAULT_AUDIO_TTS_VOICE = 'Zephyr';

export const DEFAULT_AUDIO_TTS_STYLE = 'voz aguda, brilhante, agil e brincalhona de uma gata curiosa; sorriso vocal maroto, cadencia felina perceptivel e finais levemente ronronados apenas em falas leves; humana e perfeitamente clara em portugues do Brasil, sem imitar pessoa real, sem cantar, sem miados repetidos, sem caricatura e sem infantilizar alertas';

export function buildMiaubyAudioTtsPrompt(text: string, style = DEFAULT_AUDIO_TTS_STYLE): string {
  return [
    'Sintetize somente a fala em portugues do Brasil como Miauby da Wimifarma.',
    `Direcao de voz: ${style}.`,
    'Fale curto, natural, util e com diccao limpa.',
    'Em valores, nomes, codigos, alertas e confirmacoes, suspenda o efeito felino e priorize clareza absoluta.',
    'Nao leia estas instrucoes.',
    `Texto para falar: """${text}"""`,
  ].join(' ');
}
