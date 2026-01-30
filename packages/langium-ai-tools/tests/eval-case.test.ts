/**
 * Test the YAML loading of cases
 */

import { describe, expect, test } from "vitest";
import { loadFromYaml } from "../src/evaluator/eval-case.js";

describe("Evaluation Case YAML Loading", () => {
  test("Load eval cases from YAML", () => {
    const yamlContent = `
eval_cases:
  - name: "Test Case 1"
    prompt: "What is the capital of France?"
    expected_response: "The capital of France is Paris."
    history:
      - role: "user"
        content: "Tell me about France."
    tags:
      - "geography"
      - "capital cities"
    only_check_codeblocks: true

  - name: "Test Case 2"
    prompt: "Write a Python function to add two numbers."
    expected_response: |
      \`\`\`python
      def add(a, b):
          return a + b
      \`\`\`
    tags:
      - "programming"
      - "python"
`;

    const evalCases = loadFromYaml(yamlContent);
    expect(evalCases.length).toBe(2);

    expect(evalCases[0]).toEqual({
      name: "Test Case 1",
      prompt: "What is the capital of France?",
      expected_response: "The capital of France is Paris.",
      history: [{ role: "user", content: "Tell me about France." }],
      tags: ["geography", "capital cities"],
      only_check_codeblocks: true
    });

    expect(evalCases[1]).toEqual({
      name: "Test Case 2",
      history: undefined,
      prompt: "Write a Python function to add two numbers.",
      only_check_codeblocks: undefined,
      expected_response: "```python\ndef add(a, b):\n    return a + b\n```\n",
      tags: ["programming", "python"]
    });
  });
});
