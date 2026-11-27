/** The disposable runner and test admission share one explicit selection. */
export const registrationSelection = {
  script:'test:local-registration',
  command:'node --import tsx tests/registration/run-disposable.ts',
  files:['tests/registration/registration-journey.test.ts'],
} as const

export function registrationTestArguments():string[] {
  return ['--import', 'tsx', '--test', ...registrationSelection.files]
}
