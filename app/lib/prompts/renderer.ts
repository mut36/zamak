const TEMPLATE_VARIABLE = /\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g;

export function renderPromptTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  const missingVariables = new Set<string>();

  const rendered = template.replace(TEMPLATE_VARIABLE, (_, name: string) => {
    const value = variables[name];
    if (value === undefined) {
      missingVariables.add(name);
      return '';
    }
    return value;
  });

  if (missingVariables.size > 0) {
    throw new Error(
      `Missing prompt variables: ${Array.from(missingVariables).join(', ')}`,
    );
  }

  return rendered.replace(/\n{3,}/g, '\n\n').trim();
}
