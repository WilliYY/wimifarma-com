export function geminiGenerationConfig(
  model: string,
  maxOutputTokens: number,
  temperature: number,
  thinkingBudget: number,
) {
  if (model.replace(/^models\//, '') === 'gemini-3.5-flash-lite') {
    return {
      maxOutputTokens,
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    };
  }
  return {
    temperature,
    maxOutputTokens,
    thinkingConfig: { thinkingBudget },
  };
}
