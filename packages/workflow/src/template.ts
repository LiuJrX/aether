export class TemplateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TemplateError"
  }
}

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g

export function renderTemplate(
  template: string,
  variables: Record<string, unknown>
): string {
  return template.replace(VARIABLE_PATTERN, (match, variableName: string) => {
    if (!(variableName in variables)) {
      const provided = Object.keys(variables).sort().join(", ") || "(none)"
      throw new TemplateError(
        `Variable "${match}" is not defined.\nProvided variables: ${provided}`
      )
    }

    const value = variables[variableName]
    return typeof value === "string" ? value : String(value)
  })
}
