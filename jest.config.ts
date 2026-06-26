import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["**/__tests__/**/*.test.ts", "**/tests/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
};

export default config;
