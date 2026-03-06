import { extractPythonImports, extractJSImports, checkHallucinations, parsePythonDeps, parsePackageJson } from '../src/checks/hallucination';
import { DiffFile } from '../src/types';

describe('extractPythonImports', () => {
  test('extracts import statements', () => {
    const code = `
import os
import numpy
from pandas import DataFrame
from sklearn.model_selection import train_test_split
import json
`;
    const imports = extractPythonImports(code);
    expect(imports.length).toBe(5);
    expect(imports[0].module).toBe('os');
    expect(imports[1].module).toBe('numpy');
    expect(imports[2].module).toBe('pandas');
    expect(imports[3].module).toBe('sklearn');
    expect(imports[4].module).toBe('json');
  });
});

describe('extractJSImports', () => {
  test('extracts ES imports', () => {
    const code = `
import React from 'react';
import { useState } from 'react';
import axios from 'axios';
import { Client } from '@notionhq/client';
import './styles.css';
`;
    const imports = extractJSImports(code);
    // Should skip relative import ./styles.css
    expect(imports.length).toBe(4);
    expect(imports[0].module).toBe('react');
    expect(imports[2].module).toBe('axios');
    expect(imports[3].module).toBe('@notionhq/client');
  });

  test('extracts require statements', () => {
    const code = `
const fs = require('fs');
const express = require('express');
const { join } = require('path');
const helper = require('./helper');
`;
    const imports = extractJSImports(code);
    // Should skip relative require and node builtins are still extracted (filtered later)
    expect(imports.some(i => i.module === 'express')).toBe(true);
  });
});

describe('checkHallucinations', () => {
  test('flags imports not in dependencies', () => {
    const file: DiffFile = {
      filename: 'app.py',
      status: 'modified',
      additions: 5,
      deletions: 0,
      content: `
import os
import numpy
from pandas import DataFrame
from fake_package import something
`,
    };

    const deps = new Set(['numpy']);
    const result = checkHallucinations(file, 'python', deps);

    // os is stdlib (skip), numpy is in deps (skip), pandas and fake_package are not
    expect(result.issues.length).toBe(2);
    expect(result.issues[0].message).toContain('pandas');
    expect(result.issues[1].message).toContain('fake_package');
  });

  test('allows all stdlib imports', () => {
    const file: DiffFile = {
      filename: 'utils.py',
      status: 'modified',
      additions: 3,
      deletions: 0,
      content: `
import os
import json
import pathlib
import sys
from collections import defaultdict
`,
    };

    const result = checkHallucinations(file, 'python', new Set());
    expect(result.issues.length).toBe(0);
  });
});

describe('parsePythonDeps', () => {
  test('parses requirements.txt', () => {
    const content = `
numpy==1.24.0
pandas>=2.0
scikit-learn[extra]
# comment
flask
`;
    const deps = parsePythonDeps(content);
    expect(deps.has('numpy')).toBe(true);
    expect(deps.has('pandas')).toBe(true);
    expect(deps.has('scikit_learn')).toBe(true); // normalized
    expect(deps.has('flask')).toBe(true);
  });
});

describe('parsePackageJson', () => {
  test('parses dependencies', () => {
    const content = JSON.stringify({
      dependencies: { 'react': '^18.0', 'axios': '^1.0' },
      devDependencies: { 'jest': '^29.0', '@types/node': '^20.0' },
    });
    const deps = parsePackageJson(content);
    expect(deps.has('react')).toBe(true);
    expect(deps.has('axios')).toBe(true);
    expect(deps.has('jest')).toBe(true);
    expect(deps.has('@types/node')).toBe(true);
  });
});
