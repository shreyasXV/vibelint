import { parsePyprojectToml } from '../src/checks/hallucination';

describe('parsePyprojectToml', () => {
  test('parses [tool.poetry.dependencies]', () => {
    const content = `
[tool.poetry]
name = "myproject"

[tool.poetry.dependencies]
python = "^3.9"
numpy = "^1.24"
pandas = ">=2.0"
scikit-learn = {version = "^1.3", optional = true}
`;
    const deps = parsePyprojectToml(content);
    expect(deps.has('numpy')).toBe(true);
    expect(deps.has('pandas')).toBe(true);
    expect(deps.has('scikit_learn')).toBe(true);
  });

  test('parses [project] dependencies array', () => {
    const content = `
[project]
name = "myproject"
dependencies = [
    "numpy>=1.24",
    "pandas",
    "flask>=2.0",
]
`;
    const deps = parsePyprojectToml(content);
    expect(deps.has('numpy')).toBe(true);
    expect(deps.has('pandas')).toBe(true);
    expect(deps.has('flask')).toBe(true);
  });

  test('handles inline dependencies array', () => {
    const content = `
[project]
name = "myproject"
dependencies = ["numpy>=1.24", "pandas"]
`;
    const deps = parsePyprojectToml(content);
    expect(deps.has('numpy')).toBe(true);
    expect(deps.has('pandas')).toBe(true);
  });
});
