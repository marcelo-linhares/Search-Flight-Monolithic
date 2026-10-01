// Três "projects" Jest isolados — rodam com flags diferentes
// unit:        jest --selectProjects unit        (rápido, sem setup)
// integration: jest --selectProjects integration (in-memory, sem DB)
// stage:       jest --selectProjects stage       (servidor + DB + mocks)

module.exports = {
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
      testEnvironment: 'node',
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      testEnvironment: 'node',
      globalSetup: './tests/integration/setup.js',
    },
    {
      displayName: 'stage',
      testMatch: ['<rootDir>/tests/stage/**/*.test.js'],
      testEnvironment: 'node',
      globalSetup:    './tests/stage/setup.js',
      globalTeardown: './tests/stage/teardown.js',
      testTimeout: 30000, // stage pode ser mais lento
    },
  ],
  collectCoverageFrom: ['src/**/*.js'],
  coverageThresholds: {
    global: { branches: 80, functions: 85, lines: 85 },
  },
};