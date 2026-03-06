import { checkTests } from '../src/checks/empty-tests';
import { DiffFile } from '../src/types';

describe('checkTests — Python', () => {
  test('flags test with no assertions', () => {
    const file: DiffFile = {
      filename: 'test_auth.py',
      status: 'modified',
      additions: 10,
      deletions: 0,
      content: `
def test_user_login():
    user = User("test@test.com", "password123")
    result = user.login()
    # no assertion here!

def test_user_logout():
    user = User("test@test.com", "password123")
    user.login()
    user.logout()
`,
    };

    const result = checkTests(file, 'python');
    expect(result.issues.length).toBe(2);
    expect(result.issues[0].type).toBe('empty-test');
    expect(result.issues[0].message).toContain('test_user_login');
  });

  test('flags tautological assertions', () => {
    const file: DiffFile = {
      filename: 'test_math.py',
      status: 'modified',
      additions: 5,
      deletions: 0,
      content: `
def test_addition():
    result = add(1, 2)
    assert True

def test_subtraction():
    result = subtract(5, 3)
    assert 1 == 1
`,
    };

    const result = checkTests(file, 'python');
    expect(result.issues.length).toBe(2);
    expect(result.issues.every(i => i.type === 'tautological-test')).toBe(true);
  });

  test('passes valid tests', () => {
    const file: DiffFile = {
      filename: 'test_math.py',
      status: 'modified',
      additions: 5,
      deletions: 0,
      content: `
def test_addition():
    result = add(1, 2)
    assert result == 3

def test_subtraction():
    result = subtract(5, 3)
    assert result == 2
`,
    };

    const result = checkTests(file, 'python');
    expect(result.issues.length).toBe(0);
  });

  test('skips stub tests with pass', () => {
    const file: DiffFile = {
      filename: 'test_future.py',
      status: 'modified',
      additions: 2,
      deletions: 0,
      content: `
def test_not_implemented():
    pass
`,
    };

    const result = checkTests(file, 'python');
    expect(result.issues.length).toBe(0);
  });
});

describe('checkTests — JavaScript', () => {
  test('flags tautological expect', () => {
    const file: DiffFile = {
      filename: 'auth.test.js',
      status: 'modified',
      additions: 5,
      deletions: 0,
      content: `
test('user can login', () => {
  const user = new User('test@test.com');
  const result = user.login();
  expect(true).toBe(true);
});
`,
    };

    const result = checkTests(file, 'javascript');
    expect(result.issues.length).toBe(1);
    expect(result.issues[0].type).toBe('tautological-test');
  });

  test('passes valid JS tests', () => {
    const file: DiffFile = {
      filename: 'math.test.js',
      status: 'modified',
      additions: 5,
      deletions: 0,
      content: `
test('adds numbers', () => {
  const result = add(1, 2);
  expect(result).toBe(3);
});
`,
    };

    const result = checkTests(file, 'javascript');
    expect(result.issues.length).toBe(0);
  });
});
